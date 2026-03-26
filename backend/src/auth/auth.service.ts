import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHmac, timingSafeEqual } from 'crypto';
import { RsvpService } from '../rsvp/rsvp.service';

const ALLOWED_REDIRECTS = new Set(['/home', '/tutorial']);

const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly jwtSecret: string;

  private readonly authorizeUrl =
    'https://auth.hackclub.com/oauth/authorize';
  private readonly tokenUrl = 'https://auth.hackclub.com/oauth/token';
  private readonly userinfoUrl = 'https://auth.hackclub.com/oauth/userinfo';

  // Standard OIDC scopes + Hack Club custom scopes
  private readonly scopes = [
    'openid',
    'email',
    'name',
    'profile',
    'birthdate',
    'address',
    'verification_status',
    'slack_id',
    'basic_info',
  ].join(' ');

  constructor(
    private configService: ConfigService,
    private jwtService: JwtService,
    private rsvpService: RsvpService,
  ) {
    this.clientId = this.configService.getOrThrow('CLIENT_ID');
    this.clientSecret = this.configService.getOrThrow('CLIENT_SECRET');
    this.redirectUri = this.configService.get(
      'REDIRECT_URI',
      'http://localhost:5173/oauth/callback',
    );
    this.jwtSecret = this.configService.getOrThrow('JWT_SECRET');
  }

  /**
   * HMAC-signs a state value so the backend can verify on callback
   * that it issued the state — without trusting the proxy layer.
   */
  private signState(state: string): string {
    return createHmac('sha256', this.jwtSecret).update(state).digest('hex');
  }

  /**
   * Generates the OAuth state and authorization URL.
   * The state sent to Hack Club is `UUID.HMAC` (signed).
   * The proxy stores the raw UUID in an httpOnly cookie.
   */
  startAuth(email?: string): { url: string; state: string } {
    const state = crypto.randomUUID();
    const signature = this.signState(state);
    const signedState = `${state}.${signature}`;

    // Validate email format before using as login_hint
    const sanitizedEmail =
      email && EMAIL_RE.test(email.trim()) ? email.trim() : undefined;

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: this.scopes,
      state: signedState,
    });

    if (sanitizedEmail) {
      params.set('login_hint', sanitizedEmail);
    }

    return {
      url: `${this.authorizeUrl}?${params.toString()}`,
      state,
    };
  }

  /**
   * Handles the full OAuth callback:
   *  1. Verifies state via HMAC + constant-time comparison
   *  2. Exchanges authorization code for tokens
   *  3. Fetches user info from Hack Club
   *  4. Submits RSVP
   *  5. Returns JWT + redirect path
   */
  async handleCallback(
    code: string,
    returnedSignedState: string,
    cookieState: string,
  ): Promise<{ token: string; redirectTo: string }> {
    // 1. Verify state
    const dotIndex = returnedSignedState.lastIndexOf('.');
    if (dotIndex === -1) {
      throw new Error('Malformed state parameter');
    }

    const stateValue = returnedSignedState.substring(0, dotIndex);
    const signature = returnedSignedState.substring(dotIndex + 1);

    // Constant-time comparison: cookie state vs state from OAuth callback
    const stateBuffer = Buffer.from(stateValue);
    const cookieBuffer = Buffer.from(cookieState);
    if (
      stateBuffer.length !== cookieBuffer.length ||
      !timingSafeEqual(stateBuffer, cookieBuffer)
    ) {
      throw new Error('State mismatch');
    }

    // Verify HMAC — proves this backend issued the state
    const expectedSignature = this.signState(stateValue);
    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);
    if (
      sigBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(sigBuffer, expectedBuffer)
    ) {
      throw new Error('Invalid state signature');
    }

    // 2. Exchange code for tokens
    const tokenResponse = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });

    if (!tokenResponse.ok) {
      this.logger.error(`Token exchange failed: ${tokenResponse.status}`);
      throw new Error('Token exchange failed');
    }

    const tokens = await tokenResponse.json();

    // 3. Fetch user info
    const userinfoResponse = await fetch(this.userinfoUrl, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userinfoResponse.ok) {
      this.logger.error('Failed to fetch user info');
      throw new Error('Failed to fetch user info');
    }

    const userinfo = await userinfoResponse.json();

    // 4. Submit RSVP using the HCA-validated email — never the user-entered one
    let redirectTo = '/home';

    try {
      const rsvpResult = await this.rsvpService.createRsvp(userinfo.email);
      redirectTo = rsvpResult.existing ? '/home' : '/tutorial';
    } catch (err) {
      this.logger.error(
        `RSVP submission failed for user ${userinfo.sub}: ${err}`,
      );
      // Auth succeeded — don't block the user over a failed RSVP
    }

    // Validate redirectTo against allowlist
    if (!ALLOWED_REDIRECTS.has(redirectTo)) {
      redirectTo = '/home';
    }

    // 5. Sign JWT with user's own claims (visible only to them)
    const token = this.jwtService.sign({
      sub: userinfo.sub,
      email: userinfo.email,
      name: userinfo.name,
      nickname: userinfo.nickname,
      birthdate: userinfo.birthdate,
      address: userinfo.address,
      slack_id: userinfo.slack_id,
      verification_status: userinfo.verification_status,
    });

    return { token, redirectTo };
  }

  verifyToken(token: string): Record<string, unknown> {
    return this.jwtService.verify(token);
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { fetchWithTimeout } from '../fetch.util';
import { RsvpService } from '../rsvp/rsvp.service';
import { User } from '../entities/user.entity';
import { Session } from '../entities/session.entity';

const ALLOWED_REDIRECTS = new Set(['/home', '/tutorial']);

const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

const REFRESH_TOKEN_EXPIRY_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

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
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(Session)
    private sessionRepo: Repository<Session>,
  ) {
    this.clientId = this.configService.getOrThrow('CLIENT_ID');
    this.clientSecret = this.configService.getOrThrow('CLIENT_SECRET');
    this.redirectUri = this.configService.get(
      'REDIRECT_URI',
      'http://localhost:5173/oauth/callback',
    );
    this.jwtSecret = this.configService.getOrThrow('JWT_SECRET');
  }

  private signState(state: string): string {
    return createHmac('sha256', this.jwtSecret)
      .update(`hca:${state}`)
      .digest('hex');
  }

  startAuth(email?: string): { url: string; state: string } {
    const state = crypto.randomUUID();
    const signature = this.signState(state);
    const signedState = `${state}.${signature}`;

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

  async handleCallback(
    code: string,
    returnedSignedState: string,
    cookieState: string,
  ): Promise<{ token: string; refreshToken: string; redirectTo: string }> {
    // 1. Verify state
    const dotIndex = returnedSignedState.lastIndexOf('.');
    if (dotIndex === -1) {
      throw new Error('Malformed state parameter');
    }

    const stateValue = returnedSignedState.substring(0, dotIndex);
    const signature = returnedSignedState.substring(dotIndex + 1);

    const stateBuffer = Buffer.from(stateValue);
    const cookieBuffer = Buffer.from(cookieState);
    if (
      stateBuffer.length !== cookieBuffer.length ||
      !timingSafeEqual(stateBuffer, cookieBuffer)
    ) {
      throw new Error('State mismatch');
    }

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
    const tokenResponse = await fetchWithTimeout(this.tokenUrl, {
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

    const tokens = await tokenResponse.json().catch(() => null);
    if (!tokens?.access_token) {
      throw new Error('Invalid token response');
    }

    // 3. Fetch user info
    const userinfoResponse = await fetchWithTimeout(this.userinfoUrl, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userinfoResponse.ok) {
      this.logger.error('Failed to fetch user info');
      throw new Error('Failed to fetch user info');
    }

    const userinfo = await userinfoResponse.json().catch(() => null);
    if (!userinfo?.sub) {
      throw new Error('Invalid userinfo response');
    }

    // 4. Upsert user in DB
    const user = await this.upsertUser(userinfo);

    // 4b. Check if user is banned
    try {
      const perms = await this.rsvpService.getPerms(userinfo.email);
      if (perms === 'Banned') {
        return {
          token: '',
          refreshToken: '',
          redirectTo: 'https://fraud.hackclub.com/',
        };
      }
    } catch (err) {
      this.logger.error(`Perms check failed for ${userinfo.sub}: ${err}`);
    }

    // 5. Submit RSVP
    let redirectTo = '/home';
    try {
      const rsvpResult = await this.rsvpService.createRsvp(userinfo.email);
      redirectTo = rsvpResult.existing ? '/home' : '/tutorial';
    } catch (err) {
      this.logger.error(
        `RSVP submission failed for user ${userinfo.sub}: ${err}`,
      );
    }

    if (!ALLOWED_REDIRECTS.has(redirectTo)) {
      redirectTo = '/home';
    }

    // 6. Create session with refresh token
    const refreshToken = await this.createSession(user.id);

    // 7. Sign JWT — no PII beyond what's needed for display + auth checks
    const token = this.jwtService.sign({
      sub: userinfo.sub,
      uid: user.id,
      email: userinfo.email,
      name: userinfo.name,
      nickname: userinfo.nickname,
      slack_id: userinfo.slack_id,
      has_address: user.hasAddress,
      has_birthdate: user.hasBirthdate,
    });

    return { token, refreshToken, redirectTo };
  }

  /**
   * Validates a refresh token, rotates it, and issues a new JWT.
   */
  async refreshAuth(
    refreshToken: string,
  ): Promise<{ token: string; refreshToken: string }> {
    const hash = createHash('sha256').update(refreshToken).digest('hex');
    const session = await this.sessionRepo.findOne({
      where: { refreshTokenHash: hash },
      relations: ['user'],
    });

    if (!session || session.expiresAt < new Date()) {
      if (session) await this.sessionRepo.remove(session);
      throw new Error('Invalid or expired refresh token');
    }

    const user = session.user;

    // Rotate: delete old session, create new one
    await this.sessionRepo.remove(session);
    const newRefreshToken = await this.createSession(user.id);

    const token = this.jwtService.sign({
      sub: user.hcaSub,
      uid: user.id,
      email: user.email,
      name: user.name,
      nickname: user.nickname,
      slack_id: user.slackId,
      has_address: user.hasAddress,
      has_birthdate: user.hasBirthdate,
    });

    return { token, refreshToken: newRefreshToken };
  }

  /**
   * Invalidates a refresh token (logout).
   */
  async invalidateSession(refreshToken: string): Promise<void> {
    const hash = createHash('sha256').update(refreshToken).digest('hex');
    await this.sessionRepo.delete({ refreshTokenHash: hash });
  }

  verifyToken(token: string): Record<string, unknown> {
    return this.jwtService.verify(token);
  }

  /**
   * Issues a JWT that lets an admin act as the target user.
   * The token carries the target user's identity but includes
   * impersonator_uid / impersonator_name so audit logs can attribute actions.
   */
  async issueImpersonationToken(
    targetUserId: string,
    adminUid: string,
    adminName: string,
  ): Promise<{ token: string }> {
    const user = await this.userRepo.findOne({ where: { id: targetUserId } });
    if (!user) throw new Error('User not found');

    const token = this.jwtService.sign({
      sub: user.hcaSub,
      uid: user.id,
      email: user.email,
      name: user.name,
      nickname: user.nickname,
      slack_id: user.slackId,
      has_address: user.hasAddress,
      has_birthdate: user.hasBirthdate,
      impersonator_uid: adminUid,
      impersonator_name: adminName,
    });

    return { token };
  }

  async updateNickname(
    userId: string,
    nickname: string,
  ): Promise<{ token: string }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    user.nickname = nickname;
    await this.userRepo.save(user);

    const token = this.jwtService.sign({
      sub: user.hcaSub,
      uid: user.id,
      email: user.email,
      name: user.name,
      nickname: user.nickname,
      slack_id: user.slackId,
      has_address: user.hasAddress,
      has_birthdate: user.hasBirthdate,
    });

    return { token };
  }

  private async upsertUser(userinfo: Record<string, any>): Promise<User> {
    const hasAddress = !!(
      userinfo.address ||
      (Array.isArray(userinfo.addresses) && userinfo.addresses.length > 0)
    );
    const hasBirthdate = !!(
      userinfo.birthdate && userinfo.birthdate.trim() !== ''
    );

    let user = await this.userRepo.findOne({
      where: { hcaSub: userinfo.sub },
    });

    if (user) {
      user.email = userinfo.email;
      user.name = userinfo.name;
      user.nickname = userinfo.nickname;
      user.slackId = userinfo.slack_id;
      user.hasAddress = hasAddress;
      user.hasBirthdate = hasBirthdate;
      return this.userRepo.save(user);
    }

    // New user — attempt insert. If a concurrent request already inserted
    // this hca_sub, catch the unique constraint violation and update instead.
    try {
      user = this.userRepo.create({
        hcaSub: userinfo.sub,
        email: userinfo.email,
        name: userinfo.name,
        nickname: userinfo.nickname,
        slackId: userinfo.slack_id,
        hasAddress,
        hasBirthdate,
      });
      return await this.userRepo.save(user);
    } catch (err: any) {
      if (err?.code === '23505') {
        // Unique violation — the other request won the insert race
        user = await this.userRepo.findOne({
          where: { hcaSub: userinfo.sub },
        });
        if (!user) throw err; // shouldn't happen, but safety net
        user.email = userinfo.email;
        user.name = userinfo.name;
        user.nickname = userinfo.nickname;
        user.slackId = userinfo.slack_id;
        user.hasAddress = hasAddress;
        user.hasBirthdate = hasBirthdate;
        return this.userRepo.save(user);
      }
      throw err;
    }
  }

  private async createSession(userId: string): Promise<string> {
    const refreshToken = randomBytes(48).toString('base64url');
    const hash = createHash('sha256').update(refreshToken).digest('hex');

    const session = this.sessionRepo.create({
      userId,
      refreshTokenHash: hash,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS),
    });
    await this.sessionRepo.save(session);

    return refreshToken;
  }
}

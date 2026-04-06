import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHmac, timingSafeEqual } from 'crypto';
import { IsNull } from 'typeorm';
import { fetchWithTimeout } from '../fetch.util';
import { User } from '../entities/user.entity';
import { Session } from '../entities/session.entity';
import { AuditLogService } from '../audit-log/audit-log.service';
import { RsvpService } from '../rsvp/rsvp.service';

@Injectable()
export class HackatimeService implements OnModuleInit {
  private readonly logger = new Logger(HackatimeService.name);
  private readonly clientId: string | undefined;
  private readonly clientSecret: string | undefined;
  private readonly redirectUri: string;
  private readonly jwtSecret: string;
  private readonly baseUrl: string;
  private readonly configured: boolean;

  constructor(
    private configService: ConfigService,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(Session)
    private sessionRepo: Repository<Session>,
    private auditLogService: AuditLogService,
    private rsvpService: RsvpService,
  ) {
    this.clientId = this.configService.get('HACKATIME_CLIENT_ID');
    this.clientSecret = this.configService.get('HACKATIME_CLIENT_SECRET');
    this.redirectUri = this.configService.get(
      'HACKATIME_REDIRECT_URI',
      'http://localhost:5173/auth/hackatime/callback',
    );
    this.jwtSecret = this.configService.getOrThrow('JWT_SECRET');
    this.baseUrl = this.configService.get(
      'HACKATIME_BASE_URL',
      'https://hackatime.hackclub.com',
    );
    this.configured = !!(this.clientId && this.clientSecret);
    if (!this.configured) {
      this.logger.warn('HACKATIME_CLIENT_ID/SECRET not set — Hackatime OAuth disabled');
    }
  }

  private assertConfigured(): void {
    if (!this.configured) {
      throw new Error('Hackatime OAuth is not configured');
    }
  }

  private signState(state: string): string {
    // Prefix with flow name to prevent cross-flow state confusion with HCA OAuth
    return createHmac('sha256', this.jwtSecret)
      .update(`hackatime:${state}`)
      .digest('hex');
  }

  startAuth(): { url: string; state: string } {
    this.assertConfigured();

    const state = crypto.randomUUID();
    const signature = this.signState(state);
    const signedState = `${state}.${signature}`;

    const params = new URLSearchParams({
      client_id: this.clientId!,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'profile read',
      state: signedState,
    });

    return {
      url: `${this.baseUrl}/oauth/authorize?${params.toString()}`,
      state,
    };
  }

  async handleCallback(
    code: string,
    returnedSignedState: string,
    cookieState: string,
    userId: string,
    impersonatorName?: string,
  ): Promise<{ success: boolean; redirectTo: string }> {
    this.assertConfigured();

    // 1. Verify state (same HMAC pattern as HCA OAuth)
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
    const tokenResponse = await fetchWithTimeout(`${this.baseUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri,
        client_id: this.clientId!,
        client_secret: this.clientSecret!,
      }),
    });

    if (!tokenResponse.ok) {
      this.logger.error(
        `Hackatime token exchange failed: ${tokenResponse.status}`,
      );
      throw new Error('Hackatime token exchange failed');
    }

    const tokens = await tokenResponse.json().catch(() => null);

    if (!tokens?.access_token) {
      this.logger.error('Hackatime token response missing or malformed');
      throw new Error('Invalid token response from Hackatime');
    }

    // 3. Check if the user is banned on Hackatime + grab their Hackatime user ID
    let hackatimeUid: string | null = null;
    try {
      const meRes = await fetchWithTimeout(
        `${this.baseUrl}/api/v1/authenticated/me`,
        { headers: { Authorization: `Bearer ${tokens.access_token}` } },
      );
      if (meRes.ok) {
        const meData = await meRes.json();
        hackatimeUid = meData?.id?.toString() ?? meData?.user_id?.toString() ?? null;
        if (meData?.trust_factor?.trust_level === 'red') {
          this.logger.warn(`Hackatime-banned user attempted connection: ${userId}`);
          const user = await this.userRepo.findOne({ where: { hcaSub: userId } });
          if (user?.email) {
            await this.rsvpService.updatePerms(user.email, 'Banned');
            await this.sessionRepo.delete({ userId: user.id });
          }
          return { success: false, redirectTo: 'https://fraud.hackclub.com/' };
        }
      }
    } catch (err) {
      this.logger.error(`Hackatime ban check failed for ${userId}: ${err}`);
    }

    // 4. Persist the token (and Hackatime user ID) to the user's DB record
    // Use find+save (not update) so the column encryption transformer runs
    const user = await this.userRepo.findOne({ where: { hcaSub: userId } });
    if (!user) {
      throw new Error('User not found');
    }
    user.hackatimeToken = tokens.access_token;
    if (hackatimeUid) {
      user.hackatimeUserId = hackatimeUid;
    }
    await this.userRepo.save(user);
    this.logger.log(`Hackatime connected for user ${userId}`);

    await this.auditLogService.log(user.id, 'hackatime_connected', 'Connected Hackatime', impersonatorName);

    return { success: true, redirectTo: '/tutorial?stage=2' };
  }

  async isConnected(userId: string): Promise<boolean> {
    const user = await this.userRepo.findOne({
      where: { hcaSub: userId },
      select: ['hackatimeToken'],
    });
    return !!user?.hackatimeToken;
  }

  /**
   * Fetches the authenticated user's Hackatime project names.
   * Returns only the project name strings — no other data is exposed.
   */
  async getProjectNames(userId: string): Promise<string[]> {
    const user = await this.userRepo.findOne({
      where: { hcaSub: userId },
      select: ['hackatimeToken'],
    });

    if (!user?.hackatimeToken) {
      this.logger.warn(`No hackatime token found for user ${userId} (user found: ${!!user})`);
      return [];
    }

    try {
      const res = await fetchWithTimeout(
        `${this.baseUrl}/api/v1/authenticated/projects`,
        {
          headers: { Authorization: `Bearer ${user.hackatimeToken}` },
        },
      );

      if (!res.ok) {
        this.logger.warn(
          `Hackatime projects fetch failed (${res.status}) for user ${userId}`,
        );
        return [];
      }

      const data = await res.json();
      const projects: { name: string }[] = data?.projects ?? data?.data ?? [];

      if (!Array.isArray(projects)) return [];

      return projects
        .map((p) => (typeof p === 'string' ? p : p?.name))
        .filter((n): n is string => typeof n === 'string' && n.length > 0);
    } catch (err) {
      this.logger.error(`Hackatime projects fetch error for ${userId}: ${err}`);
      return [];
    }
  }

  /**
   * Fetches all-time stats from Hackatime and returns total hours
   * plus a per-project-name breakdown for the specified project names.
   * Single API call — no duplication.
   */
  async getHoursForProjects(
    userId: string,
    projectNames: string[],
  ): Promise<{ hours: number; perProject: Record<string, number> }> {
    if (projectNames.length === 0) {
      return { hours: 0, perProject: {} };
    }

    const user = await this.userRepo.findOne({
      where: { hcaSub: userId },
      select: ['hackatimeToken'],
    });

    if (!user?.hackatimeToken) {
      return { hours: 0, perProject: {} };
    }

    try {
      const res = await fetchWithTimeout(
        `${this.baseUrl}/api/v1/authenticated/projects`,
        {
          headers: { Authorization: `Bearer ${user.hackatimeToken}` },
        },
      );

      if (!res.ok) {
        this.logger.warn(
          `Hackatime stats fetch failed (${res.status}) for user ${userId}`,
        );
        return { hours: 0, perProject: {} };
      }

      const body = await res.json().catch(() => null);
      const projects: { name: string; total_seconds: number }[] =
        body?.projects ?? body?.data ?? [];

      if (!Array.isArray(projects)) {
        return { hours: 0, perProject: {} };
      }

      const nameSet = new Set(projectNames);
      let totalSeconds = 0;
      const perProject: Record<string, number> = {};

      for (const p of projects) {
        if (nameSet.has(p.name)) {
          const secs = p.total_seconds ?? 0;
          totalSeconds += secs;
          perProject[p.name] = Math.round((secs / 3600) * 10) / 10;
        }
      }

      return {
        hours: Math.round((totalSeconds / 3600) * 10) / 10,
        perProject,
      };
    } catch (err) {
      this.logger.error(`Hackatime stats fetch error for ${userId}: ${err}`);
      return { hours: 0, perProject: {} };
    }
  }

  /**
   * One-time backfill: for users who connected Hackatime before we started
   * storing the Hackatime user ID, fetch it via their stored OAuth token.
   */
  async onModuleInit() {
    const needsBackfill = await this.userRepo.find({
      where: { hackatimeUserId: IsNull() },
      select: ['id', 'hcaSub', 'hackatimeToken', 'hackatimeUserId'],
    }).then((users) => users.filter((u) => !!u.hackatimeToken));
    if (needsBackfill.length === 0) return;

    this.logger.log(`Backfilling Hackatime user IDs for ${needsBackfill.length} user(s)...`);

    for (const user of needsBackfill) {
      try {
        const res = await fetchWithTimeout(
          `${this.baseUrl}/api/v1/authenticated/me`,
          { headers: { Authorization: `Bearer ${user.hackatimeToken}` } },
        );
        if (!res.ok) {
          this.logger.warn(`Backfill: /me failed (${res.status}) for user ${user.hcaSub}`);
          continue;
        }
        const data = await res.json();
        const htId = data?.id?.toString() ?? data?.user_id?.toString() ?? null;
        if (htId) {
          user.hackatimeUserId = htId;
          await this.userRepo.save(user);
          this.logger.log(`Backfill: stored Hackatime user ID ${htId} for user ${user.hcaSub}`);
        }
      } catch (err) {
        this.logger.warn(`Backfill: error for user ${user.hcaSub}: ${err}`);
      }
    }
  }
}

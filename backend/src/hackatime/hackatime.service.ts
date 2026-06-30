import { ForbiddenException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHmac, timingSafeEqual } from 'crypto';
import { IsNull } from 'typeorm';
import { fetchWithTimeout } from '../fetch.util';
import { User } from '../entities/user.entity';
import { Session } from '../entities/session.entity';
import { AuditLogService } from '../audit-log/audit-log.service';
import { RsvpService } from '../rsvp/rsvp.service';

type OwnershipLookups =
  | {
      ok: true;
      emailOwnerId: string | null;
      linkedTrustLevel: string | null;
      linkedBanned: boolean;
      linkedEmails: string[];
    }
  | { ok: false; reason: string };

type OwnershipVerdict =
  | { kind: 'pass'; reason: string }
  | { kind: 'ban'; reason: string }
  | { kind: 'inconclusive' };

@Injectable()
export class HackatimeService implements OnModuleInit {
  private readonly logger = new Logger(HackatimeService.name);
  private readonly clientId: string | undefined;
  private readonly clientSecret: string | undefined;
  private readonly redirectUri: string;
  private readonly jwtSecret: string;
  private readonly baseUrl: string;
  private readonly adminApiKey: string | undefined;
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
    const rawAdminKey = this.configService.get<string>('HACKATIME_ADMIN_API_KEY');
    this.adminApiKey = rawAdminKey?.trim() || undefined;
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
        const d = meData?.data ?? meData;
        hackatimeUid = d?.id?.toString() ?? d?.user_id?.toString() ?? null;
        const trustData = d?.trust_factor ?? meData?.trust_factor;
        if (trustData?.trust_level === 'red') {
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

    if (user.email) {
      this.rsvpService.updateDateField(user.email, 'Loops - beestHackatimeSynched');
    }

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
   * Re-checks the stored Hackatime account's current trust/ban state, since the
   * connect-time check in handleCallback() is only a single snapshot. Catches
   * the ban-evasion pattern where a user routes a banned Hackatime account's
   * heartbeats into Beest (shared token, alt account, etc.).
   *
   * Only bans when the linked Hackatime account is itself banned / red-trust.
   * Owning a second (non-banned) Hackatime account is allowed: a bare
   * email/ID mismatch is treated as inconclusive and let through. When a ban
   * does fire, it marks the Beest user as Banned in Airtable + revokes their
   * sessions so the same pattern can't be retried without reconnecting.
   *
   * No-ops silently if the admin API key isn't configured (e.g. local dev).
   */
  async verifyAccountOwnership(hcaSub: string): Promise<void> {
    if (!this.adminApiKey) {
      this.logger.warn(
        `Hackatime admin key not set — skipping ownership check for ${hcaSub}`,
      );
      return;
    }

    const user = await this.userRepo.findOne({ where: { hcaSub } });
    if (!user) throw new ForbiddenException('User not found');
    if (!user.email) {
      throw new ForbiddenException('User has no email on file');
    }
    if (!user.hackatimeUserId) {
      throw new ForbiddenException(
        'Hackatime account not linked — please reconnect Hackatime before submitting a project.',
      );
    }

    const storedId = String(user.hackatimeUserId);
    const lookups = await this.fetchOwnershipLookups(user.email, storedId, hcaSub);
    if (!lookups.ok) {
      // Transient API issue — fail open, matches existing behavior.
      this.logger.warn(
        `Hackatime ownership check: ${lookups.reason} for ${hcaSub} — failing open`,
      );
      return;
    }

    const verdict = this.evaluateOwnership(user.email, storedId, lookups);

    if (verdict.kind === 'ban') {
      this.logger.warn(
        `Hackatime ownership check FAILED for ${hcaSub}: storedId=${storedId} emailOwnerId=${lookups.emailOwnerId} linkedTrust=${lookups.linkedTrustLevel} linkedBanned=${lookups.linkedBanned} linkedEmailsCount=${lookups.linkedEmails.length}`,
      );

      await this.auditLogService.log(
        user.id,
        'hackatime_ownership_failed',
        verdict.reason,
      );

      // Hard-ban: flip Airtable perms to Banned and nuke sessions, matching
      // the handleCallback red-trust flow.
      try {
        await this.rsvpService.updatePerms(user.email, 'Banned');
      } catch (err) {
        this.logger.error(
          `Failed to flip perms to Banned for ${hcaSub}: ${err}`,
        );
      }
      try {
        await this.sessionRepo.delete({ userId: user.id });
      } catch (err) {
        this.logger.error(`Failed to revoke sessions for ${hcaSub}: ${err}`);
      }

      throw new ForbiddenException(
        'Your linked Hackatime account does not match your Beest account. Please reconnect Hackatime with the correct account.',
      );
    }

    if (verdict.kind === 'inconclusive') {
      this.logger.warn(
        `Hackatime ownership check: no positive proof for ${hcaSub} (storedId=${storedId}, emailOwnerId=${lookups.emailOwnerId}, linkedEmailsCount=${lookups.linkedEmails.length}) — failing open`,
      );
    }
  }

  /**
   * Fetches both Hackatime admin lookups needed to evaluate ownership.
   * Returns `{ ok: false }` on transient API errors so callers can decide
   * whether to fail open (the live check does) or skip (the recovery cron does).
   * A 404 from `get_user_by_email` is a definitive result, not an error — it
   * means no Hackatime user has that email as their primary.
   */
  private async fetchOwnershipLookups(
    email: string,
    storedId: string,
    hcaSub: string,
  ): Promise<OwnershipLookups> {
    let emailOwnerId: string | null = null;
    try {
      const res = await fetchWithTimeout(
        `${this.baseUrl}/api/admin/v1/user/get_user_by_email`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.adminApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email }),
        },
      );
      if (res.ok) {
        const body = await res.json().catch(() => null);
        const rawId = body?.user_id ?? body?.data?.user_id ?? null;
        if (rawId !== null && rawId !== undefined) {
          emailOwnerId = String(rawId);
        }
      } else if (res.status !== 404) {
        return { ok: false, reason: `get_user_by_email returned ${res.status}` };
      }
    } catch (err) {
      return { ok: false, reason: `get_user_by_email network error: ${err}` };
    }

    let linkedTrustLevel: string | null = null;
    let linkedBanned = false;
    let linkedEmails: string[] = [];
    try {
      const res = await fetchWithTimeout(
        `${this.baseUrl}/api/admin/v1/user/info?user_id=${encodeURIComponent(storedId)}`,
        { headers: { Authorization: `Bearer ${this.adminApiKey}` } },
      );
      if (res.ok) {
        const body = await res.json().catch(() => null);
        const u = body?.user ?? body?.data ?? body ?? {};
        linkedTrustLevel =
          u?.trust_level ?? u?.trust_factor?.trust_level ?? null;
        linkedBanned = u?.banned === true;
        const rawEmails = u?.email_addresses ?? u?.emails ?? [];
        if (Array.isArray(rawEmails)) {
          linkedEmails = rawEmails
            .filter((e): e is string => typeof e === 'string')
            .map((e) => e.toLowerCase());
        }
      }
    } catch (err) {
      this.logger.warn(
        `Hackatime ownership check: /user/info error for ${hcaSub}: ${err}`,
      );
    }

    return { ok: true, emailOwnerId, linkedTrustLevel, linkedBanned, linkedEmails };
  }

  /**
   * Pure decision function. Maps the Hackatime lookups to one of:
   *   - `pass`: positive proof of ownership found
   *   - `ban`:  the linked Hackatime account is itself banned / red-trust
   *             (genuine ban-evasion — connecting a banned account's heartbeats)
   *   - `inconclusive`: no positive proof and no active ban — caller fails open
   *
   * Owning a second/alternate Hackatime account is NOT itself bannable. A bare
   * email/ID mismatch (the connected account isn't the one whose primary email
   * is the user's, or doesn't list the user's email) is therefore NOT a ban —
   * it only fails to provide positive proof, so it resolves to `inconclusive`
   * and the caller lets it through. The ONLY ban trigger is the linked account
   * actually being banned/red-trust on Hackatime.
   *
   * The two positive-proof paths matter:
   *   1. `get_user_by_email(email)` returns the stored id (direct match)
   *   2. The linked account's email list contains the user's email — necessary
   *      because `get_user_by_email` only matches primary emails, so users
   *      whose Beest email is a secondary on Hackatime would otherwise look
   *      mismatched.
   */
  private evaluateOwnership(
    email: string,
    storedId: string,
    lookups: Extract<OwnershipLookups, { ok: true }>,
  ): OwnershipVerdict {
    const ownEmail = email.toLowerCase();
    const { emailOwnerId, linkedEmails, linkedBanned, linkedTrustLevel } = lookups;

    // The only bannable condition: the linked Hackatime account is itself
    // banned / red-trust. Connecting a banned account's heartbeats is the
    // ban-evasion pattern we care about. A mere mismatch (alt account that is
    // not banned) is allowed.
    const trustBad = linkedTrustLevel === 'red' || linkedBanned;
    if (trustBad) {
      return {
        kind: 'ban',
        reason: `Linked Hackatime account is banned (trust=${linkedTrustLevel}, banned=${linkedBanned})`,
      };
    }

    const idsMatchByLookup =
      emailOwnerId !== null && emailOwnerId === storedId;
    const idsMatchByLinkedEmails = linkedEmails.includes(ownEmail);
    if (idsMatchByLookup || idsMatchByLinkedEmails) {
      return {
        kind: 'pass',
        reason: idsMatchByLookup
          ? 'by-email lookup confirms stored id'
          : 'linked account lists user email',
      };
    }

    // No positive proof, but no banned linked account either — e.g. the user
    // connected a different (non-banned) Hackatime account. Not a ban; fail open.
    return { kind: 'inconclusive' };
  }

  /**
   * Daily sweep: re-checks every user whose `hackatime_ownership_failed`
   * audit log indicates the linked Hackatime account was banned or red-trust
   * at ban-time. If Hackatime has since cleared the account AND the rest of
   * the ownership check now passes, clear their Airtable `Perms` so they can
   * sign back in.
   *
   * Scope: the only ban reason is a banned / red-trust linked account, which
   * is exactly what can recover on Hackatime's side, so the poller picks it up
   * via the `banned=true` / `trust=red` labels.
   *
   * Gated on NODE_ENV === 'production' so it doesn't fire in dev where the
   * .env may point at prod Airtable.
   */
  @Cron('0 4 * * *', { name: 'hackatime-ownership-recovery' })
  async dailyOwnershipRecoverySweep(): Promise<void> {
    if (process.env.NODE_ENV !== 'production') {
      this.logger.log('Skipping hackatime-ownership-recovery cron (NODE_ENV != production)');
      return;
    }
    if (!this.adminApiKey) {
      this.logger.warn('Skipping hackatime-ownership-recovery cron — admin key not set');
      return;
    }

    this.logger.log('hackatime-ownership-recovery cron starting');
    const candidateUserIds =
      await this.auditLogService.findUsersWithOwnershipFailLabels([
        'banned=true',
        'trust=red',
      ]);
    this.logger.log(
      `hackatime-ownership-recovery: ${candidateUserIds.length} candidate(s)`,
    );

    let reverted = 0;
    let stillBad = 0;
    let notBanned = 0;
    let manualBan = 0;
    let skipped = 0;

    for (const userId of candidateUserIds) {
      const user = await this.userRepo.findOne({ where: { id: userId } });
      if (!user || !user.email || !user.hackatimeUserId) {
        skipped += 1;
        continue;
      }

      let currentPerms: string | null;
      try {
        currentPerms = await this.rsvpService.getPerms(user.email);
      } catch (err) {
        this.logger.warn(
          `hackatime-ownership-recovery: getPerms failed for ${user.id}: ${err}`,
        );
        skipped += 1;
        continue;
      }
      if (currentPerms !== 'Banned') {
        notBanned += 1;
        continue;
      }

      // Only auto-recover the automatic Hackatime ownership ban. If a manual /
      // fraud ban (admin_ban) was applied after the most recent ownership-fail,
      // the active ban is a deliberate human decision — never silently reverse
      // it just because the linked Hackatime account now looks clean.
      if (await this.auditLogService.hasManualBanAfterOwnershipFail(userId)) {
        manualBan += 1;
        continue;
      }

      const storedId = String(user.hackatimeUserId);
      const lookups = await this.fetchOwnershipLookups(
        user.email,
        storedId,
        user.hcaSub,
      );
      if (!lookups.ok) {
        skipped += 1;
        continue;
      }

      const verdict = this.evaluateOwnership(user.email, storedId, lookups);
      if (verdict.kind !== 'pass') {
        stillBad += 1;
        continue;
      }

      try {
        await this.rsvpService.clearPerms(user.email);
        await this.auditLogService.log(
          user.id,
          'ban_reverted',
          `Hackatime account recovered: ${verdict.reason}`,
        );
        reverted += 1;
        this.logger.log(
          `hackatime-ownership-recovery: reverted ban for ${user.id} (${verdict.reason})`,
        );
      } catch (err) {
        this.logger.error(
          `hackatime-ownership-recovery: revert failed for ${user.id}: ${err}`,
        );
        skipped += 1;
      }
    }

    this.logger.log(
      `hackatime-ownership-recovery done: reverted=${reverted} stillBad=${stillBad} notBanned=${notBanned} manualBan=${manualBan} skipped=${skipped}`,
    );
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
      // include_archived=true: Hackatime excludes archived projects by default,
      // so a linked project the user later archives would silently vanish from
      // the picker. We want the full all-time list.
      const res = await fetchWithTimeout(
        `${this.baseUrl}/api/v1/authenticated/projects?include_archived=true`,
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
      // include_archived=true: total_seconds defaults to all-time (the upstream
      // query uses default_stats_start: 0), but archived projects are filtered
      // out unless we ask for them. A user who archived a linked project would
      // otherwise see 0h here while Hackatime still shows the full total.
      const res = await fetchWithTimeout(
        `${this.baseUrl}/api/v1/authenticated/projects?include_archived=true`,
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
      const matched = new Set<string>();

      for (const p of projects) {
        if (nameSet.has(p.name)) {
          matched.add(p.name);
          const secs = p.total_seconds ?? 0;
          totalSeconds += secs;
          perProject[p.name] = Math.round((secs / 3600) * 10) / 10;
        }
      }

      // A linked project that returns no match is the silent-zero case: the user
      // sees 0h on Beest with no error while Hackatime shows real hours. Usually a
      // Hackatime-side rename of an already-linked project. Log it so it's not invisible.
      const unmatched = projectNames.filter((n) => !matched.has(n));
      if (unmatched.length > 0) {
        this.logger.warn(
          `Hackatime: ${unmatched.length} linked project(s) had no match for user ${userId} ` +
            `(returned 0h). Unmatched: ${JSON.stringify(unmatched)}. ` +
            `Available: ${JSON.stringify(projects.map((p) => p.name))}`,
        );
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
        const raw = await res.json();
        const data = raw?.data ?? raw;
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

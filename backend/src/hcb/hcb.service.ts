import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { fetchWithTimeout } from '../fetch.util';
import { HcbCredential } from '../entities/hcb-credential.entity';
import { Order } from '../entities/order.entity';
import { User } from '../entities/user.entity';
import { AuditLogService } from '../audit-log/audit-log.service';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Refresh proactively when the access token has under this long to live.
const EXPIRY_SKEW_MS = 60 * 1000;

export type GrantAdmin = { uid: string; email: string };

export type CardGrantInput = {
  amountCents: number;
  email: string;
  purpose?: string | null;
  merchantLock?: string | null;
  categoryLock?: string | null;
  keywordLock?: string | null;
  // Both default ON when omitted. One-time-use locks the grant to a single
  // transaction; pre-authorization requires the recipient to be approved
  // before the card activates.
  oneTimeUse?: boolean;
  preAuthorizationRequired?: boolean;
};

export type HcbStatus = {
  configured: boolean;
  connected: boolean;
  orgId: string | null;
  connectedByEmail: string | null;
  connectedAt: string | null;
  expiresAt: string | null;
};

export type CardGrantPrefill = {
  recipientEmail: string;
  // Suggested amount (pipes × rate). A default — the admin may override, but the
  // server caps the grant at twice this value.
  suggestedAmountCents: number | null;
  purpose: string;
  orgId: string;
  alreadyGranted: boolean;
  existingGrantId: string | null;
};

@Injectable()
export class HcbService {
  private readonly logger = new Logger(HcbService.name);

  private readonly baseUrl: string;
  private readonly clientId: string | undefined;
  private readonly clientSecret: string | undefined;
  private readonly redirectUri: string;
  private readonly orgId: string | undefined;
  private readonly jwtSecret: string;
  // Drives the suggested grant amount (pipes × rate) for the prefill, and caps
  // the grant at twice that value when configured.
  private readonly centsPerPipe: number | undefined;

  private readonly scope = 'read write';

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(HcbCredential)
    private readonly credRepo: Repository<HcbCredential>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    private readonly auditLogService: AuditLogService,
  ) {
    this.baseUrl = (this.config.get<string>('HCB_BASE_URL') ?? 'https://hcb.hackclub.com').replace(/\/$/, '');
    this.clientId = this.config.get<string>('HCB_CLIENT_ID')?.trim() || undefined;
    this.clientSecret = this.config.get<string>('HCB_CLIENT_SECRET')?.trim() || undefined;
    this.redirectUri = this.config.get<string>('HCB_REDIRECT_URI', 'http://localhost:5173/oauth/hcb/callback');
    this.orgId = this.config.get<string>('HCB_ORG_ID')?.trim() || undefined;
    this.jwtSecret = this.config.getOrThrow<string>('JWT_SECRET');
    // Cents per pipe, e.g. 500 = $5 per pipe. Drives the suggested amount and
    // the cap (twice the pipe value).
    this.centsPerPipe = this.parsePositiveInt(
      this.config.get<string>('HCB_CENTS_PER_PIPE') ?? this.config.get<string>('HCB_PIPES_TO_CENTS'),
    );

    if (!this.isConfigured) {
      this.logger.warn('HCB card grants disabled — set HCB_CLIENT_ID, HCB_CLIENT_SECRET and HCB_ORG_ID');
    }
  }

  private parsePositiveInt(raw: string | undefined): number | undefined {
    if (raw === undefined) return undefined;
    const n = Number(raw.trim());
    if (!Number.isInteger(n) || n <= 0) return undefined;
    return n;
  }

  private get isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret && this.orgId);
  }

  // ── OAuth: connect ──

  private signState(state: string): string {
    return createHmac('sha256', this.jwtSecret).update(`hcb:${state}`).digest('hex');
  }

  /**
   * Builds the HCB authorize URL and a signed state value. The caller must
   * store `state` in an httpOnly cookie and pass it back on the callback.
   */
  getAuthorizeUrl(): { url: string; state: string } {
    if (!this.isConfigured) {
      throw new ServiceUnavailableException('HCB is not configured');
    }
    const state = randomUUID();
    const signedState = `${state}.${this.signState(state)}`;
    const params = new URLSearchParams({
      client_id: this.clientId!,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: this.scope,
      state: signedState,
    });
    // HCB mounts Doorkeeper under /api/v4/oauth (not the conventional /oauth).
    return { url: `${this.baseUrl}/api/v4/oauth/authorize?${params.toString()}`, state };
  }

  /**
   * Verifies the OAuth state (CSRF), exchanges the code for tokens, and stores
   * them encrypted. Throws on any verification or exchange failure.
   */
  async handleCallback(
    code: string,
    returnedSignedState: string,
    cookieState: string,
    admin: GrantAdmin,
  ): Promise<HcbStatus> {
    if (!this.isConfigured) {
      throw new ServiceUnavailableException('HCB is not configured');
    }
    this.verifyState(returnedSignedState, cookieState);

    const tokenRes = await fetchWithTimeout(`${this.baseUrl}/api/v4/oauth/token`, {
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

    if (!tokenRes.ok) {
      this.logger.error(`HCB token exchange failed: ${tokenRes.status}`);
      throw new BadRequestException('HCB authorization failed');
    }

    const tokens = await tokenRes.json().catch(() => null);
    await this.persistTokens(tokens, admin);
    return this.getStatus();
  }

  private verifyState(returnedSignedState: string, cookieState: string): void {
    const dot = returnedSignedState.lastIndexOf('.');
    if (dot === -1) throw new BadRequestException('Malformed state');
    const value = returnedSignedState.slice(0, dot);
    const sig = returnedSignedState.slice(dot + 1);

    if (!this.safeEqual(value, cookieState)) {
      throw new BadRequestException('State mismatch');
    }
    if (!this.safeEqual(sig, this.signState(value))) {
      throw new BadRequestException('Invalid state signature');
    }
  }

  private safeEqual(a: string, b: string): boolean {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    return ab.length === bb.length && timingSafeEqual(ab, bb);
  }

  private async persistTokens(tokens: any, admin: GrantAdmin | null): Promise<void> {
    const accessToken = typeof tokens?.access_token === 'string' ? tokens.access_token : null;
    const refreshToken = typeof tokens?.refresh_token === 'string' ? tokens.refresh_token : null;
    if (!accessToken || !refreshToken) {
      throw new BadRequestException('Invalid token response from HCB');
    }
    const expiresInSec = Number(tokens?.expires_in);
    const ttlMs = Number.isFinite(expiresInSec) && expiresInSec > 0 ? expiresInSec * 1000 : 2 * 60 * 60 * 1000;
    const expiresAt = new Date(Date.now() + ttlMs);

    const existing = await this.credRepo.findOne({ where: { id: HcbCredential.SINGLETON_ID } });
    const cred = existing ?? this.credRepo.create({ id: HcbCredential.SINGLETON_ID });
    cred.accessToken = accessToken;
    cred.refreshToken = refreshToken;
    cred.expiresAt = expiresAt;
    cred.scope = typeof tokens?.scope === 'string' ? tokens.scope : this.scope;
    if (admin) {
      cred.connectedByUserId = admin.uid;
      cred.connectedByEmail = admin.email;
    }
    await this.credRepo.save(cred);
  }

  // ── OAuth: token use / refresh ──

  /** Returns a non-expired access token, refreshing via the refresh token if needed. */
  private async getValidAccessToken(): Promise<string> {
    const cred = await this.credRepo.findOne({ where: { id: HcbCredential.SINGLETON_ID } });
    if (!cred) {
      throw new ServiceUnavailableException('HCB is not connected. A super admin must connect it first.');
    }
    if (cred.expiresAt.getTime() - EXPIRY_SKEW_MS > Date.now()) {
      return cred.accessToken;
    }
    return this.refresh(cred);
  }

  private async refresh(cred: HcbCredential): Promise<string> {
    const res = await fetchWithTimeout(`${this.baseUrl}/api/v4/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: cred.refreshToken,
        client_id: this.clientId!,
        client_secret: this.clientSecret!,
      }),
    });
    if (!res.ok) {
      this.logger.error(`HCB token refresh failed: ${res.status}`);
      throw new ServiceUnavailableException('HCB connection expired. A super admin must reconnect it.');
    }
    const tokens = await res.json().catch(() => null);
    await this.persistTokens(tokens, null);
    const updated = await this.credRepo.findOne({ where: { id: HcbCredential.SINGLETON_ID } });
    return updated!.accessToken;
  }

  // ── Status ──

  async getStatus(): Promise<HcbStatus> {
    const cred = await this.credRepo.findOne({ where: { id: HcbCredential.SINGLETON_ID } });
    return {
      configured: this.isConfigured,
      connected: !!cred,
      orgId: this.orgId ?? null,
      connectedByEmail: cred?.connectedByEmail ?? null,
      connectedAt: cred?.createdAt?.toISOString() ?? null,
      expiresAt: cred?.expiresAt?.toISOString() ?? null,
    };
  }

  // ── Card grants ──

  /** Prefill values for the grant popup. The suggested amount is just a default. */
  async buildPrefill(orderId: string): Promise<CardGrantPrefill> {
    if (!this.orgId) throw new ServiceUnavailableException('HCB org is not configured');
    const order = await this.orderRepo.findOne({ where: { id: orderId }, relations: ['user'] });
    if (!order) throw new NotFoundException('Order not found');

    const suggested =
      this.centsPerPipe !== undefined ? order.pipesSpent * this.centsPerPipe : null;

    return {
      recipientEmail: order.user?.email ?? '',
      suggestedAmountCents: suggested,
      purpose: this.defaultPurpose(order.itemName),
      orgId: this.orgId,
      alreadyGranted: !!order.hcbCardGrantId,
      existingGrantId: order.hcbCardGrantId,
    };
  }

  private defaultPurpose(itemName: string): string {
    return (itemName ?? 'Grant').slice(0, 30);
  }

  /**
   * Creates an HCB card grant for an order.
   *
   * Money-safety:
   * - The order row is locked FOR UPDATE and the grant id is stamped onto it in
   *   the same transaction; a unique index makes a duplicate grant impossible.
   * - The audit log is written AFTER commit, so a failed audit insert can never
   *   roll back a grant whose money has already moved.
   * - If the order update fails *after* HCB created the grant, the grant id is
   *   logged at error level for manual reconciliation. (Residual: HCB exposes no
   *   idempotency key, so a retry before reconciliation could double-issue.)
   */
  async createCardGrantForOrder(
    orderId: string,
    input: CardGrantInput,
    admin: GrantAdmin,
  ): Promise<{ grantId: string; amountCents: number; status: string }> {
    if (!this.isConfigured || !this.orgId) {
      throw new ServiceUnavailableException('HCB is not configured');
    }

    // Validate email + purpose up front (cheap, no lock held).
    const email = (input.email ?? '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      throw new BadRequestException('A valid recipient email is required');
    }
    const purpose = typeof input.purpose === 'string' ? input.purpose.trim().slice(0, 30) : undefined;
    const merchantLock = this.cleanLock(input.merchantLock);
    const categoryLock = this.cleanLock(input.categoryLock);
    const keywordLock = this.cleanLock(input.keywordLock);
    // Default both protections ON; only an explicit `false` disables them.
    const oneTimeUse = input.oneTimeUse !== false;
    const preAuthorizationRequired = input.preAuthorizationRequired !== false;

    const amountCents = input.amountCents;
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      throw new BadRequestException('Amount must be a positive whole number of cents');
    }

    // Policy checks. These read the order (and its owner) outside the money-
    // safety lock below — they only decide whether the grant is allowed at all,
    // so a slightly stale read is fine; the locked re-read still guards money.
    const orderForChecks = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: ['user'],
    });
    if (!orderForChecks) throw new NotFoundException('Order not found');
    const ownerEmail = (orderForChecks.user?.email ?? '').trim().toLowerCase();

    // 1) An admin may not issue a grant to their own email.
    if (email === admin.email.trim().toLowerCase()) {
      throw new BadRequestException('You cannot issue a card grant to your own email');
    }
    // 2) The recipient must be the order's owner — the fulfilment email is fixed.
    if (!ownerEmail || email !== ownerEmail) {
      throw new BadRequestException("The recipient email must match the order owner's email");
    }
    // 3) The amount may not exceed twice the pipe-rate value of the order.
    if (this.centsPerPipe !== undefined) {
      const maxCents = 2 * orderForChecks.pipesSpent * this.centsPerPipe;
      if (amountCents > maxCents) {
        throw new BadRequestException(
          `Amount may not exceed twice the pipe value of the order (${maxCents} cents)`,
        );
      }
    }

    const accessToken = await this.getValidAccessToken();

    // Set once HCB confirms the grant (real money moved). If the transaction
    // then fails to commit, we log this id so the grant can be reconciled
    // before any retry — preventing a silent double-issue.
    let issuedGrantId: string | null = null;

    let result: {
      grantId: string;
      amountCents: number;
      status: string;
      recipientUserId: string;
    };

    try {
      result = await this.orderRepo.manager.transaction(async (em) => {
        // Lock the order row alone (no joins — Postgres FOR UPDATE can't span outer joins).
        const order = await em.findOne(Order, {
          where: { id: orderId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!order) throw new NotFoundException('Order not found');
        if (order.hcbCardGrantId) {
          throw new ConflictException(`A card grant (${order.hcbCardGrantId}) was already issued for this order`);
        }

        const body: Record<string, unknown> = {
          amount_cents: amountCents,
          email,
          one_time_use: oneTimeUse,
          pre_authorization_required: preAuthorizationRequired,
        };
        if (purpose) body.purpose = purpose;
        if (merchantLock) body.merchant_lock = merchantLock;
        if (categoryLock) body.category_lock = categoryLock;
        if (keywordLock) body.keyword_lock = keywordLock;

        const res = await fetchWithTimeout(
          `${this.baseUrl}/api/v4/organizations/${encodeURIComponent(this.orgId!)}/card_grants`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify(body),
          },
        );

        if (!res.ok) {
          // Non-2xx → no money moved; safe to throw and roll back.
          const detail = await res.text().catch(() => '');
          this.logger.error(`HCB card grant failed: ${res.status} ${detail.slice(0, 300)}`);
          if (res.status === 400) {
            throw new BadRequestException('HCB rejected the grant (check amount, email, and locks)');
          }
          if (res.status === 401 || res.status === 403) {
            throw new ServiceUnavailableException('HCB authorization is no longer valid. A super admin must reconnect.');
          }
          throw new ServiceUnavailableException('HCB card grant request failed');
        }

        const grant = await res.json().catch(() => null);
        const grantId = typeof grant?.id === 'string' ? grant.id : null;
        if (!grantId) {
          // Money may have moved but we couldn't read the id — surface loudly.
          this.logger.error('HCB card grant succeeded but response had no id');
          throw new ServiceUnavailableException('HCB returned an unexpected response; verify in HCB before retrying');
        }

        // Past this point real money has moved.
        issuedGrantId = grantId;

        order.hcbCardGrantId = grantId;
        await em.save(order);

        return {
          grantId,
          amountCents,
          status: typeof grant?.status === 'string' ? grant.status : 'active',
          recipientUserId: order.userId,
        };
      });
    } catch (err) {
      if (issuedGrantId) {
        // The grant exists at HCB but the order update/commit failed. Do NOT
        // retry blindly — reconcile in HCB first.
        this.logger.error(
          `CRITICAL: HCB grant ${issuedGrantId} (${amountCents}c to ${email}) was created but order ${orderId} ` +
            `could not be updated — money has moved. Reconcile in HCB before any retry. ` +
            `Cause: ${err instanceof Error ? err.message : String(err)}`,
        );
        // Best-effort: stamp the grant id directly so the per-order idempotency
        // guard blocks a retry from issuing a SECOND real grant. This is a
        // separate, narrowly-scoped write — the transaction above already
        // failed — so if it also fails we are no worse off than before (the
        // loud log above stands and reconciliation is still manual).
        try {
          await this.orderRepo.update({ id: orderId }, { hcbCardGrantId: issuedGrantId });
        } catch (stampErr) {
          this.logger.error(
            `Failed to stamp grant ${issuedGrantId} onto order ${orderId} for retry-safety: ` +
              `${stampErr instanceof Error ? stampErr.message : String(stampErr)}`,
          );
        }
      }
      throw err;
    }

    // Audit AFTER commit: a failed audit insert must never roll back a grant
    // whose money has already moved.
    try {
      await this.auditLogService.log(
        result.recipientUserId,
        'card_grant_issued',
        `Card grant ${result.grantId} for ${result.amountCents}c issued to ${email} by ${admin.email}`,
      );
    } catch (err) {
      this.logger.error(
        `Audit log failed for grant ${result.grantId} (grant itself succeeded): ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return { grantId: result.grantId, amountCents: result.amountCents, status: result.status };
  }

  private cleanLock(value: string | null | undefined): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  }
}

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
import { AuditLogService } from '../audit-log/audit-log.service';
import { ShopService } from '../shop/shop.service';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Refresh proactively when the access token has under this long to live.
const EXPIRY_SKEW_MS = 60 * 1000;
// Default grant value: $5 per pipe spent. Used when HCB_CENTS_PER_PIPE is unset.
const DEFAULT_CENTS_PER_PIPE = 500;

// How many grants to issue in parallel in the bulk flow. Each order is an
// independent row (its own pessimistic lock + idempotency guard), so bounded
// concurrency only shortens wall-clock time; keep it modest to stay gentle on
// HCB. Override with HCB_GRANT_CONCURRENCY.
const DEFAULT_GRANT_CONCURRENCY = 4;
const MAX_GRANT_CONCURRENCY = 8;

// Grant instructions are set per shop item in the shop panel
// (ShopItem.grantInstructions) and sent to HCB on the card grant (shown to the
// recipient, incl. during pre-authorization). Items with no instructions set
// fall back to this default.
const DEFAULT_GRANT_INSTRUCTIONS = [
  'This is your beest reward grant card — use it only for the item you redeemed.',
  'Upload a receipt in HCB for every transaction, or the charge may be reversed.',
  'If the card needs pre-authorization it activates once approved. Questions? Ask in the Hack Club Slack.',
].join('\n');

// The item's own instructions if set, else the default.
function resolveGrantInstructions(raw: string | null | undefined): string {
  const text = (raw ?? '').trim();
  return text || DEFAULT_GRANT_INSTRUCTIONS;
}

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

export type BulkGrantResult = {
  orderId: string;
  itemName: string;
  ok: boolean;
  grantId?: string;
  amountCents?: number;
  error?: string;
  skipped?: 'not_pending' | 'already_granted' | 'not_a_grant';
  // True once the order was marked fulfilled after a successful grant. False
  // means the grant succeeded (money moved) but the fulfill step failed — the
  // grant is never rolled back for a fulfill failure.
  fulfilled?: boolean;
}

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

  // Max grants issued in parallel by the bulk flow (clamped, env-overridable).
  private readonly grantConcurrency: number;

  // Single-flight guard so concurrent callers share one token refresh instead
  // of racing HCB's refresh-token rotation.
  private refreshInFlight: Promise<string> | null = null;

  private readonly scope = 'read write';

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(HcbCredential)
    private readonly credRepo: Repository<HcbCredential>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    private readonly auditLogService: AuditLogService,
    private readonly shopService: ShopService,
  ) {
    this.baseUrl = (this.config.get<string>('HCB_BASE_URL') ?? 'https://hcb.hackclub.com').replace(/\/$/, '');
    this.clientId = this.config.get<string>('HCB_CLIENT_ID')?.trim() || undefined;
    this.clientSecret = this.config.get<string>('HCB_CLIENT_SECRET')?.trim() || undefined;
    this.redirectUri = this.config.get<string>('HCB_REDIRECT_URI', 'http://localhost:5173/oauth/hcb/callback');
    this.orgId = this.config.get<string>('HCB_ORG_ID')?.trim() || undefined;
    this.jwtSecret = this.config.getOrThrow<string>('JWT_SECRET');
    // Cents per pipe, e.g. 500 = $5 per pipe. Drives the grant amount, the
    // suggested amount, and the cap. Defaults to $5/pipe when unset.
    this.centsPerPipe = this.parsePositiveInt(
      this.config.get<string>('HCB_CENTS_PER_PIPE') ?? this.config.get<string>('HCB_PIPES_TO_CENTS'),
    ) ?? DEFAULT_CENTS_PER_PIPE;
    this.grantConcurrency = Math.min(
      MAX_GRANT_CONCURRENCY,
      this.parsePositiveInt(this.config.get<string>('HCB_GRANT_CONCURRENCY')) ?? DEFAULT_GRANT_CONCURRENCY,
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
    // Coalesce concurrent refreshes: HCB rotates the refresh token on use, so
    // two simultaneous refreshes would invalidate each other. Share one.
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.refresh(cred).finally(() => {
        this.refreshInFlight = null;
      });
    }
    return this.refreshInFlight;
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
    return this.stripDollarAmounts(itemName ?? 'Grant').slice(0, 30);
  }

  // Removes dollar-amount substrings (e.g. "$25", "25$", "$25.00") from grant
  // purpose text. HCB's pre-authorization fraud check reads this text, and a
  // dollar figure in there that doesn't exactly match the transaction has
  // been triggering false fraud flags on legitimate grants.
  private stripDollarAmounts(text: string): string {
    return text
      .replace(/\$\s?\d+(?:\.\d{1,2})?/g, '')
      .replace(/\d+(?:\.\d{1,2})?\s?\$/g, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s*[-–—:]\s*$/, '')
      .trim();
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
    const purpose =
      typeof input.purpose === 'string'
        ? this.stripDollarAmounts(input.purpose.trim()).slice(0, 30)
        : undefined;
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
      relations: ['user', 'shopItem'],
    });
    if (!orderForChecks) throw new NotFoundException('Order not found');
    const ownerEmail = (orderForChecks.user?.email ?? '').trim().toLowerCase();
    // Instructions come from the order's shop item (set in the shop panel).
    const instructions = resolveGrantInstructions(
      orderForChecks.shopItem?.grantInstructions,
    );

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
          instructions,
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

  async createGrantForOrders(
    orderIds: string[],
    opts: { oneTimeUse?: boolean; preAuthorizationRequired?: boolean },
    admin: GrantAdmin,
  ): Promise<{ results: BulkGrantResult[] }> {
    if (!this.isConfigured || !this.orgId) {
      throw new ServiceUnavailableException('HCB is not configured');
    }

    // Prime the OAuth token once up front. The workers below run in parallel and
    // each calls getValidAccessToken(); priming (plus the refresh single-flight)
    // means they hit the cached token instead of racing to refresh mid-batch.
    await this.getValidAccessToken();

    // Issue grants with bounded concurrency. Orders are independent rows — each
    // guarded by its own pessimistic lock + idempotency — so this only shortens
    // wall-clock time; it does not weaken the per-order money safety. Results are
    // written by original index so the response order matches the request.
    const results: BulkGrantResult[] = new Array(orderIds.length);
    let cursor = 0;
    const worker = async () => {
      for (let i = cursor++; i < orderIds.length; i = cursor++) {
        try {
          results[i] = await this.processGrantOrder(orderIds[i], opts, admin);
        } catch (err) {
          // processGrantOrder is defensive, but guarantee no undefined slots.
          results[i] = {
            orderId: orderIds[i],
            itemName: '',
            ok: false,
            error: err instanceof Error ? err.message : 'Grant failed',
          };
        }
      }
    };
    const workers = Math.max(1, Math.min(this.grantConcurrency, orderIds.length));
    await Promise.all(Array.from({ length: workers }, () => worker()));
    return { results };
  }

  // Issues a single grant for one order and marks it fulfilled. Never throws —
  // always resolves to a BulkGrantResult so one failure can't sink the batch.
  private async processGrantOrder(
    orderId: string,
    opts: { oneTimeUse?: boolean; preAuthorizationRequired?: boolean },
    admin: GrantAdmin,
  ): Promise<BulkGrantResult> {
    const order = await this.orderRepo.findOne({ where: { id: orderId }, relations: ['user', 'shopItem'] });
    if (!order) {
      return { orderId, itemName: '', ok: false, error: 'Order not found' };
    }
    const base = { orderId, itemName: order.itemName };

    if (order.status !== 'pending') {
      return { ...base, ok: false, skipped: 'not_pending', error: 'Order is not pending' };
    }
    if (order.hcbCardGrantId) {
      return { ...base, ok: false, skipped: 'already_granted', error: `Already granted (${order.hcbCardGrantId})` };
    }
    // Only issue grants for items flagged as grant items in the shop panel.
    if (!order.shopItem?.isGrant) {
      return { ...base, ok: false, skipped: 'not_a_grant', error: 'Item is not a grant item' };
    }

    // Grant amount = pipes spent × the per-pipe rate ($5/pipe by default).
    const amountCents =
      this.centsPerPipe !== undefined ? order.pipesSpent * this.centsPerPipe : null;
    if (amountCents === null || amountCents <= 0) {
      return { ...base, ok: false, skipped: 'not_a_grant', error: 'Grant amount is zero (no pipes spent)' };
    }

    try {
      const res = await this.createCardGrantForOrder(orderId, {
        amountCents,
        email: (order.user?.email ?? '').trim().toLowerCase(),
        purpose: this.defaultPurpose(order.itemName),
        preAuthorizationRequired: true,      // fixed for the batch
        oneTimeUse: opts.oneTimeUse,          // fixed for the batch
      }, admin);

      // Grant succeeded (money moved) — now mark the order fulfilled. A
      // fulfill failure must NOT fail the result: the grant already stands.
      let fulfilled = false;
      try {
        await this.shopService.fulfillOrder(orderId);
        fulfilled = true;
      } catch (ferrErr) {
        this.logger.error(
          `Grant ${res.grantId} issued for order ${orderId} but auto-fulfill failed ` +
            `(order left pending): ${ferrErr instanceof Error ? ferrErr.message : String(ferrErr)}`,
        );
      }

      return { ...base, ok: true, grantId: res.grantId, amountCents: res.amountCents, fulfilled };
    } catch (err) {
      return { ...base, ok: false, error: err instanceof Error ? err.message : 'Grant failed' };
    }
  }
  private cleanLock(value: string | null | undefined): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  }
}

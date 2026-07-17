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
import { fetchWithTimeout } from '../fetch.util';
import { Order } from '../entities/order.entity';
import { AuditLogService } from '../audit-log/audit-log.service';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type GrantAdmin = { uid: string; email: string };

export type SiloGrantPrefill = {
  recipientEmail: string;
  amount: number;
  unit: string;
  alreadyGranted: boolean;
  existingGrantId: string | null;
};

@Injectable()
export class SiloService {
  private readonly logger = new Logger(SiloService.name);

  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly unit: string;

  private static readonly GRANT_AMOUNT = 60;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    private readonly auditLogService: AuditLogService,
  ) {
    this.apiKey = this.config.get<string>('SILO_API_KEY')?.trim() || undefined;
    this.baseUrl = (this.config.get<string>('SILO_BASE_URL') ?? 'https://dash.onsilo.dev').replace(/\/$/, '');
    this.unit = (this.config.get<string>('SILO_GRANT_UNIT') ?? 'GB').trim() || 'GB';

    if (!this.apiKey) {
      this.logger.warn('SILO grants disabled — set SILO_API_KEY');
    }
  }

  get isConfigured(): boolean {
    return !!this.apiKey;
  }

  async buildPrefill(orderId: string): Promise<SiloGrantPrefill> {
    if (!this.apiKey) {
      throw new ServiceUnavailableException('SILO is not configured');
    }

    const order = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: ['user'],
    });
    if (!order) throw new NotFoundException('Order not found');

    return {
      recipientEmail: order.user?.email ?? '',
      amount: SiloService.GRANT_AMOUNT,
      unit: this.unit,
      alreadyGranted: !!order.siloGrantId,
      existingGrantId: order.siloGrantId,
    };
  }

  /**
   * Creates a SILO storage grant for an order.
   *
   * Safety:
   * - The order row is locked FOR UPDATE and the grant id is stamped onto it in
   *   the same transaction; a null check on siloGrantId makes a duplicate grant
   *   impossible.
   * - The audit log is written AFTER commit, so a failed audit insert can never
   *   roll back a grant that has already been issued.
   * - If the order update fails *after* SILO created the grant, the grant id is
   *   logged at error level for manual reconciliation.
   */
  async createSiloGrantForOrder(
    orderId: string,
    admin: GrantAdmin,
  ): Promise<{ grantId: string; amount: number; unit: string }> {
    if (!this.apiKey) {
      throw new ServiceUnavailableException('SILO is not configured');
    }

    // Fetch recipient info outside the transaction for the catch handler's
    // critical error log (transactionResult isn't assigned on failure).
    const orderForRecipient = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: ['user'],
    });
    if (!orderForRecipient) throw new NotFoundException('Order not found');
    const recipientEmail = (orderForRecipient?.user?.email ?? '').trim().toLowerCase();

    let issuedGrantId: string | null = null;
    let transactionResult: { grantId: string; amount: number; unit: string; recipientUserId: string } | undefined;

    try {
      transactionResult = await this.orderRepo.manager.transaction(async (em) => {
        const order = await em.findOne(Order, {
          where: { id: orderId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!order) throw new NotFoundException('Order not found');
        if (order.siloGrantId) {
          throw new ConflictException(
            `A SILO grant (${order.siloGrantId}) was already issued for this order`,
          );
        }

        if (!EMAIL_RE.test(recipientEmail)) {
          throw new BadRequestException('Order owner has no valid email');
        }
        if (recipientEmail === admin.email.trim().toLowerCase()) {
          throw new BadRequestException('You cannot issue a SILO grant to your own email');
        }

        const externalId = order.id;

        const body: Record<string, unknown> = {
          amount: SiloService.GRANT_AMOUNT,
          unit: this.unit,
          externalId,
          reason: order.itemName,
        };
        body.userId = orderForRecipient.user?.hcaSub ?? orderForRecipient.user?.slackId ?? recipientEmail;

        const res = await fetchWithTimeout(
          `${this.baseUrl}/api/ysws/grants`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify(body),
          },
        );

        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          this.logger.error(`SILO grant failed: ${res.status} ${detail.slice(0, 300)}`);
          if (res.status === 400) {
            throw new BadRequestException('SILO rejected the grant (check email and configuration)');
          }
          if (res.status === 401 || res.status === 403) {
            throw new ServiceUnavailableException('SILO API key is not valid');
          }
          throw new ServiceUnavailableException('SILO grant request failed');
        }

        const grant = await res.json().catch(() => null);
        const grantId = typeof grant?.grant?.id === 'string' ? grant.grant.id : null;
        if (!grantId) {
          this.logger.error('SILO grant succeeded but response had no id');
          throw new ServiceUnavailableException(
            'SILO returned an unexpected response; verify in SILO before retrying',
          );
        }

        issuedGrantId = grantId;

        order.siloGrantId = grantId;
        await em.save(order);

        return {
          grantId,
          amount: SiloService.GRANT_AMOUNT,
          unit: this.unit,
          recipientUserId: order.userId,
        };
      });
    } catch (err) {
      if (issuedGrantId) {
        this.logger.error(
          `CRITICAL: SILO grant ${issuedGrantId} (${SiloService.GRANT_AMOUNT} ${this.unit} to ${recipientEmail || 'unknown'}) ` +
            `was created but order ${orderId} could not be updated. ` +
            `Reconcile in SILO before any retry. ` +
            `Cause: ${err instanceof Error ? err.message : String(err)}`,
        );
        try {
          await this.orderRepo.update({ id: orderId }, { siloGrantId: issuedGrantId });
        } catch (stampErr) {
          this.logger.error(
            `Failed to stamp grant ${issuedGrantId} onto order ${orderId} for retry-safety: ` +
              `${stampErr instanceof Error ? stampErr.message : String(stampErr)}`,
          );
        }
      }
      throw err;
    }

    try {
      await this.auditLogService.log(
        transactionResult.recipientUserId,
        'silo_grant_issued',
        `SILO grant ${transactionResult.grantId} for ${transactionResult.amount} ${transactionResult.unit} issued to ${recipientEmail || 'unknown'} by ${admin.email}`,
      );
    } catch (err) {
      this.logger.error(
        `Audit log failed for SILO grant ${transactionResult.grantId} (grant itself succeeded): ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return { grantId: transactionResult.grantId, amount: transactionResult.amount, unit: transactionResult.unit };
  }
}

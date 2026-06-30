import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { ShopItem } from '../entities/shop-item.entity';
import { Order } from '../entities/order.entity';
import { FulfillmentUpdate } from '../entities/fulfillment-update.entity';
import { User } from '../entities/user.entity';
import { ShopSuggestion } from '../entities/shop-suggestion.entity';
import { ShopSuggestionVote } from '../entities/shop-suggestion-vote.entity';
import { AuditLogService } from '../audit-log/audit-log.service';
import { RsvpService } from '../rsvp/rsvp.service';
import { SlackNotifyService } from '../slack/slack-notify.service';
import {
  orderPendingDm,
  orderFulfilledDm,
} from '../slack/slack-notify.templates';

@Injectable()
export class ShopService {
  private readonly logger = new Logger(ShopService.name);

  constructor(
    @InjectRepository(ShopItem)
    private readonly shopRepo: Repository<ShopItem>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(FulfillmentUpdate)
    private readonly fulfillmentRepo: Repository<FulfillmentUpdate>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(ShopSuggestion)
    private readonly suggestionRepo: Repository<ShopSuggestion>,
    @InjectRepository(ShopSuggestionVote)
    private readonly suggestionVoteRepo: Repository<ShopSuggestionVote>,
    private readonly dataSource: DataSource,
    private readonly auditLogService: AuditLogService,
    private readonly rsvpService: RsvpService,
    private readonly slackNotify: SlackNotifyService,
  ) {}

  /** Fire-and-forget order-status DM to the buyer (best-effort). */
  private notifyOrder(
    userId: string,
    message: { text: string; blocks: Record<string, unknown>[] },
  ): void {
    this.userRepo
      .findOne({ where: { id: userId }, select: ['slackId'] })
      .then((u) => {
        if (u?.slackId) {
          return this.slackNotify.dm(u.slackId, message.text, message.blocks);
        }
      })
      .catch(() => undefined);
  }

  // ── Shop suggestions ──

  async listSuggestions(userId: string) {
    const rows = await this.suggestionRepo
      .createQueryBuilder('s')
      .leftJoin('s.user', 'u')
      .leftJoin(
        ShopSuggestionVote,
        'v',
        'v.suggestion_id = s.id',
      )
      .leftJoin(
        ShopSuggestionVote,
        'mv',
        'mv.suggestion_id = s.id AND mv.user_id = :userId',
        { userId },
      )
      .select('s.id', 'id')
      .addSelect('s.text', 'text')
      .addSelect('s.created_at', 'createdAt')
      .addSelect('s.user_id', 'userId')
      .addSelect('COALESCE(u.nickname, u.name)', 'authorName')
      .addSelect('COUNT(DISTINCT v.id)::int', 'voteCount')
      .addSelect('BOOL_OR(mv.id IS NOT NULL)', 'votedByUser')
      .groupBy('s.id')
      .addGroupBy('u.nickname')
      .addGroupBy('u.name')
      .orderBy('"voteCount"', 'DESC')
      .addOrderBy('s.created_at', 'DESC')
      .getRawMany();

    return rows.map((r) => ({
      id: r.id,
      text: r.text,
      createdAt: r.createdAt,
      authorName: r.authorName ?? 'Someone',
      isMine: r.userId === userId,
      voteCount: Number(r.voteCount ?? 0),
      votedByUser: !!r.votedByUser,
    }));
  }

  async createSuggestion(userId: string, text: string) {
    // Strip NUL + HTML tag delimiters as defense-in-depth (current render path
    // auto-escapes via Svelte, but a future {@html} or out-of-band surface —
    // admin panel, email, CSV — would otherwise execute stored payloads).
    // Collapse whitespace runs to keep the layout sane.
    const clean = text
      .replace(/\0/g, '')
      .replace(/[<>]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200);
    if (!clean) {
      throw new BadRequestException('Suggestion cannot be empty');
    }

    // Rate limit: max 5 suggestions per user per day
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await this.suggestionRepo
      .createQueryBuilder('s')
      .where('s.user_id = :userId', { userId })
      .andWhere('s.created_at > :since', { since })
      .getCount();
    if (recent >= 5) {
      throw new BadRequestException(
        'You can suggest up to 5 items per day. Try again tomorrow!',
      );
    }

    const suggestion = this.suggestionRepo.create({ userId, text: clean });
    const saved = await this.suggestionRepo.save(suggestion);

    // Auto-upvote your own suggestion
    try {
      const vote = this.suggestionVoteRepo.create({
        userId,
        suggestionId: saved.id,
      });
      await this.suggestionVoteRepo.save(vote);
    } catch {
      // ignore unique violation race
    }

    return { id: saved.id };
  }

  /** Toggle vote: adds an upvote if missing, removes if present. */
  async toggleSuggestionVote(userId: string, suggestionId: string) {
    const suggestion = await this.suggestionRepo.findOne({
      where: { id: suggestionId },
    });
    if (!suggestion) throw new NotFoundException('Suggestion not found');

    const existing = await this.suggestionVoteRepo.findOne({
      where: { userId, suggestionId },
    });
    if (existing) {
      await this.suggestionVoteRepo.remove(existing);
      const count = await this.suggestionVoteRepo.count({
        where: { suggestionId },
      });
      return { votedByUser: false, voteCount: count };
    }

    try {
      const vote = this.suggestionVoteRepo.create({ userId, suggestionId });
      await this.suggestionVoteRepo.save(vote);
    } catch (err: any) {
      if (err?.code !== '23505') throw err;
      // race — already voted
    }
    const count = await this.suggestionVoteRepo.count({
      where: { suggestionId },
    });
    return { votedByUser: true, voteCount: count };
  }

  async deleteSuggestion(userId: string, suggestionId: string) {
    const suggestion = await this.suggestionRepo.findOne({
      where: { id: suggestionId },
    });
    if (!suggestion) throw new NotFoundException('Suggestion not found');
    if (suggestion.userId !== userId) {
      throw new BadRequestException('You can only delete your own suggestions');
    }
    await this.suggestionRepo.remove(suggestion);
    return { success: true };
  }

  async listActive() {
    return this.shopRepo.find({
      where: { isActive: true },
      order: { isFeatured: 'DESC', priceHours: 'ASC' },
      select: ['id', 'name', 'description', 'detailedDescription', 'imageUrl', 'priceHours', 'stock', 'sortOrder', 'isFeatured', 'estimatedShip'],
    });
  }

  /**
   * Purchase a shop item. Uses a serializable transaction with pessimistic
   * locking on both the user row and the shop item row to prevent race
   * conditions (double-spend, overselling).
   */
  async purchase(userId: string, shopItemId: string, quantity: number) {
    // Validate quantity upfront
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new BadRequestException('Quantity must be a positive integer');
    }
    if (quantity > 100) {
      throw new BadRequestException('Maximum quantity per order is 100');
    }

    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      // Lock the user row
      const user = await manager.findOne(User, {
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) throw new NotFoundException('User not found');

      // Lock the shop item row
      const item = await manager.findOne(ShopItem, {
        where: { id: shopItemId, isActive: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (!item) throw new NotFoundException('Shop item not found or inactive');

      // Check stock
      if (item.stock !== null) {
        if (item.stock < quantity) {
          throw new ConflictException(
            item.stock === 0
              ? 'This item is out of stock'
              : `Only ${item.stock} remaining`,
          );
        }
      }

      // Check budget (pipes)
      const totalCost = item.priceHours * quantity;
      if (user.pipes < totalCost) {
        throw new BadRequestException(
          `Not enough Pipes. You have ${user.pipes}, need ${totalCost}`,
        );
      }

      // Deduct pipes
      user.pipes -= totalCost;
      await manager.save(User, user);

      // Deduct stock if limited
      if (item.stock !== null) {
        item.stock -= quantity;
        // If stock hits 0, deactivate the item
        if (item.stock <= 0) {
          item.isActive = false;
        }
        await manager.save(ShopItem, item);
      }

      // Create order
      const order = manager.create(Order, {
        userId,
        shopItemId: item.id,
        quantity,
        pipesSpent: totalCost,
        itemName: item.name,
        status: 'pending',
      });
      const savedOrder = await manager.save(Order, order);

      // Create fulfillment update
      const update = manager.create(FulfillmentUpdate, {
        userId,
        orderId: savedOrder.id,
        message: 'Hey! we got the order - I\'ll keep you updated on when I get it fulfilled.',
        isRead: false,
      });
      await manager.save(FulfillmentUpdate, update);

      return {
        orderId: savedOrder.id,
        itemName: item.name,
        quantity,
        pipesSpent: totalCost,
        remainingPipes: user.pipes,
      };
    }).then(async (result) => {
      // Audit log outside the transaction
      await this.auditLogService.log(
        userId,
        'shop_purchase',
        `Purchased ${result.quantity}x ${result.itemName} for ${result.pipesSpent} Pipes`,
      );

      // Sync purchase date to Airtable for Loops
      this.userRepo.findOne({ where: { id: userId }, select: ['email'] }).then((u) => {
        if (u?.email) this.rsvpService.updateDateField(u.email, 'Loops - beestPurchasedItem');
      });

      this.notifyOrder(
        userId,
        orderPendingDm({
          orderId: result.orderId,
          itemName: result.itemName,
          quantity: result.quantity,
          cost: `${result.pipesSpent} Pipes`,
        }),
      );

      return result;
    });
  }

  /** Get user's pipes balance */
  async getPipes(userId: string): Promise<number> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['id', 'pipes'],
    });
    return user?.pipes ?? 0;
  }

  /** Get orders for a specific user */
  async getUserOrders(userId: string) {
    const orders = await this.orderRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      select: ['id', 'itemName', 'quantity', 'pipesSpent', 'status', 'createdAt'],
    });
    return orders;
  }

  /** Get fulfillment updates for a user */
  async getUserFulfillmentUpdates(userId: string) {
    const updates = await this.fulfillmentRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      relations: ['order'],
    });
    return updates.map((u) => ({
      id: u.id,
      orderId: u.orderId,
      itemName: u.order?.itemName ?? 'Unknown',
      message: u.message,
      isRead: u.isRead,
      createdAt: u.createdAt,
    }));
  }

  /** Mark all fulfillment updates as read for a user */
  async markUpdatesRead(userId: string) {
    await this.fulfillmentRepo.update({ userId, isRead: false }, { isRead: true });
  }

  /** Count unread fulfillment updates */
  async getUnreadCount(userId: string): Promise<number> {
    return this.fulfillmentRepo.count({ where: { userId, isRead: false } });
  }

  // ── Admin methods ──

  /** List all orders with filtering and sorting */
  async listAllOrders(options?: {
    shopItemId?: string;
    status?: string;
    sortBy?: 'oldest' | 'newest';
  }) {
    const qb = this.orderRepo
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.user', 'user')
      .select([
        'order.id',
        'order.userId',
        'order.shopItemId',
        'order.itemName',
        'order.quantity',
        'order.pipesSpent',
        'order.status',
        'order.hcbCardGrantId',
        'order.createdAt',
        'order.updatedAt',
        'user.id',
        'user.name',
        'user.nickname',
        'user.slackId',
        'user.email',
      ]);

    if (options?.shopItemId) {
      qb.andWhere('order.shopItemId = :shopItemId', {
        shopItemId: options.shopItemId,
      });
    }

    if (options?.status) {
      qb.andWhere('order.status = :status', { status: options.status });
    }

    if (options?.sortBy === 'oldest') {
      qb.orderBy('order.createdAt', 'ASC');
    } else {
      qb.orderBy('order.createdAt', 'DESC');
    }

    const orders = await qb.getMany();

    return orders.map((o) => ({
      id: o.id,
      userId: o.userId,
      shopItemId: o.shopItemId,
      itemName: o.itemName,
      quantity: o.quantity,
      pipesSpent: o.pipesSpent,
      status: o.status,
      hcbCardGrantId: o.hcbCardGrantId ?? null,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
      userName: o.user?.nickname || o.user?.name || 'Unknown',
      userSlackId: o.user?.slackId || null,
      userEmail: o.user?.email || null,
      pendingSince: o.status === 'pending'
        ? Math.floor((Date.now() - new Date(o.createdAt).getTime()) / (1000 * 60 * 60))
        : null,
    }));
  }

  /** Mark an order as fulfilled — uses pessimistic lock to prevent double-fulfill */
  async fulfillOrder(orderId: string) {
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const order = await manager.findOne(Order, {
        where: { id: orderId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) throw new NotFoundException('Order not found');
      if (order.status === 'fulfilled') {
        throw new BadRequestException('Order is already fulfilled');
      }

      order.status = 'fulfilled';
      await manager.save(Order, order);

      const update = manager.create(FulfillmentUpdate, {
        userId: order.userId,
        orderId: order.id,
        message: "Hey! I've sent out your order, its on the way to you :)",
        isRead: false,
      });
      await manager.save(FulfillmentUpdate, update);

      return order;
    }).then(async (order) => {
      await this.auditLogService.log(
        order.userId,
        'order_fulfilled',
        `Order for ${order.quantity}x ${order.itemName} was fulfilled`,
      );

      // Sync fulfillment date to Airtable for Loops
      this.userRepo.findOne({ where: { id: order.userId }, select: ['email'] }).then((u) => {
        if (u?.email) this.rsvpService.updateDateField(u.email, 'Loops - beestFulfilledOrder');
      });

      this.notifyOrder(
        order.userId,
        orderFulfilledDm({
          orderId: order.id,
          itemName: order.itemName,
          quantity: order.quantity,
          cost: `${order.pipesSpent} Pipes`,
        }),
      );

      return { success: true };
    });
  }

  /**
   * Refund an order — returns pipes, restocks the item, and deletes the order
   * (which cascades to its fulfillment updates). Used when an order can't be
   * fulfilled or was placed in error.
   *
   * `requireUserId` enforces that the order belongs to that user (used for
   * self-refunds); `requirePending` blocks refunds on already-fulfilled orders
   * — admins bypass both, users get both.
   */
  async refundOrder(
    orderId: string,
    opts: { adminId?: string; requireUserId?: string; requirePending?: boolean } = {},
  ) {
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const order = await manager.findOne(Order, {
        where: { id: orderId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) throw new NotFoundException('Order not found');
      if (opts.requireUserId && order.userId !== opts.requireUserId) {
        throw new ForbiddenException('You do not own this order');
      }
      if (opts.requirePending && order.status !== 'pending') {
        throw new BadRequestException(
          'Cannot refund an order that has already been fulfilled',
        );
      }
      // Money-safety: once a card grant has been issued, real funds have been
      // disbursed against this order. Refunding returns the pipes *and* deletes
      // the order row — the only record linking the grant to the order — which
      // both double-pays the recipient and breaks reconciliation. Block it for
      // everyone (self-refund and admin alike); a granted order must be handled
      // manually in HCB. This mirrors the same hcbCardGrantId lock that
      // HcbService.createCardGrantForOrder uses to prevent a second grant.
      if (order.hcbCardGrantId) {
        throw new ConflictException(
          `Cannot refund: an HCB card grant (${order.hcbCardGrantId}) has ` +
            'already been issued for this order. Reconcile it in HCB instead.',
        );
      }

      const user = await manager.findOne(User, {
        where: { id: order.userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (user) {
        user.pipes = (user.pipes ?? 0) + order.pipesSpent;
        await manager.save(User, user);
      }

      if (order.shopItemId) {
        const item = await manager.findOne(ShopItem, {
          where: { id: order.shopItemId },
          lock: { mode: 'pessimistic_write' },
        });
        if (item && item.stock !== null) {
          item.stock += order.quantity;
          await manager.save(ShopItem, item);
        }
      }

      const snapshot = {
        userId: order.userId,
        itemName: order.itemName,
        quantity: order.quantity,
        pipesSpent: order.pipesSpent,
      };
      await manager.remove(Order, order);
      return snapshot;
    }).then(async (snapshot) => {
      const isSelf = !!opts.requireUserId;
      await this.auditLogService.log(
        snapshot.userId,
        'order_refunded',
        isSelf
          ? `Self-refunded ${snapshot.quantity}x ${snapshot.itemName} (${snapshot.pipesSpent} Pipes returned)`
          : `Order for ${snapshot.quantity}x ${snapshot.itemName} was refunded (${snapshot.pipesSpent} Pipes returned)`,
      );
      if (opts.adminId) {
        await this.auditLogService.log(
          opts.adminId,
          'order_refunded',
          `Refunded ${snapshot.quantity}x ${snapshot.itemName} (${snapshot.pipesSpent} Pipes returned)`,
        );
      }
      return { success: true, refundedPipes: snapshot.pipesSpent };
    });
  }

  /**
   * Merge other pending orders by the same user for the same shop item into
   * the target order. The target keeps its id; quantity and pipesSpent are
   * summed, and any FulfillmentUpdate rows attached to the merged-from orders
   * are reassigned before those orders are removed. Admin-only — does not
   * notify the user.
   */
  async mergeOrders(targetOrderId: string, adminId?: string) {
    const result = await this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const target = await manager.findOne(Order, {
        where: { id: targetOrderId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!target) throw new NotFoundException('Order not found');
      if (target.status !== 'pending') {
        throw new BadRequestException('Only pending orders can be merged');
      }
      if (!target.shopItemId) {
        throw new BadRequestException(
          'Cannot merge orders for an item that no longer exists in the shop',
        );
      }

      const candidates = await manager.find(Order, {
        where: {
          userId: target.userId,
          shopItemId: target.shopItemId,
          status: 'pending',
        },
        lock: { mode: 'pessimistic_write' },
      });
      const others = candidates.filter((o) => o.id !== target.id);
      if (others.length === 0) {
        throw new BadRequestException('No matching duplicate orders to merge');
      }

      // Money-safety (mirrors refundOrder): never merge when any order in the
      // set carries an HCB card grant. Merging deletes the merged-from rows and
      // rewrites the target, which would destroy the grant↔order reconciliation
      // link and leave the surviving order re-grantable — a double real-money
      // payout, the same failure mode the refund guard prevents.
      const granted = [target, ...others].find((o) => o.hcbCardGrantId);
      if (granted) {
        throw new ConflictException(
          `Cannot merge: order ${granted.id} has an HCB card grant ` +
            `(${granted.hcbCardGrantId}). Reconcile it in HCB instead.`,
        );
      }

      let addedQty = 0;
      let addedPipes = 0;
      for (const o of others) {
        addedQty += o.quantity;
        addedPipes += o.pipesSpent;
      }
      target.quantity += addedQty;
      target.pipesSpent += addedPipes;
      await manager.save(Order, target);

      // Preserve any fulfillment-update rows on the merged-from orders by
      // reassigning them to the target before delete (FK cascades would
      // otherwise drop them when the parent order goes away).
      const otherIds = others.map((o) => o.id);
      await manager.update(
        FulfillmentUpdate,
        { orderId: In(otherIds) },
        { orderId: target.id },
      );

      await manager.remove(Order, others);

      return {
        target,
        mergedCount: others.length,
        addedQty,
        addedPipes,
      };
    });

    await this.auditLogService.log(
      result.target.userId,
      'order_merged',
      `Merged ${result.mergedCount} duplicate order(s) into one — now ${result.target.quantity}x ${result.target.itemName}`,
    );
    if (adminId) {
      await this.auditLogService.log(
        adminId,
        'order_merged',
        `Merged ${result.mergedCount} duplicate order(s) for ${result.target.itemName} (${result.target.quantity}x total)`,
      );
    }

    return {
      success: true,
      orderId: result.target.id,
      mergedCount: result.mergedCount,
      quantity: result.target.quantity,
      pipesSpent: result.target.pipesSpent,
    };
  }

  /** Send a custom fulfillment message */
  async sendFulfillmentMessage(orderId: string, message: string, adminId?: string) {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');

    const clean = message.replace(/[<>"`&\\]/g, '').replace(/\0/g, '').trim().slice(0, 500);
    if (!clean) throw new BadRequestException('Message cannot be empty');

    const update = this.fulfillmentRepo.create({
      userId: order.userId,
      orderId: order.id,
      message: clean,
      isRead: false,
    });
    await this.fulfillmentRepo.save(update);

    if (adminId) {
      await this.auditLogService.log(
        adminId,
        'admin_fulfillment_message',
        `Sent fulfillment message on order ${order.id} (${order.itemName})`,
      );
    }

    return { success: true };
  }
}

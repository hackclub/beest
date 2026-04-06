import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ShopItem } from '../entities/shop-item.entity';
import { Order } from '../entities/order.entity';
import { FulfillmentUpdate } from '../entities/fulfillment-update.entity';
import { User } from '../entities/user.entity';
import { AuditLogService } from '../audit-log/audit-log.service';

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
    private readonly dataSource: DataSource,
    private readonly auditLogService: AuditLogService,
  ) {}

  async listActive() {
    return this.shopRepo.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC' },
      select: ['id', 'name', 'description', 'imageUrl', 'priceHours', 'stock', 'sortOrder', 'estimatedShip'],
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
        'order.createdAt',
        'order.updatedAt',
        'user.id',
        'user.name',
        'user.nickname',
        'user.slackId',
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
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
      userName: o.user?.nickname || o.user?.name || 'Unknown',
      userSlackId: o.user?.slackId || null,
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
      return { success: true };
    });
  }

  /** Send a custom fulfillment message */
  async sendFulfillmentMessage(orderId: string, message: string) {
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

    return { success: true };
  }
}

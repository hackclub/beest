import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { ShopItem } from './shop-item.entity';

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'shop_item_id', nullable: true })
  shopItemId: string | null;

  @ManyToOne(() => ShopItem, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'shop_item_id' })
  shopItem: ShopItem;

  @Column({ type: 'integer' })
  quantity: number;

  @Column({ name: 'pipes_spent', type: 'integer' })
  pipesSpent: number;

  @Column({ name: 'item_name', length: 200 })
  itemName: string;

  @Column({ length: 20, default: 'pending' })
  status: string; // 'pending' | 'fulfilled' | 'cancelled'

  // Optional free-text note the buyer leaves for fulfillers at checkout.
  @Column({ name: 'fulfillment_notes', type: 'varchar', length: 500, nullable: true })
  fulfillmentNotes: string | null;

  // Null means the fulfilled-order certificate prompt has not been answered.
  @Column({ name: 'certificate_requested', type: 'boolean', nullable: true, default: null })
  certificateRequested: boolean | null;

  // External reference set by fulfillers (tracking ID, HCB grant URL, …).
  @Column({ type: 'varchar', length: 500, nullable: true })
  reference: string | null;

  // Per-order staff-only notes, editable by fulfillers (e.g. via Sidekick).
  @Column({ name: 'admin_notes', type: 'text', nullable: true })
  adminNotes: string | null;

  // Public ID (cdg_…) of the HCB card grant issued for this order, if any.
  // Acts as a per-order idempotency lock: a non-null value blocks re-granting.
  @Column({ name: 'hcb_card_grant_id', type: 'varchar', length: 64, nullable: true })
  hcbCardGrantId: string | null;

  // SILO grant ID returned by the SILO API for this order, if any.
  // Acts as a per-order idempotency lock: a non-null value blocks re-granting.
  @Column({ name: 'silo_grant_id', type: 'varchar', length: 64, nullable: true })
  siloGrantId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('shop_items')
export class ShopItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 200 })
  name: string;

  @Column({ length: 500 })
  description: string;

  @Column({ name: 'image_url', length: 500 })
  imageUrl: string;

  @Column({ name: 'price_hours', type: 'integer' })
  priceHours: number;

  @Column({ type: 'integer', nullable: true, default: null })
  stock: number | null;

  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'is_featured', type: 'boolean', default: false })
  isFeatured: boolean;

  // At most one item is super-featured at a time — it takes the "spotlight"
  // hero slot at the top of the shop. Enforced in AdminService, not the DB.
  @Column({ name: 'is_super_featured', type: 'boolean', default: false })
  isSuperFeatured: boolean;

  // Black-market items are only purchasable by users who have authored at
  // least one golden project (projects.is_golden).
  @Column({ name: 'is_black_market', type: 'boolean', default: false })
  isBlackMarket: boolean;

  // Per-country price overrides keyed by normalized country (uppercase, the
  // same form normalizeCountry() produces from Hack Club Auth addresses),
  // e.g. { "US": 120, "IN": 80 }. Users whose users.country matches a key pay
  // that price instead of priceHours; everyone else pays priceHours.
  @Column({ name: 'regional_prices', type: 'jsonb', nullable: true, default: null })
  regionalPrices: Record<string, number> | null;

  @Column({ name: 'detailed_description', type: 'text', nullable: true, default: null })
  detailedDescription: string | null;

  @Column({ name: 'estimated_ship', type: 'varchar', length: 200, nullable: true, default: null })
  estimatedShip: string | null;

  // Staff-facing fulfillment instructions shown only to fulfillers (in
  // Sidekick). Shared across all orders of this item.
  @Column({ name: 'fulfiller_context', type: 'text', nullable: true, default: null })
  fulfillerContext: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

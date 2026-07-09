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

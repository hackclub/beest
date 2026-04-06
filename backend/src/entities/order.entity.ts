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
  status: string; // 'pending' | 'fulfilled'

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

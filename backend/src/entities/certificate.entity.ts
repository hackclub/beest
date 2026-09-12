import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { Order } from './order.entity';

@Entity('certificates')
@Index('UQ_certificates_order_id', ['orderId'], { unique: true })
export class Certificate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'order_id', nullable: true })
  orderId: string | null;

  @ManyToOne(() => Order, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'order_id' })
  order: Order | null;

  // Recipient name for the certificate
  @Column({ name: 'recipient_name', length: 500 })
  recipientName: string;

  // Approved hours completed (fetched from user's projects or aggregated grant pipes)
  @Column({ name: 'approved_hours', type: 'integer' })
  approvedHours: number;

  // The reward/item name
  @Column({ name: 'award_item', type: 'text' })
  awardItem: string;

  // Unique certificate number (e.g., CERT-2025-001-UUID)
  @Column({ name: 'certificate_number', length: 64, unique: true })
  certificateNumber: string;

  // Full certificate text
  @Column({ name: 'certificate_text', type: 'text' })
  certificateText: string;

  // Dollar grant value ($5 * pipe no.) if this is a grant certificate
  @Column({ name: 'grant_value', type: 'integer', nullable: true })
  grantValue: number | null;

  // Indicates whether this is a grant certificate (aggregated per grant item)
  @Column({ name: 'is_grant', type: 'boolean', default: false })
  isGrant: boolean;


  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

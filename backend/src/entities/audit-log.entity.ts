import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

export const AUDIT_ACTIONS = [
  'project_created',
  'project_updated',
  'project_submitted',
  'project_deleted',
  'hackatime_connected',
  'hackatime_ownership_failed',
  'ban_reverted',
  'rsvp_submitted',
  'admin_ban',
  'admin_perms_change',
  'admin_watchlist_change',
  'admin_pipes_adjust',
  'project_reviewed',
  'admin_impersonate',
  'admin_resync_airtable',
  'shop_purchase',
  'order_fulfilled',
  'order_refunded',
  'order_merged',
  'devlog_created',
  'devlog_deleted',
  'hcb_connected',
  'card_grant_issued',
  'admin_shop_item_change',
  'admin_event_change',
  'admin_fulfillment_message',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ length: 50 })
  action: string;

  @Column({ length: 255 })
  label: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

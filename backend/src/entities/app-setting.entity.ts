import { Entity, PrimaryColumn, Column } from 'typeorm';

/**
 * Generic key/value store for global operational toggles that don't belong
 * to any single domain entity (e.g. pausing resubmission to clear the review
 * queue). One row per key.
 */
@Entity('app_settings')
export class AppSetting {
  @PrimaryColumn()
  key: string;

  @Column({ name: 'bool_value', type: 'boolean', default: false })
  boolValue: boolean;

  @Column({ name: 'updated_at', type: 'timestamptz', nullable: true })
  updatedAt: Date | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;
}

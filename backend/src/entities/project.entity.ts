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

export const VALID_PROJECT_STATUSES = [
  'unshipped',
  'unreviewed',
  'fraud_pending',
  'changes_needed',
  'approved',
] as const;

export type ProjectStatus = (typeof VALID_PROJECT_STATUSES)[number];

export const VALID_PROJECT_TYPES = [
  'web',
  'windows',
  'mac',
  'linux',
  'cross-platform',
  'python',
  'android',
  'ios',
  'hardware',
  'cad',
  'other',
] as const;

export type ProjectType = (typeof VALID_PROJECT_TYPES)[number];

@Entity('projects')
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ length: 50 })
  name: string;

  @Column({ length: 300 })
  description: string;

  @Column({ name: 'project_type', length: 20 })
  projectType: string;

  @Column({ type: 'varchar', name: 'code_url', length: 2048, nullable: true })
  codeUrl: string | null;

  @Column({ type: 'varchar', name: 'readme_url', length: 2048, nullable: true })
  readmeUrl: string | null;

  @Column({ type: 'varchar', name: 'demo_url', length: 2048, nullable: true })
  demoUrl: string | null;

  @Column({ type: 'varchar', name: 'screenshot_1_url', length: 2048, nullable: true })
  screenshot1Url: string | null;

  @Column({ type: 'varchar', name: 'screenshot_2_url', length: 2048, nullable: true })
  screenshot2Url: string | null;

  @Column({ type: 'varchar', nullable: true })
  claimedByReviewerId: string | null;

  @Column({ type: 'varchar', nullable: true })
  claimedByReviewerName: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  claimedAt: Date | null;

  @Column({ type: 'text', name: 'hackatime_project_name', nullable: true, transformer: {
    to: (value: string[] | null) => value && value.length > 0 ? JSON.stringify(value) : null,
    from: (value: string | null) => {
      if (!value) return [];
      try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : [value]; }
      catch { return [value]; }
    },
  }})
  hackatimeProjectName: string[];

  @Column({ name: 'status', length: 20, default: 'unshipped' })
  status: string;

  @Column({ type: 'real', name: 'override_hours', nullable: true })
  overrideHours: number | null;

  @Column({ type: 'real', name: 'internal_hours', nullable: true })
  internalHours: number | null;

  @Column({ type: 'boolean', name: 'is_update', default: false })
  isUpdate: boolean;

  @Column({ type: 'varchar', name: 'other_hc_program', length: 255, nullable: true })
  otherHcProgram: string | null;

  @Column({ type: 'varchar', name: 'ai_use', length: 200, nullable: true })
  aiUse: string | null;

  @Column({ type: 'integer', name: 'pipes_granted', default: 0 })
  pipesGranted: number;

  // Set by a reviewer on approval for exceptional projects. Grants the author
  // priority in the review queue and access to black-market shop items.
  @Column({ type: 'boolean', name: 'is_golden', default: false })
  isGolden: boolean;
  // Fraud-review axis, independent of `status` / functional approval. Set by a
  // Fraud Reviewer marking the project "not fraud" (cleared). Once cleared the
  // project leaves the fraud queue; the metadata is kept for the audit trail.
  @Column({ type: 'boolean', name: 'fraud_cleared', default: false })
  fraudCleared: boolean;

  @Column({ type: 'uuid', name: 'fraud_cleared_by_id', nullable: true })
  fraudClearedById: string | null;

  @Column({ type: 'varchar', name: 'fraud_cleared_by_name', length: 255, nullable: true })
  fraudClearedByName: string | null;

  @Column({ type: 'timestamptz', name: 'fraud_cleared_at', nullable: true })
  fraudClearedAt: Date | null;

  @Column({ type: 'text', name: 'fraud_clearance_note', nullable: true })
  fraudClearanceNote: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

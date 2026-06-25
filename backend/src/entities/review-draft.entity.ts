import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * An in-progress, not-yet-submitted review for a project. One draft per project
 * (the active review being written), auto-saved by the reviewer as they type and
 * cleared once a decision is taken. Lets a reviewer leave and come back — or a
 * teammate who opens the same project — without losing the work.
 */
@Entity('review_drafts')
export class ReviewDraft {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'uuid', name: 'project_id' })
  projectId: string;

  // Last reviewer to edit the draft.
  @Column({ type: 'uuid', name: 'reviewer_id' })
  reviewerId: string;

  @Column({ type: 'varchar', name: 'reviewer_name', nullable: true })
  reviewerName: string | null;

  @Column({ type: 'text', nullable: true })
  justification: string | null;

  @Column({ type: 'text', nullable: true })
  feedback: string | null;

  @Column({ type: 'text', name: 'internal_note', nullable: true })
  internalNote: string | null;

  @Column({ type: 'text', name: 'user_note', nullable: true })
  userNote: string | null;

  @Column({ type: 'boolean', name: 'hide_reviewer_name', default: false })
  hideReviewerName: boolean;

  @Column({ type: 'real', name: 'override_hours', nullable: true })
  overrideHours: number | null;

  @Column({ type: 'real', name: 'internal_hours', nullable: true })
  internalHours: number | null;

  @Column({ type: 'varchar', name: 'quick_reject_reason', nullable: true })
  quickRejectReason: string | null;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}

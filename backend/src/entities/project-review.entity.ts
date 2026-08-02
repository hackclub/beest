import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Project } from './project.entity';
import { Submission } from './submission.entity';
import { User } from './user.entity';

@Entity('project_reviews')
export class ProjectReview {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'project_id' })
  projectId: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @Column({ name: 'reviewer_id', nullable: true })
  reviewerId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'reviewer_id' })
  reviewer: User | null;

  @Column({ name: 'hide_reviewer_name', default: false })
  hideReviewerName: boolean;

  @Column({ name: 'submission_id', nullable: true })
  submissionId: string | null;

  @ManyToOne(() => Submission, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'submission_id' })
  submission: Submission;

  // 'approved' | 'changes_needed' | 'rejected' | 'returned'. A 'returned' row
  // is a first-pass approval that second-pass review sent back for re-review —
  // kept (not deleted) so timelines can show the discarded approval.
  @Column({ length: 20 })
  status: string;

  // Who returned this approval at second-pass review. Only set on rows with
  // status 'returned'.
  @Column({ name: 'returned_by_id', type: 'uuid', nullable: true })
  returnedById: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'returned_by_id' })
  returnedBy: User | null;

  // The reviewer's golden decision on an 'approved' first-pass row. Recorded
  // here at first pass but applied to project.is_golden only when the approval
  // is finalised at second-pass audit (like pipes) — a first-pass verdict is
  // not authoritative and must not unlock user-visible perks. NULL on
  // non-approve rows and legacy data.
  @Column({ type: 'boolean', nullable: true })
  golden: boolean | null;

  @Column({ type: 'text', nullable: true })
  feedback: string | null;

  @Column({ type: 'text', name: 'internal_note', nullable: true })
  internalNote: string | null;

  @Column({ type: 'text', name: 'override_justification', nullable: true })
  overrideJustification: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

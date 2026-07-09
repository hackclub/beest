import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Project } from './project.entity';
import { User } from './user.entity';

@Entity('submissions')
export class Submission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'project_id' })
  projectId: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'text', name: 'change_description', nullable: true })
  changeDescription: string | null;

  @Column({ name: 'min_hours_confirmed', default: false })
  minHoursConfirmed: boolean;

  @Column({ type: 'text', name: 'reviewer_note', nullable: true })
  reviewerNote: string | null;

  @Column({ length: 20, default: 'unreviewed' })
  status: string; // 'unreviewed' | 'approved' | 'changes_needed'

  @Column({ type: 'real', name: 'override_hours', nullable: true })
  overrideHours: number | null;

  // Hackatime hours for the linked projects at the moment of shipping.
  // Best-effort (null when Hackatime was unreachable or nothing is linked).
  @Column({ type: 'real', name: 'hours_snapshot', nullable: true })
  hoursSnapshot: number | null;

  // Reviewer-relevant project fields frozen at ship time, so per-ship
  // old→new diffs can be reconstructed later (e.g. for Sidekick timelines).
  @Column({ type: 'jsonb', name: 'project_snapshot', nullable: true })
  projectSnapshot: {
    title: string;
    description: string;
    codeUrl: string | null;
    demoUrl: string | null;
    screenshotUrl: string | null;
  } | null;

  @Column({ type: 'real', name: 'internal_hours', nullable: true })
  internalHours: number | null;

  @Column({ type: 'integer', name: 'pipes_granted', default: 0 })
  pipesGranted: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

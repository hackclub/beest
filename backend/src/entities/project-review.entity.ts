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

  @Column({ name: 'reviewer_id' })
  reviewerId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reviewer_id' })
  reviewer: User;

  @Column({ name: 'submission_id', nullable: true })
  submissionId: string | null;

  @ManyToOne(() => Submission, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'submission_id' })
  submission: Submission;

  @Column({ length: 20 })
  status: string;

  @Column({ type: 'text', nullable: true })
  feedback: string | null;

  @Column({ type: 'text', name: 'internal_note', nullable: true })
  internalNote: string | null;

  @Column({ type: 'text', name: 'override_justification', nullable: true })
  overrideJustification: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

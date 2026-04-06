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

  @Column({ length: 20, default: 'unreviewed' })
  status: string; // 'unreviewed' | 'approved' | 'changes_needed'

  @Column({ type: 'real', name: 'override_hours', nullable: true })
  overrideHours: number | null;

  @Column({ type: 'real', name: 'internal_hours', nullable: true })
  internalHours: number | null;

  @Column({ type: 'integer', name: 'pipes_granted', default: 0 })
  pipesGranted: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

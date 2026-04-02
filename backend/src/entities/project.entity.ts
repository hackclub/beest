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

export const VALID_PROJECT_TYPES = [
  'web',
  'windows',
  'mac',
  'linux',
  'cross-platform',
  'python',
  'android',
  'ios',
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

  @Column({ name: 'code_url', length: 2048, nullable: true })
  codeUrl: string | null;

  @Column({ name: 'readme_url', length: 2048, nullable: true })
  readmeUrl: string | null;

  @Column({ name: 'demo_url', length: 2048, nullable: true })
  demoUrl: string | null;

  @Column({ name: 'screenshot_1_url', length: 2048, nullable: true })
  screenshot1Url: string | null;

  @Column({ name: 'screenshot_2_url', length: 2048, nullable: true })
  screenshot2Url: string | null;

  @Column({ name: 'hackatime_project_name', length: 255, nullable: true })
  hackatimeProjectName: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

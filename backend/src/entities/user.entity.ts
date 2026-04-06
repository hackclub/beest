import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { encryptedTransformer } from '../crypto.util';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, name: 'hca_sub' })
  hcaSub: string;

  @Column({ type: 'text', transformer: encryptedTransformer })
  email: string;

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true })
  nickname: string;

  @Column({ nullable: true, name: 'slack_id' })
  slackId: string;

  @Column({ name: 'two_emails', default: false })
  twoEmails: boolean;

  @Column({ name: 'has_address', default: false })
  hasAddress: boolean;

  @Column({ name: 'has_birthdate', default: false })
  hasBirthdate: boolean;

  @Column({ nullable: true, name: 'hackatime_user_id' })
  hackatimeUserId: string;

  @Column({
    nullable: true,
    name: 'hackatime_token',
    type: 'text',
    transformer: encryptedTransformer,
  })
  hackatimeToken: string;

  @Column({ type: 'integer', default: 0 })
  pipes: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

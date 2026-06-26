import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn
}   from 'typeorm';
import { Project } from './project.entity';
import { Devlog } from './devlog.entity';

@Entity('lookout_sessions')
export class LookoutSession {
    @PrimaryGeneratedColumn('uuid')
    id: string;


    @Column({ name: 'project_id'})
    projectId: string;

    @ManyToOne(() => Project, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'project_id' })
    project: Project;

    @Column({ name: 'user_id' })
    userId: string;

    @Column({ type: 'varchar', name: 'lookout_session_id'})
    lookoutSessionId: string;

    @Column({ type: 'varchar' })
    token: string;

    @Column({ name: 'devlog_id', type: 'uuid', nullable: true })
    devlogId: string | null;

    @ManyToOne(() => Devlog, { onDelete: 'SET NULL', nullable: true })
    @JoinColumn({ name: 'devlog_id' })
    devlog: Devlog | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}


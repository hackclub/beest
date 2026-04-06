import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { HackatimeModule } from '../hackatime/hackatime.module';
import { RsvpModule } from '../rsvp/rsvp.module';
import { Project } from '../entities/project.entity';
import { ProjectReview } from '../entities/project-review.entity';
import { Comment } from '../entities/comment.entity';
import { Submission } from '../entities/submission.entity';
import { User } from '../entities/user.entity';
import { ProjectsController } from './projects.controller';
import { LeaderboardController } from './leaderboard.controller';
import { ProjectsService } from './projects.service';

@Module({
  imports: [AuthModule, AuditLogModule, HackatimeModule, RsvpModule, TypeOrmModule.forFeature([Project, ProjectReview, Comment, Submission, User])],
  controllers: [ProjectsController, LeaderboardController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}

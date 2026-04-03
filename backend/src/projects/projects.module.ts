import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { HackatimeModule } from '../hackatime/hackatime.module';
import { Project } from '../entities/project.entity';
import { User } from '../entities/user.entity';
import { ProjectsController } from './projects.controller';
import { LeaderboardController } from './leaderboard.controller';
import { ProjectsService } from './projects.service';

@Module({
  imports: [AuthModule, AuditLogModule, HackatimeModule, TypeOrmModule.forFeature([Project, User])],
  controllers: [ProjectsController, LeaderboardController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}

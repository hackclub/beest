import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { LookoutModule } from '../lookout/lookout.module';
import { Devlog } from '../entities/devlog.entity';
import { Project } from '../entities/project.entity';
import { DevlogsController } from './devlogs.controller';
import { DevlogsService } from './devlogs.service';

@Module({
  imports: [
    AuthModule,
    AuditLogModule,
    LookoutModule,
    TypeOrmModule.forFeature([Devlog, Project]),
  ],
  controllers: [DevlogsController],
  providers: [DevlogsService],
  exports: [DevlogsService],
})
export class DevlogsModule {}

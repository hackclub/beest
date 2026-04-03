import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { RsvpModule } from '../rsvp/rsvp.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { User } from '../entities/user.entity';
import { Session } from '../entities/session.entity';
import { Project } from '../entities/project.entity';
import { AuditLog } from '../entities/audit-log.entity';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { SuperAdminGuard } from './super-admin.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Session, Project, AuditLog]),
    AuthModule,
    RsvpModule,
    AuditLogModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, SuperAdminGuard],
})
export class AdminModule {}

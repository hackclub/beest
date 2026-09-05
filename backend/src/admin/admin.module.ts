import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { RsvpModule } from '../rsvp/rsvp.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { User } from '../entities/user.entity';
import { Session } from '../entities/session.entity';
import { Project } from '../entities/project.entity';
import { AuditLog } from '../entities/audit-log.entity';
import { NewsItem } from '../entities/news-item.entity';
import { ProjectReview } from '../entities/project-review.entity';
import { ShopItem } from '../entities/shop-item.entity';
import { Order } from '../entities/order.entity';
import { Submission } from '../entities/submission.entity';
import { Event } from '../entities/event.entity';
import { Comment } from '../entities/comment.entity';
import { FraudReview } from '../entities/fraud-review.entity';
import { ShopModule } from '../shop/shop.module';
import { HcaModule } from '../hca/hca.module';
import { DevlogsModule } from '../devlogs/devlogs.module';
import { LookoutModule } from '../lookout/lookout.module';
import { FraudReviewModule } from '../fraud-review/fraud-review.module';
import { ProjectAirtableSyncModule } from '../projects/project-airtable-sync.module';
import { IdentityModule } from '../identity/identity.module';
import { SlackModule } from '../slack/slack.module';
import { AttendModule } from '../attend/attend.module';
import { SettingsModule } from '../settings/settings.module';
import { AdminController } from './admin.controller';
import { AuditInternalController } from './audit-internal.controller';
import { AdminService } from './admin.service';
import { AuditService } from './audit.service';
import { IframeContextService } from './iframe-context.service';
import { SuperAdminGuard } from './super-admin.guard';
import { ReviewerGuard } from './reviewer.guard';
import { FraudReviewerGuard } from './fraud-reviewer.guard';
import { FulfillerGuard } from './fulfiller.guard';
import { AuditServiceKeyGuard } from './audit-service-key.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Session, Project, AuditLog, NewsItem, ProjectReview, ShopItem, Order, Submission, Event, Comment, FraudReview]),
    AuthModule,
    RsvpModule,
    AuditLogModule,
    ShopModule,
    HcaModule,
    DevlogsModule,
    LookoutModule,
    FraudReviewModule,
    ProjectAirtableSyncModule,
    IdentityModule,
    SlackModule,
    AttendModule,
    SettingsModule,
  ],
  controllers: [AdminController, AuditInternalController],
  providers: [
    AdminService,
    AuditService,
    IframeContextService,
    SuperAdminGuard,
    ReviewerGuard,
    FraudReviewerGuard,
    FulfillerGuard,
    AuditServiceKeyGuard,
  ],
  exports: [AdminService, AuditService],
})
export class AdminModule {}

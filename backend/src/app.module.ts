import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RsvpModule } from './rsvp/rsvp.module';
import { AuthModule } from './auth/auth.module';
import { HackatimeModule } from './hackatime/hackatime.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { ProjectsModule } from './projects/projects.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { AdminModule } from './admin/admin.module';
import { NewsModule } from './news/news.module';
import { ShopModule } from './shop/shop.module';
import { DevlogsModule } from './devlogs/devlogs.module';
import { FraudReviewModule } from './fraud-review/fraud-review.module';
import { LapseModule } from './lapse/lapse.module';
import { LookoutModule } from './lookout/lookout.module';
import { HcbModule } from './hcb/hcb.module';
import { SidekickModule } from './sidekick/sidekick.module';
import { SiloModule } from './silo/silo.module';
import { CertificateModule } from './certificates/certificate.module';
import { SettingsModule } from './settings/settings.module';
import { User } from './entities/user.entity';
import { Session } from './entities/session.entity';
import { Project } from './entities/project.entity';
import { AuditLog } from './entities/audit-log.entity';
import { NewsItem } from './entities/news-item.entity';
import { ProjectReview } from './entities/project-review.entity';
import { Comment } from './entities/comment.entity';
import { ShopItem } from './entities/shop-item.entity';
import { Order } from './entities/order.entity';
import { FulfillmentUpdate } from './entities/fulfillment-update.entity';
import { Submission } from './entities/submission.entity';
import { ShopSuggestion } from './entities/shop-suggestion.entity';
import { ShopSuggestionVote } from './entities/shop-suggestion-vote.entity';
import { Devlog } from './entities/devlog.entity';
import { Event } from './entities/event.entity';
import { FraudReview } from './entities/fraud-review.entity';
import { HcbCredential } from './entities/hcb-credential.entity';
import { LookoutSession } from './entities/lookout-session.entity';
import { Certificate } from './entities/certificate.entity';
import { AppSetting } from './entities/app-setting.entity';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.getOrThrow('DATABASE_URL'),
        entities: [User, Session, Project, AuditLog, NewsItem, ProjectReview, Comment, ShopItem, Order, FulfillmentUpdate, Submission, ShopSuggestion, ShopSuggestionVote, Devlog, Event, FraudReview, HcbCredential, LookoutSession, Certificate, AppSetting],
        migrations: [__dirname + '/migrations/*{.ts,.js}'],
        migrationsRun: true,
        synchronize: false,
      }),
    }),
    RsvpModule,
    AuthModule,
    HackatimeModule,
    OnboardingModule,
    ProjectsModule,
    AuditLogModule,
    AdminModule,
    NewsModule,
    ShopModule,
    DevlogsModule,
    FraudReviewModule,
    LapseModule,
    LookoutModule,
    HcbModule,
    SidekickModule,
    SiloModule,
    CertificateModule,
    SettingsModule,
  ],
})
export class AppModule {}

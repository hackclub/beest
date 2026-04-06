import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
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
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.getOrThrow('DATABASE_URL'),
        entities: [User, Session, Project, AuditLog, NewsItem, ProjectReview, Comment, ShopItem, Order, FulfillmentUpdate],
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
  ],
})
export class AppModule {}

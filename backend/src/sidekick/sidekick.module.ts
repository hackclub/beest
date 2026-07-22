import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminModule } from '../admin/admin.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { Comment } from '../entities/comment.entity';
import { FulfillmentUpdate } from '../entities/fulfillment-update.entity';
import { Order } from '../entities/order.entity';
import { Project } from '../entities/project.entity';
import { ProjectReview } from '../entities/project-review.entity';
import { ShopItem } from '../entities/shop-item.entity';
import { Submission } from '../entities/submission.entity';
import { User } from '../entities/user.entity';
import { HackatimeModule } from '../hackatime/hackatime.module';
import { HcaModule } from '../hca/hca.module';
import { LapseModule } from '../lapse/lapse.module';
import { ShopModule } from '../shop/shop.module';
import { SidekickAuthGuard } from './sidekick-auth.guard';
import { SidekickController } from './sidekick.controller';
import { SidekickService } from './sidekick.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Project,
      Submission,
      ProjectReview,
      Comment,
      User,
      Order,
      ShopItem,
      FulfillmentUpdate,
    ]),
    AdminModule,
    ShopModule,
    HcaModule,
    AuditLogModule,
    HackatimeModule,
    LapseModule,
  ],
  controllers: [SidekickController],
  providers: [SidekickService, SidekickAuthGuard],
})
export class SidekickModule {}

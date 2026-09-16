import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { RsvpModule } from '../rsvp/rsvp.module';
import { SlackModule } from '../slack/slack.module';
import { AttendModule } from '../attend/attend.module';
import { HcaModule } from '../hca/hca.module';
import { ShopItem } from '../entities/shop-item.entity';
import { Order } from '../entities/order.entity';
import { FulfillmentUpdate } from '../entities/fulfillment-update.entity';
import { User } from '../entities/user.entity';
import { ShopSuggestion } from '../entities/shop-suggestion.entity';
import { ShopSuggestionVote } from '../entities/shop-suggestion-vote.entity';
import { ShopController } from './shop.controller';
import { ShopService } from './shop.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ShopItem, Order, FulfillmentUpdate, User, ShopSuggestion, ShopSuggestionVote]),
    AuthModule,
    AuditLogModule,
    RsvpModule,
    SlackModule,
    AttendModule,
    HcaModule,
  ],
  controllers: [ShopController],
  providers: [ShopService],
  exports: [ShopService],
})
export class ShopModule {}

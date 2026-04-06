import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { ShopItem } from '../entities/shop-item.entity';
import { Order } from '../entities/order.entity';
import { FulfillmentUpdate } from '../entities/fulfillment-update.entity';
import { User } from '../entities/user.entity';
import { ShopController } from './shop.controller';
import { ShopService } from './shop.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ShopItem, Order, FulfillmentUpdate, User]),
    AuthModule,
    AuditLogModule,
  ],
  controllers: [ShopController],
  providers: [ShopService],
  exports: [ShopService],
})
export class ShopModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { RsvpModule } from '../rsvp/rsvp.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { HcbCredential } from '../entities/hcb-credential.entity';
import { Order } from '../entities/order.entity';
import { HcbService } from './hcb.service';
import { HcbController } from './hcb.controller';
import { SuperAdminGuard } from '../admin/super-admin.guard';
import { ShopModule } from '../shop/shop.module';

@Module({
  imports: [
    AuthModule,
    RsvpModule,
    AuditLogModule,
    ShopModule,
    TypeOrmModule.forFeature([HcbCredential, Order]),
  ],
  controllers: [HcbController],
  providers: [HcbService, SuperAdminGuard],
  exports: [HcbService],
})
export class HcbModule {}

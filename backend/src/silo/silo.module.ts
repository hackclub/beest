import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { RsvpModule } from '../rsvp/rsvp.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { Order } from '../entities/order.entity';
import { SiloService } from './silo.service';
import { SiloController } from './silo.controller';
import { SuperAdminGuard } from '../admin/super-admin.guard';

@Module({
  imports: [
    AuthModule,
    RsvpModule,
    AuditLogModule,
    TypeOrmModule.forFeature([Order]),
  ],
  controllers: [SiloController],
  providers: [SiloService, SuperAdminGuard],
  exports: [SiloService],
})
export class SiloModule {}

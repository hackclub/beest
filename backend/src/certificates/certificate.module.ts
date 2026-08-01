import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Certificate } from '../entities/certificate.entity';
import { Order } from '../entities/order.entity';
import { User } from '../entities/user.entity';
import { CertificateService } from './certificate.service';
import { CertificateController } from './certificate.controller';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Certificate, Order, User]),
    AuditLogModule,
  ],
  controllers: [CertificateController],
  providers: [CertificateService],
  exports: [CertificateService],
})
export class CertificateModule {}

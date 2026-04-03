import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { User } from '../entities/user.entity';
import { HackatimeService } from './hackatime.service';
import { HackatimeController } from './hackatime.controller';

@Module({
  imports: [AuthModule, AuditLogModule, TypeOrmModule.forFeature([User])],
  controllers: [HackatimeController],
  providers: [HackatimeService],
  exports: [HackatimeService],
})
export class HackatimeModule {}

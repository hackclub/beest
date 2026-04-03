import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { RsvpModule } from '../rsvp/rsvp.module';
import { User } from '../entities/user.entity';
import { Session } from '../entities/session.entity';
import { HackatimeService } from './hackatime.service';
import { HackatimeController } from './hackatime.controller';

@Module({
  imports: [AuthModule, AuditLogModule, RsvpModule, TypeOrmModule.forFeature([User, Session])],
  controllers: [HackatimeController],
  providers: [HackatimeService],
  exports: [HackatimeService],
})
export class HackatimeModule {}

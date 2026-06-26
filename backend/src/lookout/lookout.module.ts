import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { RsvpModule } from '../rsvp/rsvp.module';
import { Project } from '../entities/project.entity';
import { LookoutSession } from '../entities/lookout-session.entity';
import { LookoutService } from './lookout.service';
import { LookoutController } from './lookout.controller';

@Module({
  imports: [AuthModule, RsvpModule, TypeOrmModule.forFeature([Project, LookoutSession])],
  controllers: [LookoutController],
  providers: [LookoutService],
  exports: [LookoutService],
})
export class LookoutModule {}

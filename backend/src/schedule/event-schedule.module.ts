import { Module } from '@nestjs/common';
import { EventScheduleController } from './event-schedule.controller';
import { EventScheduleService } from './event-schedule.service';

@Module({
  controllers: [EventScheduleController],
  providers: [EventScheduleService],
})
export class EventScheduleModule {}

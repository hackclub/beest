import { Controller, Get } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { EventScheduleService } from './event-schedule.service';

@Controller('api/schedule')
export class EventScheduleController {
  constructor(private readonly eventScheduleService: EventScheduleService) {}

  /**
   * Public endpoint used by the /schedule page. Returns the Google Calendar
   * events for the event weekend; responses are cached service-side so the
   * throttle here only guards against hammering the cache.
   */
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Get()
  async getSchedule() {
    return { events: await this.eventScheduleService.getEvents() };
  }
}

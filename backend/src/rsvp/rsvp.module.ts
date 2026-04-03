import { Module } from '@nestjs/common';
import { RsvpService } from './rsvp.service';

@Module({
  providers: [RsvpService],
  exports: [RsvpService],
})
export class RsvpModule {}

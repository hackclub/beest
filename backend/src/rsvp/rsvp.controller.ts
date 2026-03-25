import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { RsvpService } from './rsvp.service';
import { CreateRsvpDto } from './rsvp.dto';

@Controller('api/rsvp')
export class RsvpController {
  constructor(private readonly rsvpService: RsvpService) {}

  @Post()
  async create(@Body() dto: CreateRsvpDto) {
    if (!dto.email || typeof dto.email !== 'string') {
      throw new BadRequestException('Email is required');
    }
    return this.rsvpService.createRsvp(dto.email);
  }
}

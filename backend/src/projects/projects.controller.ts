import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HackatimeService } from '../hackatime/hackatime.service';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './create-project.dto';

@Controller('api/projects')
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly hackatimeService: HackatimeService,
  ) {}

  /**
   * Returns total Hackatime hours across all of the user's linked projects.
   * Called on page load — Hackatime time increases without site interaction.
   */
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  @UseGuards(JwtAuthGuard)
  @Get('hours')
  async getHours(@Req() req: Request) {
    const user = (req as any).user;
    if (!user?.uid) throw new UnauthorizedException('No user identity');

    const projects = await this.projectsService.findByUser(user.uid);
    const linkedNames = projects
      .map((p) => p.hackatimeProjectName)
      .filter((n): n is string => !!n);

    return this.hackatimeService.getHoursForProjects(user.sub, linkedNames);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Req() req: Request, @Body() dto: CreateProjectDto) {
    const user = (req as any).user;
    if (!user?.uid) throw new UnauthorizedException('No user identity');

    return this.projectsService.create(dto, user.uid, user.sub);
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @UseGuards(JwtAuthGuard)
  @Get()
  async list(@Req() req: Request) {
    const userId = (req as any).user?.uid;
    if (!userId) throw new UnauthorizedException('No user identity');

    return this.projectsService.findByUser(userId);
  }
}

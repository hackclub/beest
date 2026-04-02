import { Controller, Get, Req, UseGuards, Logger } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HackatimeService } from '../hackatime/hackatime.service';
import { SlackService } from '../slack/slack.service';
import { ProjectsService } from '../projects/projects.service';
import { User } from '../entities/user.entity';

@Controller('api/onboarding')
export class OnboardingController {
  private readonly logger = new Logger(OnboardingController.name);

  constructor(
    private readonly hackatimeService: HackatimeService,
    private readonly slackService: SlackService,
    private readonly projectsService: ProjectsService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /**
   * Returns completion status for each onboarding step.
   * The frontend uses this to show "Complete! Move on?" vs action buttons.
   */
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  @UseGuards(JwtAuthGuard)
  @Get('status')
  async getStatus(@Req() req: Request) {
    const user = (req as any).user;

    // Check Slack membership by email
    let slack: 'full_member' | 'guest' | 'not_found' | 'error' = 'not_found';
    try {
      const dbUser = await this.userRepo.findOne({
        where: { hcaSub: user.sub },
        select: ['email'],
      });
      if (dbUser?.email) {
        slack = await this.slackService.checkMembership(dbUser.email);
      }
    } catch (err) {
      this.logger.error(`Slack membership check failed for ${user.sub}: ${err}`);
      slack = 'error';
    }

    return {
      hackatime: await this.hackatimeService.isConnected(user.sub),
      slack,
      project: await this.projectsService.userHasProjects(user.uid),
    };
  }
}

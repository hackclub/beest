import { Controller, Get, Post, Req, UseGuards, Logger } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HackatimeService } from '../hackatime/hackatime.service';
import { SlackService } from '../slack/slack.service';
import { ProjectsService } from '../projects/projects.service';
import { RsvpService } from '../rsvp/rsvp.service';
import { User } from '../entities/user.entity';

@Controller('api/onboarding')
export class OnboardingController {
  private readonly logger = new Logger(OnboardingController.name);

  constructor(
    private readonly hackatimeService: HackatimeService,
    private readonly slackService: SlackService,
    private readonly projectsService: ProjectsService,
    private readonly rsvpService: RsvpService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseGuards(JwtAuthGuard)
  @Post('two-emails')
  async setTwoEmails(@Req() req: Request) {
    const user = (req as any).user;
    await this.userRepo.update({ hcaSub: user.sub }, { twoEmails: true });
    return { ok: true };
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(JwtAuthGuard)
  @Post('mark-onboarded')
  async markOnboarded(@Req() req: Request) {
    const user = (req as any).user;
    const dbUser = await this.userRepo.findOne({
      where: { hcaSub: user.sub },
      select: ['email'],
    });
    if (dbUser?.email) {
      this.rsvpService.updateDateField(dbUser.email, 'Loops - beestOnboarded');
    }
    return { ok: true };
  }

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
        select: ['email', 'twoEmails'],
      });
      if (dbUser?.twoEmails) {
        // User confirmed they use a different email on Slack — skip email lookup
        slack = 'full_member';
      } else if (dbUser?.email) {
        slack = await this.slackService.checkMembership(dbUser.email);
      }
    } catch (err) {
      this.logger.error(`Slack membership check failed for ${user.sub}: ${err}`);
      slack = 'error';
    }

    const [hackatime, project] = await Promise.all([
      this.hackatimeService.isConnected(user.sub),
      this.projectsService.userHasProjects(user.uid),
    ]);

    // Sync tutorial completion date to Airtable for Loops
    const slackDone = slack === 'full_member';
    if (hackatime && slackDone && project) {
      const dbUserForSync = await this.userRepo.findOne({
        where: { hcaSub: user.sub },
        select: ['email'],
      });
      if (dbUserForSync?.email) {
        this.rsvpService.updateDateField(dbUserForSync.email, 'Loops - beestCompletedTutorial');
      }
    }

    return { hackatime, slack, project };
  }
}

import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HackatimeService } from '../hackatime/hackatime.service';
import { Project } from '../entities/project.entity';
import { ProjectReview } from '../entities/project-review.entity';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './create-project.dto';
import { UpdateProjectDto } from './update-project.dto';

@Controller('api/projects')
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly hackatimeService: HackatimeService,
    @InjectRepository(Project) private readonly projectRepo: Repository<Project>,
    @InjectRepository(ProjectReview) private readonly reviewRepo: Repository<ProjectReview>,
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
      .flatMap((p) => p.hackatimeProjectName ?? [])
      .filter((n): n is string => !!n);

    const { perProject } = await this.hackatimeService.getHoursForProjects(
      user.sub,
      [...new Set(linkedNames)],
    );

    const byStatus: Record<string, number> = {};
    let displayHours = 0;
    for (const p of projects) {
      const names = p.hackatimeProjectName ?? [];
      // Bucket fraud_pending under 'unreviewed' for the user's progress bar —
      // from the user's perspective these hours are still in review.
      const rawStatus = p.status ?? 'unshipped';
      const status = rawStatus === 'fraud_pending' ? 'unreviewed' : rawStatus;

      let currentHours = 0;
      for (const name of names) {
        if (perProject[name]) currentHours += perProject[name];
      }

      // Earned hours = the hours the user has been credited pipes for. Locked in
      // regardless of Hackatime's current state (renames, deletions, re-syncs).
      // A direct approved → changes_needed clears overrideHours/pipesGranted; the
      // unreviewed → changes_needed path keeps both, so pipes_granted > 0 is the
      // source of truth for credited hours.
      //
      // Edge case: legacy approvals from before admin.service started rejecting
      // <= 0 hours could land at overrideHours=0/pipesGranted=0 with status='approved'.
      // In that broken state we fall back to current Hackatime hours so the user
      // can see their work — re-review by an admin will lock in real values.
      let earnedHours = (p.pipesGranted ?? 0) > 0 ? (p.overrideHours ?? 0) : 0;
      if (status === 'approved' && earnedHours === 0 && currentHours > 0) {
        earnedHours = currentHours;
      }
      if (earnedHours > 0) {
        byStatus['approved'] = (byStatus['approved'] ?? 0) + earnedHours;
        displayHours += earnedHours;
      }

      // Hackatime hours beyond what's already been earned belong to the project's
      // current review state. For approved projects we hide them — they don't become
      // user-visible until the user resubmits (status flips to 'unreviewed'), at which
      // point this branch surfaces them in the right bucket. Showing them as
      // 'unshipped' while the project is approved was misleading.
      if (status !== 'approved') {
        const remainder = Math.max(0, currentHours - earnedHours);
        if (remainder > 0) {
          byStatus[status] = (byStatus[status] ?? 0) + remainder;
          displayHours += remainder;
        }
      }
    }

    return { hours: Math.round(displayHours * 10) / 10, byStatus };
  }

  /**
   * What the caller may still do now that BEEST has ended — drives the closure
   * modal and the disabled ship/resubmit controls. Declared above the ':id'
   * routes so the literal path wins.
   */
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @UseGuards(JwtAuthGuard)
  @Get('submission-window')
  async submissionWindow(@Req() req: Request) {
    const userId = (req as any).user?.uid;
    if (!userId) throw new UnauthorizedException('No user identity');
    return this.projectsService.getSubmissionWindow(userId);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(JwtAuthGuard)
  @Get('explore')
  async explore() {
    return this.projectsService.findApprovedProjects();
  }

  /**
   * Public endpoint used by the shipping guide page.
   * Returns average time-to-first-review per project type.
   */
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Get('review-stats')
  async reviewStats() {
    return this.projectsService.getReviewStats();
  }

  @Throttle({ default: { limit: 15, ttl: 60000 } })
  @UseGuards(JwtAuthGuard)
  @Get('explore/:id')
  async exploreDetail(@Param('id') id: string) {
    const project = await this.projectsService.findApprovedProjectById(id);
    if (!project) throw new UnauthorizedException('Project not found');
    return project;
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @UseGuards(JwtAuthGuard)
  @Get('explore/:id/comments')
  async getComments(@Param('id') projectId: string) {
    return this.projectsService.getComments(projectId);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(JwtAuthGuard)
  @Post('explore/:id/comments')
  async addComment(
    @Param('id') projectId: string,
    @Req() req: Request,
    @Body() body: { body?: string },
  ) {
    const user = (req as any).user;
    if (!user?.uid) throw new UnauthorizedException('No user identity');
    return this.projectsService.addComment(projectId, user.uid, body.body ?? '');
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(JwtAuthGuard)
  @Delete('explore/:id/comments/:commentId')
  async deleteComment(
    @Param('commentId') commentId: string,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    if (!user?.uid) throw new UnauthorizedException('No user identity');
    return this.projectsService.deleteComment(commentId, user.uid, user.email);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Req() req: Request, @Body() dto: CreateProjectDto) {
    const user = (req as any).user;
    if (!user?.uid) throw new UnauthorizedException('No user identity');

    return this.projectsService.create(dto, user.uid, user.sub, user.impersonator_name);
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @UseGuards(JwtAuthGuard)
  @Get()
  async list(@Req() req: Request) {
    const userId = (req as any).user?.uid;
    if (!userId) throw new UnauthorizedException('No user identity');

    return this.projectsService.findByUser(userId);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Req() req: Request,
    @Body() dto: UpdateProjectDto,
  ) {
    const user = (req as any).user;
    if (!user?.uid) throw new UnauthorizedException('No user identity');

    return this.projectsService.update(id, dto, user.uid, user.sub, user.impersonator_name);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(JwtAuthGuard)
  @Post(':id/resubmit')
  async resubmit(
    @Param('id') id: string,
    @Req() req: Request,
    @Body() body: { changeDescription?: string; minHoursConfirmed?: boolean; reviewerNote?: string | null },
  ) {
    const user = (req as any).user;
    if (!user?.uid) throw new UnauthorizedException('No user identity');
    if (!body.changeDescription || typeof body.changeDescription !== 'string') {
      throw new UnauthorizedException('changeDescription is required');
    }
    return this.projectsService.resubmit(
      id,
      user.uid,
      user.sub,
      body.changeDescription,
      body.minHoursConfirmed === true,
      body.reviewerNote ?? null,
      user.impersonator_name,
    );
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async delete(@Param('id') id: string, @Req() req: Request) {
    const user = (req as any).user;
    if (!user?.uid) throw new UnauthorizedException('No user identity');

    await this.projectsService.delete(id, user.uid, user.impersonator_name);
    return { deleted: true };
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @UseGuards(JwtAuthGuard)
  @Get(':id/queue-position')
  async queuePosition(@Param('id') id: string, @Req() req: Request) {
    const userId = (req as any).user?.uid;
    if (!userId) throw new UnauthorizedException('No user identity');
    return this.projectsService.getQueuePosition(id, userId);
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @UseGuards(JwtAuthGuard)
  @Get(':id/reviews')
  async getReviews(@Param('id') id: string, @Req() req: Request) {
    const userId = (req as any).user?.uid;
    if (!userId) throw new UnauthorizedException('No user identity');

    // Verify the project belongs to the authenticated user
    const project = await this.projectRepo.findOne({
      where: { id, userId },
      select: ['id', 'status'],
    });
    if (!project) throw new UnauthorizedException('Project not found');

    const reviews = await this.reviewRepo.find({
      where: { projectId: id },
      order: { createdAt: 'DESC' },
      relations: ['reviewer', 'submission'],
    });

    // Never expose internal notes to the user. 'returned' rows are first-pass
    // approvals invalidated at second-pass review — internal, never shown.
    // An 'approved' row whose submission is still 'unreviewed' is a first-pass
    // approval awaiting second-pass audit: not authoritative (the audit may
    // yet return it), so it must not be shown either. The submissionless
    // fallback covers legacy approve rows while the project sits in the
    // audit queue.
    return reviews
      .filter((r) => r.status !== 'returned')
      .filter(
        (r) =>
          !(
            r.status === 'approved' &&
            (r.submission?.status === 'unreviewed' ||
              (!r.submissionId && project.status === 'fraud_pending'))
          ),
      )
      .map((r) => ({
      id: r.id,
      status: r.status,
      feedback: r.feedback,
      reviewerName: r.hideReviewerName ? null : r.reviewer?.name ?? null,
      hideReviewerName: r.hideReviewerName ?? false,
      createdAt: r.createdAt,
    }));
  }
}

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
  BadRequestException,
  ParseUUIDPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SuperAdminGuard } from './super-admin.guard';
import { ReviewerGuard } from './reviewer.guard';
import { FraudReviewerGuard } from './fraud-reviewer.guard';
import { FulfillerGuard } from './fulfiller.guard';
import { AdminService } from './admin.service';
import { AuditService, type AuditAction } from './audit.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthService } from '../auth/auth.service';
import { ShopService } from '../shop/shop.service';
import { DevlogsService } from '../devlogs/devlogs.service';
import { LookoutService } from '../lookout/lookout.service';
import { AttendService } from '../attend/attend.service';
import { SettingsService } from '../settings/settings.service';
import { normalizeCountry } from '../country.util';

/**
 * Validates and normalizes the regionalPrices body field for shop item
 * create/update. Returns undefined when absent (leave unchanged), null to
 * clear all overrides, or a map with normalized-uppercase country keys and
 * positive-integer prices. Throws BadRequestException on anything else.
 */
function parseRegionalPrices(
  input: unknown,
): Record<string, number> | null | undefined {
  if (input === undefined) return undefined;
  if (input === null) return null;
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new BadRequestException(
      'regionalPrices must be an object mapping country to price, or null',
    );
  }
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length > 300) {
    throw new BadRequestException('regionalPrices has too many entries');
  }
  const out: Record<string, number> = {};
  for (const [rawKey, value] of entries) {
    const key = normalizeCountry(rawKey);
    if (!key) {
      throw new BadRequestException(
        'regionalPrices keys must be non-empty country names',
      );
    }
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
      throw new BadRequestException(
        'regionalPrices values must be positive integers',
      );
    }
    out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

@Controller('api/admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly auditService: AuditService,
    private readonly auditLogService: AuditLogService,
    private readonly authService: AuthService,
    private readonly shopService: ShopService,
    private readonly devlogsService: DevlogsService,
    private readonly lookoutService: LookoutService,
    private readonly attendService: AttendService,
    private readonly settingsService: SettingsService,
  ) {}

  @UseGuards(FulfillerGuard)
  @Get('users')
  listUsers() {
    return this.adminService.listUsers();
  }

  @UseGuards(FulfillerGuard)
  @Get('users/:id')
  getUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getUser(id);
  }

  @UseGuards(FulfillerGuard)
  @Post('users/:id/ban')
  async banUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const adminId = (req as any).user?.uid;
    const isSuperAdmin = (req as any).user?.perms === 'Super Admin';
    await this.adminService.banUser(id, adminId, isSuperAdmin);
    return { success: true };
  }

  @UseGuards(FulfillerGuard)
  @Patch('users/:id/perms')
  async updatePerms(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { perms?: string },
    @Req() req: Request,
  ) {
    if (!body.perms || typeof body.perms !== 'string') {
      throw new BadRequestException('perms is required');
    }
    const adminId = (req as any).user?.uid;
    const isSuperAdmin = (req as any).user?.perms === 'Super Admin';
    await this.adminService.updatePerms(id, body.perms, adminId, isSuperAdmin);
    return { success: true };
  }

  // Watchlist / cool-builder are reviewer-facing notes, not perms changes — any
  // reviewer can toggle them (ReviewerGuard), unlike ban/perms which are
  // Super-Admin only.
  @UseGuards(ReviewerGuard)
  @Patch('users/:id/watchlist')
  async setWatchlist(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { watchlisted?: boolean },
    @Req() req: Request,
  ) {
    if (typeof body.watchlisted !== 'boolean') {
      throw new BadRequestException('watchlisted (boolean) is required');
    }
    const adminId = (req as any).user?.uid;
    return this.adminService.setReviewerMarker(id, 'watchlisted', body.watchlisted, adminId);
  }

  @UseGuards(ReviewerGuard)
  @Patch('users/:id/cool-builder')
  async setCoolBuilder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { coolBuilder?: boolean },
    @Req() req: Request,
  ) {
    if (typeof body.coolBuilder !== 'boolean') {
      throw new BadRequestException('coolBuilder (boolean) is required');
    }
    const adminId = (req as any).user?.uid;
    return this.adminService.setReviewerMarker(id, 'coolBuilder', body.coolBuilder, adminId);
  }

  @UseGuards(SuperAdminGuard)
  @Patch('users/:id/pipes')
  async adjustPipes(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { delta?: number; reason?: string | null },
    @Req() req: Request,
  ) {
    if (typeof body.delta !== 'number' || !Number.isInteger(body.delta) || body.delta === 0) {
      throw new BadRequestException('delta must be a non-zero integer');
    }
    const MAX_DELTA = 100_000;
    if (Math.abs(body.delta) > MAX_DELTA) {
      throw new BadRequestException(`delta must be between -${MAX_DELTA} and ${MAX_DELTA}`);
    }
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 200) : null;
    const adminId = (req as any).user?.uid;
    const result = await this.adminService.adjustPipes(id, body.delta, reason || null, adminId);
    return { success: true, pipes: result.pipes };
  }

  @UseGuards(SuperAdminGuard)
  @Post('users/:id/impersonate')
  async impersonateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const admin = (req as any).user;
    const adminUid = admin?.uid as string;
    const adminName = admin?.name as string ?? 'Admin';

    // Look up target user's nickname for a friendlier log
    const targetUser = await this.adminService.getUser(id);
    const targetNick = targetUser.nickname || targetUser.name || id;

    // Log impersonation on both accounts
    await this.auditLogService.log(adminUid, 'admin_impersonate', `Started impersonating ${targetNick}`);
    await this.auditLogService.log(id, 'admin_impersonate', `Admin ${adminName} started impersonating this account`);

    return this.authService.issueImpersonationToken(id, adminUid, adminName);
  }

  // Manual escape hatch for AttendService.inviteParticipant failures (see
  // ShopService.alertAttendInviteFailure) — lets a Super Admin retry from the
  // user panel instead of needing DB/console access.
  @UseGuards(SuperAdminGuard)
  @Post('users/:id/attend-invite')
  async sendAttendInvite(@Param('id', ParseUUIDPipe) id: string) {
    const targetUser = await this.adminService.getUser(id);
    if (!targetUser.email) {
      throw new BadRequestException('User has no email on file');
    }

    const invited = await this.attendService.inviteParticipant(
      targetUser.email,
      targetUser.name,
    );

    await this.auditLogService.log(
      id,
      invited ? 'attend_invite_manual' : 'attend_invite_failed',
      invited
        ? `Admin manually sent an Attend invite to ${targetUser.email}`
        : `Attend invite failed for ${targetUser.email} — needs manual follow-up`,
    );

    return { success: invited };
  }

  @UseGuards(FulfillerGuard)
  @Get('stats/dau')
  getDailyActiveUsers() {
    return this.adminService.getDailyActiveUsers();
  }

  @UseGuards(FulfillerGuard)
  @Get('stats/dau/history')
  getDauHistory() {
    return this.adminService.getDauHistory();
  }

  @UseGuards(FulfillerGuard)
  @Get('stats/signups')
  getSignupsHistory() {
    return this.adminService.getSignupsHistory();
  }

  @UseGuards(JwtAuthGuard)
  @Get('events/upcoming')
  listUpcomingEvents() {
    return this.adminService.listUpcomingEvents();
  }

  @UseGuards(SuperAdminGuard)
  @Get('events')
  listEvents() {
    return this.adminService.listEvents();
  }

  @UseGuards(SuperAdminGuard)
  @Post('events')
  createEvent(
    @Body()
    body: {
      title?: string;
      description?: string | null;
      hostedBy?: string | null;
      startAt?: string;
      endAt?: string | null;
      url?: string | null;
    },
    @Req() req: Request,
  ) {
    return this.adminService.createEvent(body, (req as any).user?.uid);
  }

  @UseGuards(SuperAdminGuard)
  @Patch('events/:id')
  updateEvent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body()
    body: {
      title?: string;
      description?: string | null;
      hostedBy?: string | null;
      startAt?: string;
      endAt?: string | null;
      url?: string | null;
    },
    @Req() req: Request,
  ) {
    return this.adminService.updateEvent(id, body, (req as any).user?.uid);
  }

  @UseGuards(SuperAdminGuard)
  @Delete('events/:id')
  deleteEvent(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.adminService.deleteEvent(id, (req as any).user?.uid);
  }

  @UseGuards(FulfillerGuard)
  @Get('stats/funnel')
  getUserFunnel() {
    return this.adminService.getUserFunnel();
  }

  @UseGuards(SuperAdminGuard)
  @Get('stats/unreviewed-hours')
  getUnreviewedHours() {
    return this.adminService.getUnreviewedHours();
  }

  // ── Settings ──
  // Global operational toggles. Visible to any reviewer (so the review UI can
  // warn them), flippable only by a Super Admin.

  @UseGuards(ReviewerGuard)
  @Get('settings/resubmission-paused')
  async getResubmissionPaused() {
    return { paused: await this.settingsService.isResubmissionPaused() };
  }

  @UseGuards(SuperAdminGuard)
  @Post('settings/resubmission-paused')
  async setResubmissionPaused(
    @Body() body: { paused?: boolean },
    @Req() req: Request,
  ) {
    if (typeof body.paused !== 'boolean') {
      throw new BadRequestException('paused (boolean) is required');
    }
    const adminId = (req as any).user?.uid;
    await this.settingsService.setResubmissionPaused(body.paused, adminId);
    await this.auditLogService.log(
      adminId,
      'admin_settings_change',
      body.paused
        ? 'Paused resubmission to clear the review queue'
        : 'Resumed resubmission',
    );
    return { success: true, paused: body.paused };
  }

  // ── Projects ──

  @UseGuards(ReviewerGuard)
  @Get('projects')
  listProjects(@Req() req: Request) {
    const isSuperAdmin = (req as any).user?.perms === 'Super Admin';
    return this.adminService.listAllProjects(isSuperAdmin);
  }

  @UseGuards(ReviewerGuard)
  @Get('projects/hours')
  listProjectHours() {
    return this.adminService.getUnreviewedProjectHours();
  }

  @UseGuards(ReviewerGuard)
  @Get('projects/my-claims')
  getMyClaims(@Req() req: Request) {
    return this.adminService.getMyClaims((req as any).user?.uid);
  }

  @UseGuards(ReviewerGuard)
  @Get('projects/:id/hackatime')
  getProjectHackatime(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const isSuperAdmin = (req as any).user?.perms === 'Super Admin';
    return this.adminService.getProjectHackatime(id, isSuperAdmin);
  }

  @UseGuards(ReviewerGuard)
  @Post('projects/:id/claim')
  async claimProject(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const user = (req as any).user;
    return this.adminService.claimProject(id, user?.uid, user?.name ?? null);
  }

  @UseGuards(ReviewerGuard)
  @Delete('projects/:id/claim')
  async releaseProjectClaim(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    await this.adminService.releaseProjectClaim(id, (req as any).user?.uid);
    return { success: true };
  }

  @UseGuards(ReviewerGuard)
  @Post('projects/:id/review')
  async reviewProject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: {
      status?: string;
      feedback?: string;
      internalNote?: string;
      userNote?: string | null;
      hideReviewerName?: boolean;
      overrideJustification?: string;
      overrideHours?: number;
      internalHours?: number;
      golden?: boolean;
    },
    @Req() req: Request,
  ) {
    const validStatuses = ['approved', 'changes_needed', 'rejected', 'ban'];
    if (!body.status || !validStatuses.includes(body.status)) {
      throw new BadRequestException(`status must be one of: ${validStatuses.join(', ')}`);
    }

    const reviewer = (req as any).user;
    const reviewerId = reviewer?.uid;
    const isSuperAdmin = reviewer?.perms === 'Super Admin';
    const canBan = isSuperAdmin || reviewer?.perms === 'Fraud Reviewer';

    if (body.status === 'ban' && !canBan) {
      throw new BadRequestException('Only Super Admins and Fraud Reviewers can ban users. Flag this project in your internal note and ping Euan.');
    }

    const HOURS_CAP = 500;
    for (const [field, value] of [
      ['overrideHours', body.overrideHours] as const,
      ['internalHours', body.internalHours] as const,
    ]) {
      if (value === undefined || value === null) continue;
      if (!Number.isFinite(value) || value < 0 || value > HOURS_CAP) {
        throw new BadRequestException(`${field} must be a finite number between 0 and ${HOURS_CAP}`);
      }
    }

    // Reviewer must add their own reasoning beyond the auto-generated template
    // (~180 chars) — require at least 250 chars on overrideJustification for an
    // approve action so approvals aren't rubber-stamped. Rejections don't need
    // a long justification (the feedback field carries the user-facing reason).
    if (body.status === 'approved') {
      const justification = (body.overrideJustification ?? '').trim();
      const JUSTIFICATION_MIN = 250;
      if (justification.length < JUSTIFICATION_MIN) {
        throw new BadRequestException(
          `Override Justification must be at least ${JUSTIFICATION_MIN} characters — please add at least 70 characters of your own reasoning beyond the auto-generated template.`,
        );
      }
    }

    if (body.status === 'ban') {
      return this.adminService.banAndRejectProject(
        id,
        reviewerId,
        body.feedback ?? null,
        body.internalNote ?? null,
        body.userNote,
        body.hideReviewerName === true,
        body.overrideJustification ?? null,
        isSuperAdmin,
      );
    }

    return this.adminService.reviewProject(
      id,
      reviewerId,
      body.status,
      body.feedback ?? null,
      body.internalNote ?? null,
      body.userNote,
      body.hideReviewerName === true,
      body.overrideJustification ?? null,
      body.overrideHours ?? null,
      body.internalHours ?? null,
      typeof body.golden === 'boolean' ? body.golden : null,
    );
  }

  @UseGuards(ReviewerGuard)
  @Get('projects/:id/reviews')
  getProjectReviews(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getProjectReviews(id, true);
  }

  /** Devlog entries authored by the project owner and linked to this project. */
  @UseGuards(ReviewerGuard)
  @Get('projects/:id/devlogs')
  getProjectDevlogs(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const isSuperAdmin = (req as any).user?.perms === 'Super Admin';
    return this.devlogsService.findByProject(id, isSuperAdmin);
  }

  @UseGuards(ReviewerGuard)
  @Patch('devlogs/:id/review')
  reviewDevlog(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { approved?: boolean; approvedHours?: number | null },
    @Req() req: Request,
  ) {
    const reviewerId = (req as any).user?.uid;
    return this.devlogsService.reviewDevlog(id, reviewerId, {
      approved: body.approved === true,
      approvedHours: typeof body.approvedHours === 'number' ? body.approvedHours : null,
    });
  }
  
  /**
   * All Lookout timelapses for this project plus the total tracked time across
   * complete sessions. Surfaced in the review dashboard.
   */
  @UseGuards(ReviewerGuard)
  @Get('projects/:id/lookout')
  getProjectLookout(@Param('id', ParseUUIDPipe) id: string) {
    return this.lookoutService.listForProjectReview(id);
  }

  @UseGuards(ReviewerGuard)
  @Get('review-leaderboard')
  getReviewLeaderboard(@Req() req: Request) {
    const query = (req as any).query ?? {};
    const win = (query.window as string) ?? '7d';
    const validWindows = ['24h', '7d', '30d', 'all'];
    if (!validWindows.includes(win)) {
      throw new BadRequestException(`window must be one of: ${validWindows.join(', ')}`);
    }
    return this.adminService.getReviewLeaderboard(win as '24h' | '7d' | '30d' | 'all');
  }

  // ── Admin audit queue ──
  // Projects parked in 'fraud_pending' after first-reviewer approval are queued
  // here for a second-pass audit before pipes are paid out and the project syncs
  // to Airtable. Open to Super Admin and Fraud Reviewer.

  @UseGuards(FraudReviewerGuard)
  @Get('audit/queue')
  auditQueue() {
    return this.auditService.listQueue();
  }

  // Super-admin-only escape hatch: when the audit queue is empty, pull up to
  // 10 oldest unreviewed projects in as one-shot reviews (skips first-pass).
  @UseGuards(SuperAdminGuard)
  @Post('audit/load-unreviewed')
  async auditLoadUnreviewed(@Req() req: Request) {
    const superAdminId = (req as any).user?.uid;
    return this.auditService.loadUnreviewedIntoQueue(superAdminId);
  }

  // Mint an opaque, single-use context for the private audit iframe service.
  // The heartbeat display + anomaly heuristics live in that separate service;
  // the panel embeds it as `${AUDIT_SVC_URL}/panel?ctx=<ctx>`.
  @UseGuards(FraudReviewerGuard)
  @Post('audit/:id/iframe-context')
  async auditIframeContext(@Param('id', ParseUUIDPipe) id: string) {
    return this.auditService.mintIframeContext(id);
  }

  @UseGuards(FraudReviewerGuard)
  @Post('audit/:id/decision')
  async auditDecision(
    @Param('id', ParseUUIDPipe) id: string,
    @Body()
    body: {
      action?: string;
      overrideHours?: number | null;
      internalHours?: number | null;
      justification?: string | null;
      reviewerFeedback?: string | null;
      userFeedback?: string | null;
    },
    @Req() req: Request,
  ) {
    const validActions = ['approve', 'rereview', 'reject', 'hardReject', 'ban'];
    if (!body.action || !validActions.includes(body.action)) {
      throw new BadRequestException(
        `action must be one of: ${validActions.join(', ')}`,
      );
    }
    const reviewer = (req as any).user;
    const auditorId = reviewer?.uid;
    const isSuperAdmin = reviewer?.perms === 'Super Admin';
    if (body.action === 'ban' && !isSuperAdmin) {
      throw new BadRequestException(
        'Only Super Admins can ban from the audit panel.',
      );
    }
    return this.auditService.decide(id, auditorId, {
      action: body.action as AuditAction,
      overrideHours: body.overrideHours ?? null,
      internalHours: body.internalHours ?? null,
      justification: body.justification ?? null,
      reviewerFeedback: body.reviewerFeedback ?? null,
      userFeedback: body.userFeedback ?? null,
      isSuperAdmin,
    });
  }

  // Bulk-grant golden to every cool builder's projects (queue priority + black
  // market), DMing each. Skips builders who already have a golden project, so
  // it's safe to re-run.
  @UseGuards(SuperAdminGuard)
  @Post('golden/backfill-cool-builders')
  async backfillGoldenForCoolBuilders(@Req() req: Request) {
    const adminId = (req as any).user?.uid;
    return this.adminService.backfillGoldenForCoolBuilders(adminId);
  }

  @UseGuards(SuperAdminGuard)
  @Post('projects/:id/resync-airtable')
  async resyncAirtable(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const reviewerId = (req as any).user?.uid;
    return this.adminService.resyncProjectToAirtable(id, reviewerId);
  }

  // ── News CRUD ──

  @UseGuards(FulfillerGuard)
  @Get('news')
  listNews() {
    return this.adminService.listNews();
  }

  @UseGuards(FulfillerGuard)
  @Post('news')
  async createNews(@Body() body: { text?: string; displayDate?: string }) {
    if (!body.text || !body.displayDate) {
      throw new BadRequestException('text and displayDate are required');
    }
    return this.adminService.createNews(body.text, body.displayDate);
  }

  @UseGuards(FulfillerGuard)
  @Patch('news/:id')
  async updateNews(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { text?: string; displayDate?: string },
  ) {
    return this.adminService.updateNews(id, body);
  }

  @UseGuards(FulfillerGuard)
  @Delete('news/:id')
  async deleteNews(@Param('id', ParseUUIDPipe) id: string) {
    await this.adminService.deleteNews(id);
    return { success: true };
  }

  // ── Shop CRUD ──

  @UseGuards(FulfillerGuard)
  @Get('shop')
  listShopItems() {
    return this.adminService.listShopItems();
  }

  @UseGuards(FulfillerGuard)
  @Post('shop')
  async createShopItem(@Body() body: {
    name?: string;
    description?: string;
    detailedDescription?: string | null;
    imageUrl?: string;
    priceHours?: number;
    regionalPrices?: Record<string, number> | null;
    stock?: number | null;
    estimatedShip?: string | null;
    isActive?: boolean;
    isFeatured?: boolean;
    isSuperFeatured?: boolean;
    isBlackMarket?: boolean;
    isGrant?: boolean;
    grantInstructions?: string | null;
  }, @Req() req: Request) {
    if (!body.name || !body.description || !body.imageUrl || body.priceHours == null) {
      throw new BadRequestException('name, description, imageUrl, and priceHours are required');
    }
    if (!Number.isInteger(body.priceHours) || body.priceHours < 1) {
      throw new BadRequestException('priceHours must be a positive integer');
    }
    if (body.stock !== undefined && body.stock !== null) {
      if (!Number.isInteger(body.stock) || body.stock < 0) {
        throw new BadRequestException('stock must be a non-negative integer or null');
      }
    }
    return this.adminService.createShopItem({
      name: body.name,
      description: body.description,
      detailedDescription: body.detailedDescription,
      imageUrl: body.imageUrl,
      priceHours: body.priceHours,
      regionalPrices: parseRegionalPrices(body.regionalPrices),
      stock: body.stock,
      estimatedShip: body.estimatedShip,
      isActive: body.isActive,
      isFeatured: body.isFeatured,
      isSuperFeatured: body.isSuperFeatured,
      isBlackMarket: body.isBlackMarket,
      isGrant: body.isGrant,
      grantInstructions: body.grantInstructions,
    }, (req as any).user?.uid);
  }

  @UseGuards(FulfillerGuard)
  @Patch('shop/reorder')
  async reorderShopItems(@Body() body: { items?: { id: string; sortOrder: number }[] }) {
    if (!Array.isArray(body.items) || body.items.length === 0) {
      throw new BadRequestException('items array is required');
    }
    for (const item of body.items) {
      if (!item.id || typeof item.sortOrder !== 'number' || !Number.isInteger(item.sortOrder) || item.sortOrder < 0) {
        throw new BadRequestException('each item must have a valid id and non-negative integer sortOrder');
      }
    }
    await this.adminService.reorderShopItems(body.items);
    return { success: true };
  }

  @UseGuards(FulfillerGuard)
  @Patch('shop/:id')
  async updateShopItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: {
      name?: string;
      description?: string;
      detailedDescription?: string | null;
      imageUrl?: string;
      priceHours?: number;
      regionalPrices?: Record<string, number> | null;
      stock?: number | null;
      estimatedShip?: string | null;
      isActive?: boolean;
      isFeatured?: boolean;
      isSuperFeatured?: boolean;
      isBlackMarket?: boolean;
      isGrant?: boolean;
      grantInstructions?: string | null;
    },
    @Req() req: Request,
  ) {
    if (body.priceHours !== undefined) {
      if (!Number.isInteger(body.priceHours) || body.priceHours < 1) {
        throw new BadRequestException('priceHours must be a positive integer');
      }
    }
    if (body.stock !== undefined && body.stock !== null) {
      if (!Number.isInteger(body.stock) || body.stock < 0) {
        throw new BadRequestException('stock must be a non-negative integer or null');
      }
    }
    return this.adminService.updateShopItem(
      id,
      { ...body, regionalPrices: parseRegionalPrices(body.regionalPrices) },
      (req as any).user?.uid,
    );
  }

  @UseGuards(FulfillerGuard)
  @Delete('shop/:id')
  async deleteShopItem(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    await this.adminService.deleteShopItem(id, (req as any).user?.uid);
    return { success: true };
  }

  // Everyone who bought a specific item, aggregated one row per buyer.
  @UseGuards(FulfillerGuard)
  @Get('shop/:id/buyers')
  listItemBuyers(@Param('id', ParseUUIDPipe) id: string) {
    return this.shopService.listItemBuyers(id);
  }

  // ── Orders / Fulfillment ──

  @UseGuards(FulfillerGuard)
  @Get('orders')
  listOrders(@Req() req: Request) {
    const query = (req as any).query ?? {};
    return this.shopService.listAllOrders({
      shopItemId: query.shopItemId,
      status: query.status,
      sortBy: query.sortBy,
    });
  }

  @UseGuards(FulfillerGuard)
  @Get('orders/:id/detail')
  async getOrderDetail(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getOrderDetailForFulfillment(id);
  }

  @UseGuards(FulfillerGuard)
  @Post('orders/:id/fulfill')
  async fulfillOrder(@Param('id', ParseUUIDPipe) id: string) {
    return this.shopService.fulfillOrder(id);
  }

  @UseGuards(FulfillerGuard)
  @Post('orders/:id/refund')
  async refundOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const adminId = (req as any).user?.uid;
    return this.shopService.refundOrder(id, { adminId });
  }

  @UseGuards(FulfillerGuard)
  @Post('orders/:id/merge')
  async mergeOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const adminId = (req as any).user?.uid;
    return this.shopService.mergeOrders(id, adminId);
  }

  @UseGuards(FulfillerGuard)
  @Post('orders/:id/message')
  async sendFulfillmentMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { message?: string },
    @Req() req: Request,
  ) {
    if (!body.message || typeof body.message !== 'string') {
      throw new BadRequestException('message is required');
    }
    return this.shopService.sendFulfillmentMessage(id, body.message, (req as any).user?.uid);
  }
}

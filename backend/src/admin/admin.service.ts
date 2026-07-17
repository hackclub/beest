import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { Session } from '../entities/session.entity';
import { Project } from '../entities/project.entity';
import { AuditLog } from '../entities/audit-log.entity';
import { NewsItem } from '../entities/news-item.entity';
import { ProjectReview } from '../entities/project-review.entity';
import { ShopItem } from '../entities/shop-item.entity';
import { Order } from '../entities/order.entity';
import { Submission } from '../entities/submission.entity';
import { Event } from '../entities/event.entity';
import { RsvpService } from '../rsvp/rsvp.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { HcaService } from '../hca/hca.service';
import { fetchWithTimeout } from '../fetch.util';
import { HACKATIME_EVENT_START } from '../hackatime/hackatime.constants';
import { ProjectAirtableSyncService } from '../projects/project-airtable-sync.service';
import { SlackService } from '../slack/slack.service';
import { Cron } from '@nestjs/schedule';
import { SlackNotifyService } from '../slack/slack-notify.service';
import {
  reviewApprovedDm,
  reviewChangesNeededDm,
  reviewRejectedDm,
} from '../slack/slack-notify.templates';
import { ShopService } from '../shop/shop.service';
import { getFileHoursForProject } from '../hackatime/hackatime-file-breakdown';

const VALID_PERMS = [
  'User',
  'Helper',
  'Reviewer',
  'Fraud Reviewer',
  'Fulfiller',
  'Super Admin',
  'Banned',
] as const;

// Roles only a Super Admin may grant, or act upon (ban / change perms). A
// Fulfiller can moderate regular builders and promote them to Helper/Reviewer/
// Fraud Reviewer, but must not be able to mint peers (Fulfiller) or escalate to
// Super Admin — nor strip/ban an existing Fulfiller or Super Admin.
const ELEVATED_PERMS = ['Fulfiller', 'Super Admin'];

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  private static readonly AI_BREAKDOWN_CATEGORIES = new Set([
    'ai coding',
    'browsing',
    'meeting',
    'communicating',
  ]);
  private readonly hackatimeBaseUrl: string;
  private readonly hackatimeAdminKey: string | undefined;
  private readonly CLAIM_TTL_MS = 24 * 60 * 60 * 1000;

  private cleanReviewerUserNote(note: string | null | undefined): string | null {
    if (note === undefined) return null;
    if (note === null) return null;
    const trimmed = note.trim();
    if (!trimmed) return null;
    return trimmed.slice(0, 2000);
  }

  // DAU cache (5-minute TTL)
  private dauCache: { count: number; timestamp: number } | null = null;
  private readonly DAU_CACHE_TTL = 5 * 60 * 1000;

  // Unreviewed-hours cache (60-second TTL) — each refresh fans out to one
  // Hackatime /spans request per (unreviewed project × linked HT name), so
  // back-to-back stats-page loads must not multiply that fan-out.
  private unreviewedHoursCache: {
    payload: {
      totalHours: number;
      projectCount: number;
      approvalRate: number;
      decisionCount: number;
      predictedApprovedHours: number;
    };
    // Per-project Hackatime hours (projectId → logged hours) for the same
    // unreviewed set, so the Review Panel can sort by hours off one fan-out.
    projectHours: Record<string, number>;
    timestamp: number;
  } | null = null;
  private readonly UNREVIEWED_HOURS_CACHE_TTL = 60 * 1000;

  // Signups history cache (10-minute TTL) — Airtable call is moderately expensive
  private signupsCache: {
    payload: { daily: { date: string; count: number }[]; cumulative: { date: string; count: number }[]; total: number };
    timestamp: number;
  } | null = null;
  private readonly SIGNUPS_CACHE_TTL = 10 * 60 * 1000;

  // DAU history: cache of finalised per-day counts (YYYY-MM-DD → count).
  // Entries are only written for dates that are fully in the past (UTC),
  // so they never need invalidation.
  private readonly dauHistoryCache = new Map<string, number>();
  private dauHistoryInflight: Promise<void> | null = null;
  private static readonly DAU_HISTORY_START = '2026-04-03';

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Session) private readonly sessionRepo: Repository<Session>,
    @InjectRepository(Project) private readonly projectRepo: Repository<Project>,
    @InjectRepository(AuditLog) private readonly auditLogRepo: Repository<AuditLog>,
    @InjectRepository(NewsItem) private readonly newsRepo: Repository<NewsItem>,
    @InjectRepository(ProjectReview) private readonly reviewRepo: Repository<ProjectReview>,
    @InjectRepository(ShopItem) private readonly shopRepo: Repository<ShopItem>,
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(Submission) private readonly submissionRepo: Repository<Submission>,
    @InjectRepository(Event) private readonly eventRepo: Repository<Event>,
    private readonly rsvpService: RsvpService,
    private readonly auditLogService: AuditLogService,
    private readonly hcaService: HcaService,
    private readonly airtableSync: ProjectAirtableSyncService,
    private readonly slackService: SlackService,
    private readonly slackNotify: SlackNotifyService,
    private readonly shopService: ShopService,
  ) {
    this.hackatimeBaseUrl = this.configService.get(
      'HACKATIME_BASE_URL',
      'https://hackatime.hackclub.com',
    );
    this.hackatimeAdminKey = this.configService.get('HACKATIME_ADMIN_API_KEY');
    if (!this.hackatimeAdminKey) {
      this.logger.warn('HACKATIME_ADMIN_API_KEY not set — admin Hackatime lookups disabled');
    }
  }

  // Release project claims that have gone stale (reviewer claimed but never
  // decided within the TTL), so they don't sit locked forever.
  @Cron('0 * * * *', { name: 'expire-stale-project-claim' })
  async expireStaleProjectClaims(): Promise<void> {
    if (process.env.NODE_ENV !== 'production') return;
    const cutoff = new Date(Date.now() - this.CLAIM_TTL_MS);
    const result = await this.projectRepo
      .createQueryBuilder()
      .update()
      .set({ claimedByReviewerId: null, claimedByReviewerName: null, claimedAt: null })
      .where('"claimedAt" IS NOT NULL AND "claimedAt" < :cutoff', { cutoff })
      .execute();
    if (result.affected) {
      this.logger.log(`Expired ${result.affected} stale project claim(s)`);
    }
  }

  async listUsers(): Promise<any[]> {
    const [users, permsMap] = await Promise.all([
      // Only select the columns this listing uses. The default find() pulls every
      // column, which for each row runs the encryptedTransformer over hca_access_token
      // and hca_refresh_token (unused here) — decrypting two tokens per user across the
      // whole table for nothing. Naming the columns skips that work and trims the payload.
      this.userRepo.find({
        select: {
          id: true,
          hcaSub: true,
          name: true,
          nickname: true,
          slackId: true,
          email: true,
          hackatimeToken: true,
          createdAt: true,
        },
        order: { createdAt: 'DESC' },
      }),
      this.rsvpService.getAllPerms(),
    ]);
    return users.map((u) => ({
      id: u.id,
      hcaSub: u.hcaSub,
      name: u.name,
      nickname: u.nickname,
      slackId: u.slackId,
      email: u.email,
      hackatimeConnected: !!u.hackatimeToken,
      perms: (u.email ? permsMap.get(u.email.toLowerCase()) : null) ?? null,
      createdAt: u.createdAt,
    }));
  }

  async getUser(userId: string) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('User not found');

    const projects = await this.projectRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      select: ['id', 'name', 'status', 'projectType', 'createdAt'],
    });

    const orders = await this.orderRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      select: ['id', 'itemName', 'quantity', 'pipesSpent', 'status', 'createdAt'],
    });

    const sessions = await this.sessionRepo.count({ where: { userId } });

    const auditLogs = await this.auditLogRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 50,
      select: ['id', 'action', 'label', 'createdAt'],
    });

    let perms: string | null = null;
    try {
      if (user.email) {
        perms = await this.rsvpService.getPerms(user.email);
      }
    } catch {
      // Airtable lookup failed — don't block the response
    }

    return {
      id: user.id,
      hcaSub: user.hcaSub,
      name: user.name,
      nickname: user.nickname,
      slackId: user.slackId,
      email: user.email,
      hackatimeConnected: !!user.hackatimeToken,
      twoEmails: user.twoEmails,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      pipes: user.pipes ?? 0,
      perms,
      projects,
      orders,
      activeSessions: sessions,
      auditLogs,
    };
  }

  private async withEventHosts(events: Event[]): Promise<Array<Event & { hostedByName: string | null; hostedBySlackId: string | null }>> {
    const hostValues = Array.from(
      new Set(events.map((event) => event.hostedBy?.trim()).filter((hostedBy): hostedBy is string => !!hostedBy)),
    );
    if (hostValues.length === 0) {
      return events.map((event) => ({ ...event, hostedByName: null, hostedBySlackId: null }));
    }

    const hosts = await this.userRepo.find({
      where: [
        { slackId: In(hostValues) },
        { nickname: In(hostValues) },
        { name: In(hostValues) },
      ],
      select: ['hcaSub', 'slackId', 'name', 'nickname', 'email'],
    });
    const slackDisplayNames = new Map<string, string | null>();
    await Promise.all(
      hosts
        .filter((host) => !!host.slackId)
        .map(async (host) => {
          slackDisplayNames.set(host.slackId, await this.slackService.getUserDisplayName(host.slackId));
        }),
    );
    const hcaNicknames = new Map<string, string | null>();
    await Promise.all(
      hosts
        .filter((host) => !!host.slackId && !slackDisplayNames.get(host.slackId) && !host.nickname)
        .map(async (host) => {
          const identity = await this.hcaService.getIdentity(host.hcaSub);
          const nickname = typeof identity?.nickname === 'string' && identity.nickname.trim() ? identity.nickname.trim() : null;
          hcaNicknames.set(host.slackId, nickname);
        }),
    );

    const hostLookup = new Map<string, { name: string; slackId: string | null }>();
    for (const host of hosts) {
      const displayName = host.slackId
        ? slackDisplayNames.get(host.slackId) || host.nickname || hcaNicknames.get(host.slackId) || host.slackId
        : host.nickname || host.name || host.email;
      for (const key of [host.slackId, host.nickname, host.name]) {
        if (key && !hostLookup.has(key)) {
          hostLookup.set(key, { name: displayName, slackId: host.slackId ?? null });
        }
      }
    }

    return events.map((event) => ({
      ...event,
      hostedByName: event.hostedBy ? (hostLookup.get(event.hostedBy)?.name ?? event.hostedBy) : null,
      hostedBySlackId: event.hostedBy ? (hostLookup.get(event.hostedBy)?.slackId ?? null) : null,
    }));
  }

  async listEvents() {
    const events = await this.eventRepo.find({ order: { startAt: 'ASC', title: 'ASC' } });
    return this.withEventHosts(events);
  }

  async listUpcomingEvents() {
    const now = new Date();
    const events = await this.eventRepo
      .createQueryBuilder('event')
      .where('event.end_at IS NULL OR event.end_at >= :now', { now: now.toISOString() })
      .orderBy('event.start_at', 'ASC')
      .getMany();
    return this.withEventHosts(events);
  }

  async createEvent(body: {
    title?: string;
    description?: string | null;
    hostedBy?: string | null;
    startAt?: string;
    endAt?: string | null;
    url?: string | null;
  }, adminId?: string) {
    const title = (body.title ?? '').trim();
    const hostedBy = (body.hostedBy ?? '').trim();
    const startAt = body.startAt ? new Date(body.startAt) : null;
    const endAt = body.endAt ? new Date(body.endAt) : null;

    if (!title) {
      throw new BadRequestException('title is required');
    }
    if (!hostedBy) {
      throw new BadRequestException('hostedBy is required');
    }
    if (!startAt || Number.isNaN(startAt.getTime())) {
      throw new BadRequestException('startAt is required and must be a valid datetime');
    }
    if (endAt && Number.isNaN(endAt.getTime())) {
      throw new BadRequestException('endAt must be a valid datetime');
    }
    if (endAt && endAt < startAt) {
      throw new BadRequestException('endAt must be the same or after startAt');
    }

    const event = this.eventRepo.create({
      title,
      description: body.description?.trim() || null,
      hostedBy,
      startAt,
      endAt: endAt || null,
      url: body.url?.trim() || null,
    });
    const saved = await this.eventRepo.save(event);
    if (adminId) {
      await this.auditLogService.log(
        adminId,
        'admin_event_change',
        `Created event "${saved.title}"`,
      );
    }
    const [eventWithHost] = await this.withEventHosts([saved]);
    return eventWithHost;
  }

  async updateEvent(id: string, body: {
    title?: string;
    description?: string | null;
    hostedBy?: string | null;
    startAt?: string;
    endAt?: string | null;
    url?: string | null;
  }, adminId?: string) {
    const event = await this.eventRepo.findOne({ where: { id } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    if (body.title !== undefined) {
      event.title = body.title.trim() || event.title;
    }
    if (body.description !== undefined) {
      event.description = body.description?.trim() || null;
    }
    if (body.hostedBy !== undefined) {
      const hostedBy = body.hostedBy?.trim() || '';
      if (!hostedBy) {
        throw new BadRequestException('hostedBy is required');
      }
      event.hostedBy = hostedBy;
    }
    if (body.url !== undefined) {
      event.url = body.url?.trim() || null;
    }
    if (body.startAt !== undefined) {
      const startAt = new Date(body.startAt);
      if (Number.isNaN(startAt.getTime())) {
        throw new BadRequestException('startAt must be a valid datetime');
      }
      event.startAt = startAt;
    }
    if (body.endAt !== undefined) {
      const endAt = body.endAt ? new Date(body.endAt) : null;
      if (body.endAt && Number.isNaN(endAt?.getTime())) {
        throw new BadRequestException('endAt must be a valid datetime');
      }
      event.endAt = endAt;
    }
    if (event.endAt && event.endAt < event.startAt) {
      throw new BadRequestException('endAt must be the same or after startAt');
    }

    const saved = await this.eventRepo.save(event);
    if (adminId) {
      await this.auditLogService.log(
        adminId,
        'admin_event_change',
        `Updated event "${saved.title}"`,
      );
    }
    const [eventWithHost] = await this.withEventHosts([saved]);
    return eventWithHost;
  }

  async deleteEvent(id: string, adminId?: string) {
    const event = await this.eventRepo.findOne({ where: { id } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    await this.eventRepo.remove(event);
    if (adminId) {
      await this.auditLogService.log(
        adminId,
        'admin_event_change',
        `Deleted event "${event.title}"`,
      );
    }
    return { success: true };
  }

  async banUser(
    userId: string,
    adminId?: string,
    requesterIsSuperAdmin = true,
  ): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Fulfillers may ban regular builders but not other Fulfillers or Super Admins.
    if (!requesterIsSuperAdmin) {
      const targetPerms = await this.rsvpService.getPerms(user.email);
      if (targetPerms && ELEVATED_PERMS.includes(targetPerms)) {
        throw new ForbiddenException(
          'Only Super Admins can ban a Fulfiller or Super Admin.',
        );
      }
    }

    // 1. Update Airtable perms to Banned
    await this.rsvpService.updatePerms(user.email, 'Banned');

    // 2. Revoke all sessions for this user
    await this.sessionRepo.delete({ userId });

    // 3. Pull the user's in-flight work out of the review/audit queues so
    //    reviewers don't waste time on a banned account. 'unreviewed' projects
    //    sit in the first-review queue and 'fraud_pending' ones in the audit
    //    queue; both move to 'changes_needed' — the same terminal state a
    //    ban-via-project review leaves a project in. Open submissions are
    //    flipped too so nothing keeps the project queued.
    const queuedProjects = await this.projectRepo.find({
      where: { userId, status: In(['unreviewed', 'fraud_pending']) },
      select: ['id'],
    });
    if (queuedProjects.length > 0) {
      const projectIds = queuedProjects.map((p) => p.id);
      await this.projectRepo.update(
        { id: In(projectIds) },
        { status: 'changes_needed' },
      );
      await this.submissionRepo.update(
        { projectId: In(projectIds), status: 'unreviewed' },
        { status: 'changes_needed' },
      );
    }

    // 4. Refund the user's pending shop orders so they drop out of the
    //    fulfilment queue. refundOrder restocks the item and cascade-deletes
    //    the order's fulfilment updates; already-fulfilled orders are left as-is.
    //    Orders that already have an HCB card grant are excluded: refundOrder
    //    rejects them (the grant link must be reconciled in HCB by hand), and
    //    we must not let one such order abort the whole ban flow.
    const pendingOrders = await this.orderRepo.find({
      where: { userId, status: 'pending', hcbCardGrantId: IsNull() },
      select: ['id'],
    });
    for (const order of pendingOrders) {
      await this.shopService.refundOrder(order.id, { adminId });
    }

    // 5. Audit log on the banned user's record
    const identifier = user.name || user.slackId || user.hcaSub;
    const cleanup =
      queuedProjects.length || pendingOrders.length
        ? ` (cleared ${queuedProjects.length} queued project${queuedProjects.length === 1 ? '' : 's'}, ${pendingOrders.length} pending order${pendingOrders.length === 1 ? '' : 's'})`
        : '';
    await this.auditLogService.log(userId, 'admin_ban', `Banned user ${identifier}${cleanup}`);

    // 6. Audit log on the admin's record
    if (adminId) {
      await this.auditLogService.log(adminId, 'admin_ban', `Banned user ${identifier}${cleanup}`);
    }
  }

  async banAndRejectProject(
    projectId: string,
    reviewerId: string,
    feedback: string | null,
    internalNote: string | null,
    userNote: string | null | undefined,
    hideReviewerName: boolean,
    overrideJustification: string | null,
    requesterIsSuperAdmin: boolean,
  ) {
    const project = await this.projectRepo.findOne({
      where: { id: projectId },
      relations: ['user'],
    });
    if (!project) throw new NotFoundException('Project not found');
    if (project.userId === reviewerId) {
      throw new BadRequestException('You cannot review your own project');
    }

    if (userNote !== undefined) {
      project.user.reviewerUserNote = this.cleanReviewerUserNote(userNote);
      await this.userRepo.save(project.user);
    }

    // 1. Reject the project
    project.status = 'changes_needed';
    project.isGolden = false;
    await this.projectRepo.save(project);

    // 2. Save review record
    const review = this.reviewRepo.create({
      projectId,
      reviewerId,
      status: 'ban',
      feedback: feedback || null,
      internalNote: internalNote || null,
      hideReviewerName,
      overrideJustification: overrideJustification || null,
    });
    await this.reviewRepo.save(review);

    // 3. Ban the user — pass the requester's tier so a non-Super-Admin (e.g. a
    //    Fraud Reviewer) cannot ban a Fulfiller/Super Admin through the project
    //    -review path, matching the direct /ban endpoint's elevated-target guard.
    await this.banUser(project.userId, undefined, requesterIsSuperAdmin);

    // 4. Audit logs
    await this.auditLogService.log(project.userId, 'project_reviewed', `Project "${project.name}" was rejected`);
    await this.auditLogService.log(project.userId, 'admin_ban', `Banned via project review of "${project.name}"`);

    await this.projectRepo.update(projectId, {
      claimedByReviewerId: null,
      claimedByReviewerName: null,
      claimedAt: null,
    });

    return { success: true };
  }

  async adjustPipes(
    userId: string,
    delta: number,
    reason: string | null,
    adminId?: string,
  ): Promise<{ pipes: number }> {
    if (!Number.isInteger(delta) || delta === 0) {
      throw new BadRequestException('delta must be a non-zero integer');
    }

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Apply the adjustment atomically. `delta` is a validated integer, so it is
    // safe to inline into the SET expression. For revokes the WHERE clause
    // enforces the floor (`pipes >= -delta`) in the same statement, closing the
    // TOCTOU window where two concurrent revokes could each pass a read-time
    // check and drive the balance negative.
    const updateQb = this.userRepo
      .createQueryBuilder()
      .update(User)
      .set({ pipes: () => `pipes + ${delta}` })
      .where('id = :id', { id: userId });
    if (delta < 0) {
      updateQb.andWhere('pipes >= :min', { min: -delta });
    }
    const res = await updateQb.execute();
    if (!res.affected) {
      // Revoke rejected by the floor guard (grants always affect the row since
      // the user was found above).
      throw new BadRequestException(
        `Cannot revoke ${-delta} pipes — insufficient balance`,
      );
    }

    // Re-read for an accurate audit label (the value moved under the lock).
    const after = await this.userRepo.findOne({
      where: { id: userId },
      select: ['pipes'],
    });
    const next = after?.pipes ?? 0;
    const current = next - delta;

    const identifier = user.name || user.slackId || user.hcaSub;
    const verb = delta > 0 ? 'Granted' : 'Revoked';
    const reasonSuffix = reason ? ` — ${reason}` : '';
    const label = `${verb} ${Math.abs(delta)} pipes (${identifier}, ${current} → ${next})${reasonSuffix}`;
    await this.auditLogService.log(userId, 'admin_pipes_adjust', label);
    if (adminId) {
      await this.auditLogService.log(adminId, 'admin_pipes_adjust', label);
    }

    return { pipes: next };
  }

  async updatePerms(
    userId: string,
    perms: string,
    adminId?: string,
    requesterIsSuperAdmin = true,
  ): Promise<void> {
    if (!VALID_PERMS.includes(perms as any)) {
      throw new BadRequestException(
        `Invalid perms value. Must be one of: ${VALID_PERMS.join(', ')}`,
      );
    }

    // Setting perms to "Banned" must run the full ban flow (revoke sessions,
    // clear review/audit queues, refund pending orders) — never just flip the
    // Airtable status. banUser also enforces the same elevated-target guard.
    if (perms === 'Banned') {
      return this.banUser(userId, adminId, requesterIsSuperAdmin);
    }

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Fulfillers may promote builders, but not grant Fulfiller/Super Admin, nor
    // alter the perms of someone who already holds one of those roles.
    if (!requesterIsSuperAdmin) {
      if (ELEVATED_PERMS.includes(perms)) {
        throw new ForbiddenException(
          'Only Super Admins can grant the Fulfiller or Super Admin role.',
        );
      }
      const currentPerms = await this.rsvpService.getPerms(user.email);
      if (currentPerms && ELEVATED_PERMS.includes(currentPerms)) {
        throw new ForbiddenException(
          'Only Super Admins can change the perms of a Fulfiller or Super Admin.',
        );
      }
    }

    await this.rsvpService.updatePerms(user.email, perms);

    const identifier = user.name || user.slackId || user.hcaSub;
    await this.auditLogService.log(userId, 'admin_perms_change', `Changed ${identifier} perms to ${perms}`);

    if (adminId) {
      await this.auditLogService.log(adminId, 'admin_perms_change', `Changed ${identifier} perms to ${perms}`);
    }
  }

  /**
   * Toggle a reviewer-facing sentiment marker on a user. These are pure notes —
   * they do NOT alter the user's perms/access, so any reviewer (not just a Super
   * Admin) may set them. The two markers are mutually exclusive: enabling one
   * clears the other. Returns the resulting flags.
   */
  async setReviewerMarker(
    userId: string,
    marker: 'watchlisted' | 'coolBuilder',
    value: boolean,
    adminId?: string,
  ): Promise<{ watchlisted: boolean; coolBuilder: boolean }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    user[marker] = value;
    // Mutually exclusive — a builder can't be both watch-listed and cool.
    if (value) {
      const other = marker === 'watchlisted' ? 'coolBuilder' : 'watchlisted';
      user[other] = false;
    }
    await this.userRepo.save(user);

    const identifier = user.name || user.slackId || user.hcaSub;
    const label =
      marker === 'watchlisted'
        ? value
          ? `Added ${identifier} to the watchlist`
          : `Removed ${identifier} from the watchlist`
        : value
          ? `Marked ${identifier} as a cool builder`
          : `Unmarked ${identifier} as a cool builder`;
    await this.auditLogService.log(userId, 'admin_watchlist_change', label);
    if (adminId) {
      await this.auditLogService.log(adminId, 'admin_watchlist_change', label);
    }

    return { watchlisted: user.watchlisted, coolBuilder: user.coolBuilder };
  }

  // ── Projects ──

  async listAllProjects(isSuperAdmin: boolean) {
    const projects = await this.projectRepo.find({
      order: { createdAt: 'DESC' },
      relations: ['user'],
    });

    const statusCounts = {
      unshipped: 0,
      unreviewed: 0,
      fraud_pending: 0,
      changes_needed: 0,
      approved: 0,
      rejected: 0,
    };

    // Fetch latest submission for each project in a single query
    const latestSubmissions = await this.submissionRepo
      .createQueryBuilder('s')
      .distinctOn(['s.project_id'])
      .orderBy('s.project_id')
      .addOrderBy('s.created_at', 'DESC')
      .getMany();
    const submissionMap = new Map(latestSubmissions.map((s) => [s.projectId, s]));

    // Authors with any golden project get review-queue priority; computed from
    // the full (unfiltered) project list so the set is complete.
    const goldenAuthorIds = new Set(
      projects.filter((p) => p.isGolden).map((p) => p.userId),
    );

    const mapped = projects
      .filter((p) => isSuperAdmin || p.status !== 'unshipped')
      .map((p) => {
        if (p.status in statusCounts) {
          statusCounts[p.status as keyof typeof statusCounts]++;
        }
        const latestSub = submissionMap.get(p.id);
        return {
          id: p.id,
          name: p.name,
          description: p.description,
          projectType: p.projectType,
          status: p.status,
          codeUrl: p.codeUrl,
          demoUrl: p.demoUrl,
          readmeUrl: p.readmeUrl,
          screenshot1Url: p.screenshot1Url,
          screenshot2Url: p.screenshot2Url,
          hackatimeProjectName: p.hackatimeProjectName,
          isUpdate: p.isUpdate,
          isGolden: p.isGolden,
          otherHcProgram: p.otherHcProgram,
          aiUse: p.aiUse,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          claimedByReviewerId: p.claimedByReviewerId,
          claimedByReviewerName: p.claimedByReviewerName,
          claimedAt: p.claimedAt,
          user: {
            id: p.user?.id,
            name: isSuperAdmin ? p.user?.name : null,
            slackId: p.user?.slackId,
            reviewerUserNote: p.user?.reviewerUserNote ?? null,
            watchlisted: !!p.user?.watchlisted,
            coolBuilder: !!p.user?.coolBuilder,
            intent: p.user?.intent ?? null,
            hasGoldenProject: goldenAuthorIds.has(p.userId),
          },
          latestSubmission: latestSub ? {
            id: latestSub.id,
            changeDescription: latestSub.changeDescription,
            minHoursConfirmed: latestSub.minHoursConfirmed,
            reviewerNote: latestSub.reviewerNote,
            status: latestSub.status,
            createdAt: latestSub.createdAt,
          } : null,
        };
      });

    return { statusCounts, projects: mapped };
  }

  async reviewProject(
    projectId: string,
    reviewerId: string,
    status: string,
    feedback: string | null,
    internalNote: string | null,
    userNote: string | null | undefined,
    hideReviewerName: boolean,
    overrideJustification: string | null,
    overrideHours: number | null,
    internalHours: number | null,
    golden: boolean | null = null,
  ) {
    const project = await this.projectRepo.findOne({
      where: { id: projectId },
      relations: ['user'],
    });
    if (!project) throw new NotFoundException('Project not found');
    if (project.userId === reviewerId) {
      throw new BadRequestException('You cannot review your own project');
    }

    if (userNote !== undefined) {
      project.user.reviewerUserNote = this.cleanReviewerUserNote(userNote);
      await this.userRepo.save(project.user);
    }

    const previousStatus = project.status;
    const previousOverrideHours = project.overrideHours;

    // Block re-reviewing an already-approved project. Reviewers must send to
    // "changes needed" first (which claws back pipes and zeroes hours) before
    // re-approving. This prevents:
    //   - duplicate Airtable rows on accidental double-approve clicks
    //   - inflate-on-re-approve where a reviewer raises overrideHours on a
    //     project that's already paid out, granting extra pipes
    if (previousStatus === 'approved' && status === 'approved') {
      throw new BadRequestException(
        'Project is already approved. Send to "changes needed" first if you need to re-review.',
      );
    }
    // Block re-approving while still waiting on the fraud-review verdict.
    if (previousStatus === 'fraud_pending' && status === 'approved') {
      throw new BadRequestException(
        'Project is already awaiting fraud review. Wait for the verdict before re-reviewing.',
      );
    }

    // Find the latest unreviewed submission for this project
    const submission = await this.submissionRepo.findOne({
      where: { projectId, status: 'unreviewed' },
      order: { createdAt: 'DESC' },
    });

    // 1. Update project status and hours.
    //
    // On approval, the reviewer's submitted overrideHours/internalHours are the
    // DELTA for THIS submission — new work since the last approval — and are
    // ADDED on top of the project's existing approved hours, never overwriting.
    // For initial ships project.overrideHours is 0, so the delta becomes the
    // cumulative; for reships the delta accumulates on top of prior approvals.
    // After approved → changes_needed (which wipes hours/claws back pipes), the
    // project is back at 0, so a follow-up approval starts fresh from the delta.
    //
    // When the reviewer approves, the project does NOT go straight to 'approved'.
    // It moves to 'fraud_pending' first — the joe.fraud first-pass review must
    // clear before pipes are granted and the project syncs to Airtable. The
    // background poller in FraudReviewService observes the verdict and either
    // finalises the approval or marks the project changes_needed with a
    // generic user-facing message.
    project.status = status === 'approved' ? 'fraud_pending' : status;
    // Golden is decided per approval: the checkbox value on an approve review
    // sets or clears it. Non-approve reviews leave it alone here (revocation
    // of an approval clears it below, alongside the pipes clawback).
    if (status === 'approved' && golden !== null) {
      project.isGolden = golden;
    }
    if (status === 'approved') {
      if (overrideHours !== null && overrideHours !== undefined) {
        const delta = Math.round(overrideHours * 10) / 10;
        project.overrideHours = Math.round(((project.overrideHours ?? 0) + delta) * 10) / 10;
      }
      if (internalHours !== null && internalHours !== undefined) {
        const internalDelta = Math.round(internalHours * 10) / 10;
        project.internalHours = Math.round(((project.internalHours ?? 0) + internalDelta) * 10) / 10;
      }
    }

    // Hackatime cap: reviewer cannot approve more new hours than the user has
    // actually logged in Hackatime since the last approval (with a 0.5h buffer
    // for rounding). This refetches Hackatime server-side at approval time so a
    // tampered request body can't bypass it.
    if (
      status === 'approved' &&
      overrideHours !== null &&
      overrideHours !== undefined &&
      overrideHours > 0
    ) {
      try {
        const ht = await this.getProjectHackatime(projectId, false);
        const currentHackatime = ht?.totalHours ?? 0;
        const previousProjectHours = previousOverrideHours ?? 0;
        const allowedDelta = currentHackatime - previousProjectHours + 0.5;
        const submittedDelta = Math.round(overrideHours * 10) / 10;
        if (submittedDelta > allowedDelta) {
          const hackatimeDelta = Math.round((currentHackatime - previousProjectHours) * 10) / 10;
          throw new BadRequestException(
            `Cannot approve ${submittedDelta}h of new work — Hackatime shows only ${hackatimeDelta}h of new time since last approval. Reduce the approved hours, or send to "changes needed" if the hours look wrong.`,
          );
        }
      } catch (e) {
        if (e instanceof BadRequestException) throw e;
        // Hackatime fetch failed for an unrelated reason — log and proceed,
        // rather than blocking reviews on Hackatime outages.
        this.logger.warn(`Hackatime cap check failed for project ${projectId}: ${e}`);
      }
    }

    // project.overrideHours is the CUMULATIVE total approved hours for this
    // project (sum of submission deltas across all approved ships). Validate:
    //   - status=approved + finalHours <= 0 silently zeroes pipes_granted and,
    //     because the bar suppresses overflow on approved projects, makes the
    //     user's hours appear to vanish (moaz, 2026-05-05).
    //   - status=approved + finalHours < pipes_granted desyncs the bar from the
    //     pipes already paid out (sadrita, 2026-04-29).
    // To genuinely reduce a project's hours, route through changes_needed first
    // (which claws back pipes), then re-approve.
    if (status === 'approved') {
      const finalHours = project.overrideHours ?? 0;
      if (finalHours <= 0) {
        throw new BadRequestException(
          'Cannot approve a project at 0 hours. Enter a positive delta of new hours, or use "changes needed" to reject without granting pipes.',
        );
      }
      if (finalHours < (project.pipesGranted ?? 0)) {
        throw new BadRequestException(
          `Cannot reduce approved hours to ${finalHours} — ${project.pipesGranted} pipes have already been granted on this project. Send to "changes needed" first to claw back pipes.`,
        );
      }
    }

    await this.projectRepo.save(project);

    // 2a. Handle rejection.
    // - Direct approved → changes_needed: wipe overrideHours and claw back pipes (the approval is being revoked).
    // - unreviewed → changes_needed with prior approval (pipesGranted > 0): preserve the prior approval's
    //   hours and pipes — only the new resubmission is being rejected, the original approval still stands.
    // - Any other path into changes_needed (never approved): clear overrideHours so a reviewer-set value
    //   on the rejection doesn't bleed into the approved bucket on the next resubmission.
    if (status === 'changes_needed' || status === 'rejected') {
      if (previousStatus === 'approved') {
        project.overrideHours = 0;
        // The approval golden rode on is being revoked — revoke golden too.
        project.isGolden = false;
        if ((project.pipesGranted ?? 0) > 0) {
          const clawback = project.pipesGranted!;
          await this.userRepo.decrement({ id: project.userId }, 'pipes', clawback);
          project.pipesGranted = 0;
          this.logger.warn(`Clawed back ${clawback} pipes from user ${project.userId} for project ${project.id}`);
        }
        await this.projectRepo.save(project);
      } else if (previousStatus === 'unreviewed' && (project.pipesGranted ?? 0) > 0) {
        project.overrideHours = previousOverrideHours;
        await this.projectRepo.save(project);
      } else {
        project.overrideHours = 0;
        await this.projectRepo.save(project);
      }
    }

    // 2b. Pipe granting on the approved path is DEFERRED to the fraud-review
    //     poller (FraudReviewService.completeApproval). Clawback on the
    //     changes_needed path was already handled in section 2a above.

    // 3. Update the submission status and hours.
    //    On the approved path the submission stays at 'unreviewed' until the
    //    fraud poller flips it to 'approved' (or to 'changes_needed' on
    //    fraud-rejection). Only update here for the non-approved paths.
    if (submission) {
      if (overrideHours !== null && overrideHours !== undefined) {
        submission.overrideHours = Math.round(overrideHours * 10) / 10;
      }
      if (internalHours !== null && internalHours !== undefined) {
        submission.internalHours = Math.round(internalHours * 10) / 10;
      }
      if (status !== 'approved') {
        submission.status = status;
      }
      await this.submissionRepo.save(submission);
    }

    // 4. Save the review record (linked to submission if one exists)
    const review = this.reviewRepo.create({
      projectId,
      reviewerId,
      submissionId: submission?.id ?? null,
      status,
      feedback: feedback || null,
      internalNote: internalNote || null,
      hideReviewerName,
      overrideJustification: overrideJustification || null,
    });
    await this.reviewRepo.save(review);

    // 5. DM the builder about the decision (best-effort; never blocks review).
    // The reviewer-facing outcomes notify here — 'approved', 'changes_needed'
    // and 'rejected' (hard reject). The reviewer name is omitted when hidden.
    if (status === 'approved' || status === 'changes_needed' || status === 'rejected') {
      const reviewerName = hideReviewerName
        ? null
        : (
            await this.userRepo.findOne({
              where: { id: reviewerId },
              select: ['name'],
            })
          )?.name ?? null;
      const dmInput = {
        projectName: project.name,
        projectLink: project.codeUrl ?? project.demoUrl ?? null,
        reviewerName,
        feedback: feedback || null,
      };
      const message =
        status === 'approved'
          ? reviewApprovedDm(dmInput)
          : status === 'rejected'
            ? reviewRejectedDm(dmInput)
            : reviewChangesNeededDm(dmInput);
      await this.slackNotify.dm(
        project.user?.slackId,
        message.text,
        message.blocks,
      );
    }

    // 6. Audit log to the project owner (not the reviewer)
    const label =
      status === 'approved'
        ? `Project "${project.name}" was approved by reviewer`
        : status === 'rejected'
          ? `Project "${project.name}" was rejected`
          : `Project "${project.name}" received feedback`;
    await this.auditLogService.log(project.userId, 'project_reviewed', label);

    // A decided project no longer needs to be claimed — free it.
    await this.projectRepo.update(projectId, {
      claimedByReviewerId: null,
      claimedByReviewerName: null,
      claimedAt: null,
    });

    return { success: true };
  }

  async claimProject(projectId: string, reviewerId: string, reviewerName: string | null) {
    const project = await this.projectRepo.findOneBy({ id: projectId });
    if (!project) throw new NotFoundException('Project not found');

    const now = new Date();
    const isExpired =
      !project.claimedAt ||
      now.getTime() - project.claimedAt.getTime() > this.CLAIM_TTL_MS;
    const isOwnClaim = project.claimedByReviewerId === reviewerId;

    if (project.claimedByReviewerId && !isExpired && !isOwnClaim) {
      return { success: false, claimedBy: project.claimedByReviewerName };
    }

    await this.projectRepo.update(projectId, {
      claimedByReviewerId: reviewerId,
      claimedByReviewerName: reviewerName,
      claimedAt: now,
    });
    return { success: true, reviewerName };
  }

  async getMyClaims(reviewerId: string) {
    const cutoff = new Date(Date.now() - this.CLAIM_TTL_MS);
    const projects = await this.projectRepo.find({
      where: { claimedByReviewerId: reviewerId },
      order: { claimedAt: 'ASC' },
    });
    return projects
      .filter((p) => p.claimedAt && p.claimedAt > cutoff)
      .map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        projectType: p.projectType,
        claimedAt: p.claimedAt,
        expiresAt: new Date(p.claimedAt!.getTime() + this.CLAIM_TTL_MS),
      }));
  }

  async releaseProjectClaim(projectId: string, reviewerId: string) {
    const project = await this.projectRepo.findOneBy({ id: projectId });
    if (!project) return;

    if (project.claimedByReviewerId === reviewerId) {
      await this.projectRepo.update(projectId, {
        claimedByReviewerId: null,
        claimedByReviewerName: null,
        claimedAt: null,
      });
    }
  }

  async resyncProjectToAirtable(projectId: string, reviewerId: string) {
    const project = await this.projectRepo.findOne({
      where: { id: projectId },
      relations: ['user'],
    });
    if (!project) throw new NotFoundException('Project not found');
    if (project.status !== 'approved') {
      throw new BadRequestException('Only approved projects can be re-pushed to Airtable');
    }

    // Find the latest review and latest approved submission for this project to
    // include override justification and per-ship internal hours
    const latestReview = await this.reviewRepo.findOne({
      where: { projectId },
      order: { createdAt: 'DESC' },
    });
    const latestApprovedSub = await this.submissionRepo.findOne({
      where: { projectId, status: 'approved' },
      order: { createdAt: 'DESC' },
    });

    // Re-sync the funnel date fields
    if (project.user?.email) {
      this.rsvpService.updateDateField(project.user.email, 'Loops - beestApprovedProject');
    }

    // Re-push the full project record to Airtable Projects table
    try {
      await this.airtableSync.syncApprovedProject(
        project,
        latestReview?.overrideJustification ?? null,
        latestApprovedSub ?? null,
      );
    } catch (err) {
      this.logger.error(`Airtable resync failed for project ${projectId}: ${err}`);
      throw new BadRequestException('Failed to push project to Airtable — check server logs');
    }

    await this.auditLogService.log(
      reviewerId,
      'admin_resync_airtable',
      `Re-pushed project "${project.name}" to Airtable`,
    );

    return { success: true };
  }

  async getReviewLeaderboard(window: '24h' | '7d' | '30d' | 'all') {
    const windowMs: Record<typeof window, number | null> = {
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      'all': null,
    };
    const ms = windowMs[window];

    const qb = this.reviewRepo
      .createQueryBuilder('r')
      .leftJoin('r.reviewer', 'u')
      .select('r.reviewer_id', 'reviewerId')
      .addSelect('u.name', 'reviewerName')
      .addSelect('u.slack_id', 'reviewerSlackId')
      .addSelect('COUNT(*)::int', 'total')
      .addSelect("COUNT(*) FILTER (WHERE r.status = 'approved')::int", 'approved')
      .addSelect("COUNT(*) FILTER (WHERE r.status = 'changes_needed')::int", 'changesNeeded')
      .addSelect("COUNT(*) FILTER (WHERE r.status = 'ban')::int", 'banned')
      .groupBy('r.reviewer_id')
      .addGroupBy('u.name')
      .addGroupBy('u.slack_id')
      .orderBy('total', 'DESC');

    if (ms !== null) {
      qb.where('r.created_at > :cutoff', { cutoff: new Date(Date.now() - ms) });
    }

    const rows = await qb.getRawMany();
    return rows.map((r) => {
      const total = Number(r.total);
      const approved = Number(r.approved);
      return {
        reviewerId: r.reviewerId,
        reviewerName: r.reviewerName,
        reviewerSlackId: r.reviewerSlackId,
        total,
        approved,
        changesNeeded: Number(r.changesNeeded),
        banned: Number(r.banned),
        approvalPercent: total > 0 ? Math.round((approved / total) * 100) : 0,
      };
    });
  }

  async getProjectReviews(projectId: string, includeInternal: boolean) {
    const reviews = await this.reviewRepo.find({
      where: { projectId },
      order: { createdAt: 'DESC' },
      relations: ['reviewer'],
    });

    return reviews.map((r) => ({
      id: r.id,
      status: r.status,
      feedback: r.feedback,
      ...(includeInternal ? { internalNote: r.internalNote } : {}),
      overrideJustification: r.overrideJustification,
      reviewerName: r.reviewer?.name ?? null,
      hideReviewerName: r.hideReviewerName ?? false,
      createdAt: r.createdAt,
    }));
  }

  // ── Unified Airtable duplicate check ──

  /**
   * Checks the Unified Airtable "Approved Projects" table for a matching Code URL.
   *
   * Security constraints:
   * - This method is private — only callable within AdminService
   * - Only called from getProjectHackatime, which is behind SuperAdminGuard
   * - Only accepts HTTPS URLs (rejects anything else)
   * - The codeUrl is taken from the project's DB record, never from user input
   * - Returns only boolean match/error — no Airtable record data is ever exposed
   */
  private async checkUnifiedDuplicate(
    codeUrl: string,
  ): Promise<{ duplicate: boolean; error: boolean }> {
    if (!codeUrl) {
      return { duplicate: false, error: true };
    }

    // Only allow https:// URLs — reject anything that could be a formula injection
    try {
      const parsed = new URL(codeUrl);
      if (parsed.protocol !== 'https:') {
        return { duplicate: false, error: true };
      }
    } catch {
      return { duplicate: false, error: true };
    }

    // Escape for Airtable formula: double any backslashes, then escape single quotes
    const escaped = codeUrl.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const formula = `{Code URL} = '${escaped}'`;

    try {
      const params = new URLSearchParams({
        select: JSON.stringify({
          filterByFormula: formula,
          maxRecords: 1,
          fields: ['Code URL'],
        }),
      });
      const url = `https://api2.hackclub.com/v0.1/Unified%20YSWS%20Projects%20DB/Approved%20Projects?${params.toString()}`;
      this.logger.log(`Unified check: formula=${formula}`);
      const res = await fetchWithTimeout(url);
      if (!res.ok) {
        const body = await res.text();
        this.logger.warn(`Unified check failed (${res.status}): ${body}`);
        return { duplicate: false, error: true };
      }
      const records: any[] = await res.json() ?? [];
      this.logger.log(`Unified check: ${records.length} records found`);
      // Only expose match/no-match — never leak record contents
      return { duplicate: records.length > 0, error: false };
    } catch {
      return { duplicate: false, error: true };
    }
  }

  // ── Hackatime admin lookup ──

  private emptyHackatimeResult(
    projectId: string,
    user: User | null,
    isSuperAdmin: boolean,
    project?: Project | null,
  ) {
    return {
      projectId,
      hackatimeProjects: [],
      categories: [],
      totalHours: 0,
      aiHours: 0,
      nonAiHours: 0,
      fileBreakdown: [],
      earliestHeartbeat: null,
      startDate: HACKATIME_EVENT_START,
      previousApprovedHours: project?.overrideHours ?? 0,
      previousInternalHours: project?.internalHours ?? 0,
      trustLevel: null,
      linkedBanned: false,
      linkedEmail: null,
      linkedSlackUid: null,
      beestEmail: isSuperAdmin ? (user?.email ?? null) : null,
      beestSlackId: user?.slackId ?? null,
      emailMismatch: false,
      unifiedDuplicate: false,
      unifiedError: true,
    };
  }

  private async hackatimeGet(path: string): Promise<Response> {
    return fetchWithTimeout(`${this.hackatimeBaseUrl}${path}`, {
      headers: { Authorization: `Bearer ${this.hackatimeAdminKey}` },
    });
  }

  private async hackatimePost(path: string, body: object): Promise<Response> {
    return fetchWithTimeout(`${this.hackatimeBaseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.hackatimeAdminKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  }

  private buildHackatimeStatsQuery(
    projectNames: string[],
    cutoffDate: Date,
    options?: { totalSeconds?: boolean; categories?: string[]; featuresProjects?: boolean },
  ): string {
    const params = new URLSearchParams({
      start_date: cutoffDate.toISOString().split('T')[0],
      filter_by_project: projectNames.join(','),
    });
    if (options?.totalSeconds) {
      params.set('total_seconds', 'true');
    }
    if (options?.featuresProjects) {
      params.set('features', 'projects');
    }
    if (options?.categories && options.categories.length > 0) {
      params.set('filter_by_category', options.categories.join(','));
    }
    return params.toString().replace(/\+/g, '%20').replace(/%2C/g, ',');
  }

  /**
   * GET a Hackatime stats URL, preferring the builder's own OAuth token and
   * falling back to the admin key when that token is missing or rejected.
   * The per-user token is the most-scoped credential, but it's frequently
   * absent or expired (e.g. accounts resolved via admin email-lookup never
   * have one), so without this fallback the whole hours panel fails closed to
   * zeros — which reads to a reviewer as "did no work" rather than "lookup
   * failed". Returns the parsed JSON body, or null if both credentials fail.
   */
  private async fetchHackatimeStats(uri: string, userToken: string) {
    const attempt = async (token: string): Promise<Response | null> => {
      if (!token) return null;
      try {
        return await fetchWithTimeout(uri, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });
      } catch (err) {
        this.logger.warn(`Hackatime stats request errored: ${err}`);
        return null;
      }
    };

    // User token first (scoped/accurate), admin key as fallback on any failure.
    let response = await attempt(userToken);
    if (!response || !response.ok) {
      const adminResponse = await attempt(this.hackatimeAdminKey ?? '');
      if (adminResponse) response = adminResponse;
    }
    if (!response || !response.ok) return null;
    return response.json().catch(() => null);
  }

  private async fetchHackatimeStatsTotalSeconds(
    hackatimeUserId: string | number,
    projectNames: string[],
    accessToken: string,
    cutoffDate: Date,
    categories?: string[],
  ): Promise<number> {
    if (projectNames.length === 0) return 0;

    const qs = this.buildHackatimeStatsQuery(projectNames, cutoffDate, {
      totalSeconds: true,
      categories,
    });
    const uri = `${this.hackatimeBaseUrl}/api/v1/users/${encodeURIComponent(String(hackatimeUserId))}/stats?${qs}`;

    const responseData = await this.fetchHackatimeStats(uri, accessToken);
    const totalSeconds = responseData?.total_seconds;
    return typeof totalSeconds === 'number' ? totalSeconds : 0;
  }

  private async fetchHackatimeProjectDurations(
    hackatimeUserId: string | number,
    projectNames: string[],
    accessToken: string,
    cutoffDate: Date,
  ): Promise<Map<string, number>> {
    const durationsMap = new Map<string, number>();
    for (const projectName of projectNames) {
      durationsMap.set(projectName, 0);
    }
    if (projectNames.length === 0) return durationsMap;

    const qs = this.buildHackatimeStatsQuery(projectNames, cutoffDate, {
      featuresProjects: true,
    });
    const uri = `${this.hackatimeBaseUrl}/api/v1/users/${encodeURIComponent(String(hackatimeUserId))}/stats?${qs}`;

    const responseData = await this.fetchHackatimeStats(uri, accessToken);
    if (!responseData) return durationsMap;

    const projects = responseData?.data?.projects ?? responseData?.projects ?? [];
    if (!Array.isArray(projects)) {
      return durationsMap;
    }

    for (const project of projects) {
      const name = project?.name;
      if (typeof name === 'string' && projectNames.includes(name)) {
        const duration = typeof project?.total_seconds === 'number' ? project.total_seconds : Number(project?.total_seconds);
        durationsMap.set(name, Number.isFinite(duration) && duration > 0 ? duration : 0);
      }
    }

    return durationsMap;
  }

  private async fetchHackatimeCategoryBreakdown(
    hackatimeUserId: string | number,
    projectNames: string[],
    accessToken: string,
    cutoffDate: Date,
  ): Promise<{ name: string; totalSeconds: number; percent: number }[]> {
    if (projectNames.length === 0) return [];

    const qs = this.buildHackatimeStatsQuery(projectNames, cutoffDate);
    const uri = `${this.hackatimeBaseUrl}/api/v1/users/${encodeURIComponent(String(hackatimeUserId))}/stats?${qs}`;

    const statsBody = await this.fetchHackatimeStats(uri, accessToken);
    if (!statsBody) return [];

    const rawCats = statsBody?.data?.categories ?? statsBody?.categories ?? [];
    if (!Array.isArray(rawCats)) return [];

    const parsed = rawCats
      .map((c: { name?: unknown; total_seconds?: unknown }) => {
        const secs = typeof c?.total_seconds === 'number' ? c.total_seconds : Number(c?.total_seconds);
        return {
          name: typeof c?.name === 'string' ? c.name : '',
          totalSeconds: Number.isFinite(secs) && secs > 0 ? secs : 0,
        };
      })
      .filter((c) => c.name && c.totalSeconds > 0);

    const sum = parsed.reduce((s, c) => s + c.totalSeconds, 0);
    if (sum <= 0) return [];

    return parsed
      .map((c) => ({
        name: c.name,
        totalSeconds: c.totalSeconds,
        percent: Math.round((c.totalSeconds / sum) * 1000) / 10,
      }))
      .sort((a, b) => b.percent - a.percent);
  }

  /**
   * Facts for the auto-generated justification header that Beest's admin UI
   * pre-fills client-side (buildJustification in the admin frontend). The
   * Sidekick integration uses this to compose the same header server-side.
   * Best-effort: a failed lookup resolves to null / false rather than
   * throwing — a Hackatime or Airtable hiccup must never block an approval.
   */
  async getJustificationFacts(project: Project): Promise<{
    trackedHours: number | null;
    unifiedFirstSubmission: boolean;
  }> {
    const names = [...new Set((project.hackatimeProjectName ?? []).filter((n) => !!n))];
    const user = project.user;

    const [trackedHours, unified] = await Promise.all([
      (async () => {
        if (!user?.hackatimeUserId || names.length === 0) return null;
        try {
          const seconds = await this.fetchHackatimeStatsTotalSeconds(
            user.hackatimeUserId,
            names,
            user.hackatimeToken ?? '',
            new Date(`${HACKATIME_EVENT_START}T00:00:00.000Z`),
          );
          return Math.round((seconds / 3600) * 10) / 10;
        } catch (err) {
          this.logger.warn(`Justification Hackatime lookup failed for project ${project.id}: ${err}`);
          return null;
        }
      })(),
      this.checkUnifiedDuplicate(project.codeUrl ?? ''),
    ]);

    return {
      trackedHours,
      unifiedFirstSubmission: !unified.duplicate && !unified.error,
    };
  }

  async getProjectHackatime(projectId: string, isSuperAdmin: boolean) {
    if (!this.hackatimeAdminKey) {
      throw new BadRequestException('Hackatime admin API key not configured');
    }

    const project = await this.projectRepo.findOne({
      where: { id: projectId },
      relations: ['user'],
    });
    if (!project) throw new NotFoundException('Project not found');

    const hackatimeNames: string[] = project.hackatimeProjectName ?? [];
    const user = project.user;
    if (!user) {
      return this.emptyHackatimeResult(projectId, user, isSuperAdmin, project);
    }

    try {
      // 1. Resolve Hackatime user ID — prefer stored ID, fall back to email lookup, then OAuth token
      let hackatimeUserId: string | number | null = user.hackatimeUserId ?? null;
      if (!hackatimeUserId && user.email) {
        try {
          const emailRes = await this.hackatimePost(
            '/api/admin/v1/user/get_user_by_email',
            { email: user.email },
          );
          if (emailRes.ok) {
            const emailData = await emailRes.json();
            hackatimeUserId = emailData.user_id ?? emailData?.data?.user_id ?? null;
          }
        } catch (err) {
          this.logger.warn(`Hackatime email lookup failed for project ${projectId}: ${err}`);
        }
      }
      // Last resort: use the user's own Hackatime OAuth token to resolve their ID
      if (!hackatimeUserId && user.hackatimeToken) {
        try {
          const meRes = await fetchWithTimeout(
            `${this.hackatimeBaseUrl}/api/v1/authenticated/me`,
            { headers: { Authorization: `Bearer ${user.hackatimeToken}` } },
          );
          if (meRes.ok) {
            const meData = await meRes.json();
            const d = meData?.data ?? meData;
            hackatimeUserId = d?.id?.toString() ?? d?.user_id?.toString() ?? null;
            // Persist for future lookups
            if (hackatimeUserId) {
              user.hackatimeUserId = String(hackatimeUserId);
              await this.userRepo.save(user);
            }
          }
        } catch (err) {
          this.logger.warn(`Hackatime OAuth /me fallback failed for project ${projectId}: ${err}`);
        }
      }
      if (!hackatimeUserId) {
        return this.emptyHackatimeResult(projectId, user, isSuperAdmin, project);
      }

      // 2. Get user info (trust level), projects, and Unified duplicate check in parallel
      const [infoRes, projectsRes, unifiedResult] = await Promise.all([
        this.hackatimeGet(`/api/admin/v1/user/info?user_id=${hackatimeUserId}`),
        this.hackatimeGet(`/api/admin/v1/user/projects?user_id=${hackatimeUserId}`),
        this.checkUnifiedDuplicate(project.codeUrl ?? ''),
      ]);

      const debug: { infoStatus: number; projectsStatus: number; totalProjectsReturned: number; linkedNames: string[]; availableNames: string[] } = {
        infoStatus: infoRes.status,
        projectsStatus: projectsRes.status,
        totalProjectsReturned: 0,
        linkedNames: hackatimeNames,
        availableNames: [],
      };

      let trustLevel: string | null = null;
      let linkedBanned = false;
      let linkedEmail: string | null = null;
      let linkedSlackUid: string | null = null;
      let emailMismatch = false;
      if (infoRes.ok) {
        const infoData = await infoRes.json();
        const u = infoData?.user ?? infoData?.data ?? infoData ?? {};
        trustLevel = u?.trust_level ?? u?.trust_factor?.trust_level ?? null;
        linkedBanned = u?.banned === true;
        linkedSlackUid = typeof u?.slack_uid === 'string' ? u.slack_uid : null;
        const rawEmails = u?.email_addresses ?? u?.emails ?? [];
        if (Array.isArray(rawEmails) && rawEmails.length > 0) {
          const emails = rawEmails.filter(
            (e): e is string => typeof e === 'string',
          );
          linkedEmail = emails[0] ?? null;
          if (user.email) {
            const own = user.email.toLowerCase();
            emailMismatch = !emails.some((e) => e.toLowerCase() === own);
          }
        }
      }

      let matched: { name: string; hours: number; languages: string[]; firstHeartbeat: number | null }[] = [];
      let categories: { name: string; totalSeconds: number; percent: number }[] = [];
      if (projectsRes.ok) {
        const projData = await projectsRes.json();
        const allProjects: {
          name: string;
          total_duration: number;
          languages: string[];
          first_heartbeat?: number | string | null;
        }[] = projData?.projects ?? projData?.data ?? [];

        debug.totalProjectsReturned = allProjects.length;
        debug.availableNames = allProjects.map((p) => p.name);

        if (hackatimeNames.length > 0) {
          const nameSet = new Set(hackatimeNames);
          const matchedRaw = allProjects.filter((p) => nameSet.has(p.name));
          const projectNames = matchedRaw.map((p) => p.name);

          const hackatimeCutoffDate = new Date(`${HACKATIME_EVENT_START}T00:00:00.000Z`);
          const [totalSeconds, aiSeconds, perProjectDurations, categoryBreakdown] = await Promise.all([
            this.fetchHackatimeStatsTotalSeconds(
              hackatimeUserId,
              projectNames,
              user.hackatimeToken ?? '',
              hackatimeCutoffDate,
            ),
            this.fetchHackatimeStatsTotalSeconds(
              hackatimeUserId,
              projectNames,
              user.hackatimeToken ?? '',
              hackatimeCutoffDate,
              Array.from(AdminService.AI_BREAKDOWN_CATEGORIES),
            ),
            this.fetchHackatimeProjectDurations(
              hackatimeUserId,
              projectNames,
              user.hackatimeToken ?? '',
              hackatimeCutoffDate,
            ),
            this.fetchHackatimeCategoryBreakdown(
              hackatimeUserId,
              projectNames,
              user.hackatimeToken ?? '',
              hackatimeCutoffDate,
            ),
          ]);

          const endDate = AdminService.ymdUtc(new Date(Date.now() + 86_400_000));
          const fileBreakdowns = await Promise.all(
            projectNames.map((projectName) =>
              getFileHoursForProject({
                baseUrl: this.hackatimeBaseUrl,
                adminKey: this.hackatimeAdminKey!,
                hackatimeUserId,
                projectName,
                startDate: HACKATIME_EVENT_START,
                endDate,
                debugLog: (message) => this.logger.warn(message),
              }),
            ),
          );
          const fileBreakdownRows = [...fileBreakdowns.flat()]
            .reduce<Map<string, number>>((acc, row) => {
              acc.set(row.file, Math.round(((acc.get(row.file) ?? 0) + row.hours) * 10) / 10);
              return acc;
            }, new Map<string, number>());
          const fileBreakdown = [...fileBreakdownRows.entries()]
            .map(([file, hours]) => ({ file, hours }))
            .sort((a, b) => b.hours - a.hours);

          categories = categoryBreakdown;

          matched = matchedRaw.map((p) => {
            const fhRaw = p.first_heartbeat ?? null;
            let firstHeartbeat: number | null = null;
            if (fhRaw !== null && fhRaw !== undefined) {
              const n = typeof fhRaw === 'string' ? Number(fhRaw) : fhRaw;
              if (Number.isFinite(n) && n > 0) {
                firstHeartbeat = n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
              }
            }

            return {
              name: p.name,
              hours: Math.round(((perProjectDurations.get(p.name) ?? 0) / 3600) * 10) / 10,
              languages: p.languages ?? [],
              firstHeartbeat,
            };
          });

          const round1 = (n: number) => Math.round(n * 10) / 10;
          // Total = sum of the per-project, project-scoped durations so it matches
          // the per-project breakdown reviewers see and approve against. Hackatime's
          // top-level `total_seconds` scalar runs one combined session model across
          // all linked projects, de-duplicating overlapping cross-project activity,
          // so it can read LOWER than the summed per-project durations — which made
          // the audit panel (which surfaces only this total) disagree with the review
          // breakdown. Fall back to the scalar only if per-project durations are empty.
          const summedProjectSeconds = [...perProjectDurations.values()].reduce(
            (sum, secs) => sum + (Number.isFinite(secs) && secs > 0 ? secs : 0),
            0,
          );
          const scopedTotalSeconds =
            summedProjectSeconds > 0 ? summedProjectSeconds : totalSeconds;
          const totalRounded = round1(scopedTotalSeconds / 3600);
          const aiRounded = Math.min(totalRounded, round1(aiSeconds / 3600));
          const nonAiRounded = Math.max(0, round1(totalRounded - aiRounded));

          const heartbeatTimes = matched
            .map((p) => p.firstHeartbeat)
            .filter((t): t is number => t !== null);
          const earliestHeartbeat = heartbeatTimes.length > 0 ? Math.min(...heartbeatTimes) : null;

          const previousApprovedHours = project.overrideHours ?? 0;
          const previousInternalHours = project.internalHours ?? 0;

          return {
            projectId,
            hackatimeProjects: matched,
            categories,
            totalHours: totalRounded,
            aiHours: aiRounded,
            nonAiHours: nonAiRounded,
            earliestHeartbeat,
            startDate: HACKATIME_EVENT_START,
            previousApprovedHours,
            previousInternalHours,
            fileBreakdown,
            trustLevel,
            linkedBanned,
            linkedEmail: isSuperAdmin ? linkedEmail : null,
            linkedSlackUid,
            beestEmail: isSuperAdmin ? (user.email ?? null) : null,
            beestSlackId: user.slackId ?? null,
            emailMismatch,
            unifiedDuplicate: unifiedResult.duplicate,
            unifiedError: unifiedResult.error,
            debug,
          };
        }
      }

      const previousApprovedHours = project.overrideHours ?? 0;
      const previousInternalHours = project.internalHours ?? 0;

      return {
        projectId,
        hackatimeProjects: [],
        categories,
        totalHours: 0,
        aiHours: 0,
        nonAiHours: 0,
        earliestHeartbeat: null,
        startDate: HACKATIME_EVENT_START,
        previousApprovedHours,
        previousInternalHours,
        fileBreakdown: [],
        trustLevel,
        linkedBanned,
        linkedEmail: isSuperAdmin ? linkedEmail : null,
        linkedSlackUid,
        beestEmail: isSuperAdmin ? (user.email ?? null) : null,
        beestSlackId: user.slackId ?? null,
        emailMismatch,
        unifiedDuplicate: unifiedResult.duplicate,
        unifiedError: unifiedResult.error,
        debug,
      };
    } catch (err) {
      this.logger.error(`Hackatime admin lookup error for project ${projectId}: ${err}`);
      return {
        projectId,
        hackatimeProjects: [],
        categories: [],
        totalHours: 0,
        aiHours: 0,
        nonAiHours: 0,
        fileBreakdown: [],
        earliestHeartbeat: null,
        startDate: HACKATIME_EVENT_START,
        previousApprovedHours: project.overrideHours ?? 0,
        previousInternalHours: project.internalHours ?? 0,
        trustLevel: null,
        linkedBanned: false,
        linkedEmail: null,
        linkedSlackUid: null,
        beestEmail: null,
        beestSlackId: null,
        emailMismatch: false,
        unifiedDuplicate: false,
        unifiedError: true,
      };
    }
  }

  // ── Unreviewed hours ──

  /**
   * Sum of new Hackatime hours awaiting review across every project currently
   * in 'unreviewed' status, plus the historical per-decision approval rate and
   * a naive prediction of how many of those pending hours will end up approved.
   *
   * - Hours: for resubmissions the project's previously-approved `overrideHours`
   *   is subtracted, and event-window /spans are used (not lifetime totals) so
   *   pre-event Hackatime time is excluded — matches the per-project review UI.
   * - Approval rate: across every entry in project_reviews, treats both
   *   'changes_needed' and 'ban' as not-approved.
   * - Predicted approved hours: totalHours * approvalRate. This is intentionally
   *   simple — it ignores the fact that 'changes_needed' projects often come
   *   back and get approved on a later pass, so it's a lower-bound estimate.
   */
  async getUnreviewedHours(): Promise<{
    totalHours: number;
    projectCount: number;
    approvalRate: number;
    decisionCount: number;
    predictedApprovedHours: number;
  }> {
    if (
      this.unreviewedHoursCache &&
      Date.now() - this.unreviewedHoursCache.timestamp < this.UNREVIEWED_HOURS_CACHE_TTL
    ) {
      return this.unreviewedHoursCache.payload;
    }

    // Historical approval rate from project_reviews. Cheap query — single scan
    // over a small table — so it shares the unreviewed-hours cache TTL.
    const reviewCounts = await this.reviewRepo
      .createQueryBuilder('r')
      .select("COUNT(*) FILTER (WHERE r.status = 'approved')::int", 'approved')
      .addSelect("COUNT(*) FILTER (WHERE r.status = 'changes_needed')::int", 'changesNeeded')
      .addSelect("COUNT(*) FILTER (WHERE r.status = 'ban')::int", 'banned')
      .getRawOne<{ approved: string | number; changesNeeded: string | number; banned: string | number }>();
    const approved = Number(reviewCounts?.approved ?? 0);
    const changesNeeded = Number(reviewCounts?.changesNeeded ?? 0);
    const banned = Number(reviewCounts?.banned ?? 0);
    const decisionCount = approved + changesNeeded + banned;
    const approvalRate = decisionCount > 0 ? approved / decisionCount : 0;

    const projects = await this.projectRepo.find({
      where: { status: 'unreviewed' },
      relations: ['user'],
    });
    const projectCount = projects.length;

    if (!this.hackatimeAdminKey || projects.length === 0) {
      const payload = {
        totalHours: 0,
        projectCount,
        approvalRate,
        decisionCount,
        predictedApprovedHours: 0,
      };
      this.unreviewedHoursCache = { payload, projectHours: {}, timestamp: Date.now() };
      return payload;
    }

    // Flatten to (project, linked-name) pairs — /spans takes one project name
    // per request. Skip projects whose owner has no Hackatime linkage; their
    // contribution is 0 either way.
    const rows: { hackatimeUserId: string; projectName: string; projectId: string }[] = [];
    for (const p of projects) {
      if (!p.user?.hackatimeUserId) continue;
      if (!p.hackatimeProjectName || p.hackatimeProjectName.length === 0) continue;
      for (const name of p.hackatimeProjectName) {
        rows.push({
          hackatimeUserId: p.user.hackatimeUserId,
          projectName: name,
          projectId: p.id,
        });
      }
    }

    const endDatePadded = AdminService.ymdUtc(new Date(Date.now() + 86400_000));
    const secondsByProject = new Map<string, number>();

    const batchSize = 10;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      await Promise.allSettled(
        batch.map(async (row) => {
          try {
            const res = await this.hackatimeGet(
              `/api/v1/users/${encodeURIComponent(row.hackatimeUserId)}/heartbeats/spans` +
                `?start_date=${HACKATIME_EVENT_START}&end_date=${endDatePadded}` +
                `&project=${encodeURIComponent(row.projectName)}`,
            );
            if (!res.ok) return;
            const data = (await res.json()) as {
              spans?: { start_time?: number; end_time?: number; duration?: number }[];
            };
            let seconds = 0;
            for (const span of data.spans ?? []) {
              if (
                typeof span.duration === 'number' &&
                Number.isFinite(span.duration) &&
                span.duration > 0
              ) {
                seconds += span.duration;
                continue;
              }
              if (
                typeof span.start_time === 'number' &&
                typeof span.end_time === 'number' &&
                Number.isFinite(span.start_time) &&
                Number.isFinite(span.end_time) &&
                span.end_time > span.start_time
              ) {
                const diff = span.end_time - span.start_time;
                seconds += diff > 1e9 ? diff / 1000 : diff;
              }
            }
            secondsByProject.set(
              row.projectId,
              (secondsByProject.get(row.projectId) ?? 0) + seconds,
            );
          } catch (err) {
            this.logger.warn(
              `Unreviewed-hours span fetch failed for project ${row.projectId} (${row.projectName}): ${err}`,
            );
          }
        }),
      );
    }

    let totalHours = 0;
    const projectHours: Record<string, number> = {};
    for (const p of projects) {
      const hackatimeHours = (secondsByProject.get(p.id) ?? 0) / 3600;
      projectHours[p.id] = Math.round(hackatimeHours * 10) / 10;
      const newHours = Math.max(0, hackatimeHours - (p.overrideHours ?? 0));
      totalHours += newHours;
    }
    totalHours = Math.round(totalHours * 10) / 10;
    const predictedApprovedHours = Math.round(totalHours * approvalRate * 10) / 10;

    const payload = {
      totalHours,
      projectCount,
      approvalRate,
      decisionCount,
      predictedApprovedHours,
    };
    this.unreviewedHoursCache = { payload, projectHours, timestamp: Date.now() };
    return payload;
  }

  /**
   * Per-project Hackatime hours (projectId → logged hours) for unreviewed
   * projects. Shares the unreviewed-hours fan-out + 60s cache, so the Review
   * Panel can offer a "largest hours first" sort without its own fan-out.
   */
  async getUnreviewedProjectHours(): Promise<Record<string, number>> {
    await this.getUnreviewedHours();
    return this.unreviewedHoursCache?.projectHours ?? {};
  }
  // ── Daily Active Users ──

  async getDailyActiveUsers(): Promise<{ count: number }> {
    // Return cached value if fresh
    if (this.dauCache && Date.now() - this.dauCache.timestamp < this.DAU_CACHE_TTL) {
      return { count: this.dauCache.count };
    }

    if (!this.hackatimeAdminKey) {
      return { count: 0 };
    }

    // Find all beest projects that are linked to a hackatime project, along with their owner.
    // Uses getMany so the hackatimeProjectName JSON transformer runs and decodes the array.
    const linkedProjects = await this.projectRepo
      .createQueryBuilder('p')
      .innerJoinAndSelect('p.user', 'u')
      .where('u.hackatime_user_id IS NOT NULL')
      .andWhere('p.hackatime_project_name IS NOT NULL')
      .select(['p.id', 'p.hackatimeProjectName', 'u.id', 'u.hackatimeUserId'])
      .getMany();

    // Group linked hackatime project names per user
    const perUser = new Map<
      string,
      { hackatimeUserId: string; linkedNames: Set<string> }
    >();
    for (const p of linkedProjects) {
      if (!p.user?.hackatimeUserId) continue;
      if (!p.hackatimeProjectName || p.hackatimeProjectName.length === 0) continue;
      let entry = perUser.get(p.user.id);
      if (!entry) {
        entry = { hackatimeUserId: p.user.hackatimeUserId, linkedNames: new Set() };
        perUser.set(p.user.id, entry);
      }
      for (const n of p.hackatimeProjectName) entry.linkedNames.add(n);
    }

    const users = Array.from(perUser.values());
    const oneDayAgo = Math.floor(Date.now() / 1000) - 86400;
    let activeCount = 0;

    // Process in batches of 10 to avoid overwhelming the API
    const batchSize = 10;
    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(async (user) => {
          const res = await this.hackatimeGet(
            `/api/admin/v1/user/projects?user_id=${user.hackatimeUserId}`,
          );
          if (!res.ok) return false;
          const data = await res.json();
          const projects: { name?: string; last_heartbeat?: number | string | null }[] =
            data?.projects ?? data?.data ?? [];
          return projects.some((p) => {
            if (!p.name || !user.linkedNames.has(p.name)) return false;
            const lh = p.last_heartbeat;
            if (lh == null) return false;
            const ts = typeof lh === 'string' ? Number(lh) : lh;
            if (!Number.isFinite(ts) || ts <= 0) return false;
            const normalized = ts > 1e12 ? Math.floor(ts / 1000) : Math.floor(ts);
            return normalized >= oneDayAgo;
          });
        }),
      );
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) activeCount++;
      }
    }

    this.dauCache = { count: activeCount, timestamp: Date.now() };
    return { count: activeCount };
  }

  /**
   * Historical DAU per UTC day, plus the rolling-24h "today" value.
   *
   * Each past day's count is the number of distinct users whose linked beest
   * Hackatime projects produced at least one span with a start in that day's
   * UTC window. Finalised days (anything before today UTC) are memoised in
   * `dauHistoryCache`, so a typical request only fetches spans for dates not
   * yet cached.
   */
  async getDauHistory(): Promise<{
    history: { date: string; count: number }[];
    today: { count: number; timestamp: number };
  }> {
    const todayUtc = AdminService.ymdUtc(new Date());
    const allDates = AdminService.enumerateDaysUtc(AdminService.DAU_HISTORY_START, todayUtc);
    const pastDates = allDates.slice(0, -1); // exclude today — it's the rolling 24h

    if (this.hackatimeAdminKey && pastDates.some((d) => !this.dauHistoryCache.has(d))) {
      // Collapse concurrent callers onto a single backfill.
      if (!this.dauHistoryInflight) {
        this.dauHistoryInflight = this.backfillDauHistory(pastDates).finally(() => {
          this.dauHistoryInflight = null;
        });
      }
      await this.dauHistoryInflight;
    }

    const history = pastDates.map((date) => ({
      date,
      count: this.dauHistoryCache.get(date) ?? 0,
    }));

    const { count: todayCount } = await this.getDailyActiveUsers();
    return { history, today: { count: todayCount, timestamp: Date.now() } };
  }

  private async backfillDauHistory(dates: string[]): Promise<void> {
    const missing = dates.filter((d) => !this.dauHistoryCache.has(d));
    if (missing.length === 0) return;

    // Same filter as getDailyActiveUsers: users with a linked Hackatime ID
    // and at least one project linked to a Hackatime project name.
    const linkedProjects = await this.projectRepo
      .createQueryBuilder('p')
      .innerJoinAndSelect('p.user', 'u')
      .where('u.hackatime_user_id IS NOT NULL')
      .andWhere('p.hackatime_project_name IS NOT NULL')
      .select(['p.id', 'p.hackatimeProjectName', 'u.id', 'u.hackatimeUserId'])
      .getMany();

    const perUser = new Map<string, { hackatimeUserId: string; linkedNames: Set<string> }>();
    for (const p of linkedProjects) {
      if (!p.user?.hackatimeUserId) continue;
      if (!p.hackatimeProjectName || p.hackatimeProjectName.length === 0) continue;
      let entry = perUser.get(p.user.id);
      if (!entry) {
        entry = { hackatimeUserId: p.user.hackatimeUserId, linkedNames: new Set() };
        perUser.set(p.user.id, entry);
      }
      for (const n of p.hackatimeProjectName) entry.linkedNames.add(n);
    }

    const startDate = missing[0];
    const endDate = missing[missing.length - 1];
    // end_date on Hackatime is inclusive of the day — pad by one so the last
    // missing day is fully covered even with timezone edge cases.
    const endDatePadded = AdminService.ymdUtc(
      new Date(Date.parse(endDate + 'T00:00:00Z') + 86400_000),
    );

    // Per-day sets of active user IDs.
    const activeByDay = new Map<string, Set<string>>();
    for (const d of missing) activeByDay.set(d, new Set());

    const users = Array.from(perUser.entries());
    const batchSize = 10;
    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);
      await Promise.allSettled(
        batch.map(async ([userId, user]) => {
          // One request per linked project name — the spans endpoint filters
          // by a single project at a time.
          const projectNames = Array.from(user.linkedNames);
          const responses = await Promise.allSettled(
            projectNames.map((name) =>
              this.hackatimeGet(
                `/api/v1/users/${encodeURIComponent(user.hackatimeUserId)}/heartbeats/spans` +
                  `?start_date=${startDate}&end_date=${endDatePadded}` +
                  `&project=${encodeURIComponent(name)}`,
              ).then(async (r) => (r.ok ? ((await r.json()) as { spans?: { start_time?: number }[] }) : null)),
            ),
          );
          for (const r of responses) {
            if (r.status !== 'fulfilled' || !r.value?.spans) continue;
            for (const span of r.value.spans) {
              const t = span.start_time;
              if (typeof t !== 'number' || !Number.isFinite(t) || t <= 0) continue;
              const ms = t > 1e12 ? t : t * 1000;
              const day = AdminService.ymdUtc(new Date(ms));
              const set = activeByDay.get(day);
              if (set) set.add(userId);
            }
          }
        }),
      );
    }

    const todayUtc = AdminService.ymdUtc(new Date());
    for (const [day, set] of activeByDay) {
      // Only persist finalised days — today's window is still open.
      if (day < todayUtc) this.dauHistoryCache.set(day, set.size);
    }
  }

  private static ymdUtc(d: Date): string {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private static enumerateDaysUtc(startYmd: string, endYmd: string): string[] {
    const out: string[] = [];
    let cursor = Date.parse(startYmd + 'T00:00:00Z');
    const end = Date.parse(endYmd + 'T00:00:00Z');
    while (cursor <= end) {
      out.push(AdminService.ymdUtc(new Date(cursor)));
      cursor += 86400_000;
    }
    return out;
  }

  // ── Signups + funnel ──

  async getSignupsHistory(): Promise<{
    daily: { date: string; count: number }[];
    cumulative: { date: string; count: number }[];
    total: number;
  }> {
    if (this.signupsCache && Date.now() - this.signupsCache.timestamp < this.SIGNUPS_CACHE_TTL) {
      return this.signupsCache.payload;
    }

    const timestamps = await this.rsvpService.getAllSignupTimestamps();

    const dailyMap = new Map<string, number>();
    for (const ts of timestamps) {
      const day = AdminService.ymdUtc(new Date(ts));
      dailyMap.set(day, (dailyMap.get(day) ?? 0) + 1);
    }

    const daily = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));

    const cumulative: { date: string; count: number }[] = [];
    let running = 0;
    for (const d of daily) {
      running += d.count;
      cumulative.push({ date: d.date, count: running });
    }

    const payload = { daily, cumulative, total: timestamps.length };
    this.signupsCache = { payload, timestamp: Date.now() };
    return payload;
  }

  async getUserFunnel(): Promise<{
    signedUp: number;
    loggedIn: number;
    linkedHackatime: number;
    submittedProject: number;
    approvedProject: number;
    madeOrder: number;
  }> {
    const signupsHistory = await this.getSignupsHistory().catch(() => null);

    // "approvedProject" counts users with a durable approval event in the
    // submissions table rather than users whose CURRENT project is in the
    // 'approved' state. Project status drifts: a reviewer approval first moves
    // the project to 'fraud_pending' (and only the fraud poller flips it to
    // 'approved'), and an approved → changes_needed transition wipes the
    // approved status entirely. Submissions, by contrast, are immutable history
    // — so counting distinct users with at least one approved submission
    // captures everyone who's ever been approved.
    const [loggedIn, linkedHackatime, submittedRaw, approvedRaw, orderRaw] = await Promise.all([
      this.userRepo.count(),
      this.userRepo
        .createQueryBuilder('u')
        .where('u.hackatime_user_id IS NOT NULL')
        .getCount(),
      this.projectRepo
        .createQueryBuilder('p')
        .select('COUNT(DISTINCT p.user_id)', 'c')
        .getRawOne<{ c: string }>(),
      this.submissionRepo
        .createQueryBuilder('s')
        .select('COUNT(DISTINCT s.user_id)', 'c')
        .where('s.status = :status', { status: 'approved' })
        .getRawOne<{ c: string }>(),
      this.orderRepo
        .createQueryBuilder('o')
        .select('COUNT(DISTINCT o.user_id)', 'c')
        .getRawOne<{ c: string }>(),
    ]);

    return {
      signedUp: signupsHistory?.total ?? 0,
      loggedIn,
      linkedHackatime,
      submittedProject: Number(submittedRaw?.c ?? 0),
      approvedProject: Number(approvedRaw?.c ?? 0),
      madeOrder: Number(orderRaw?.c ?? 0),
    };
  }

  // ── News CRUD ──

  async listNews(): Promise<NewsItem[]> {
    return this.newsRepo.find({ order: { displayDate: 'DESC', createdAt: 'DESC' } });
  }

  async createNews(text: string, displayDate: string): Promise<NewsItem> {
    const item = this.newsRepo.create({ text, displayDate });
    return this.newsRepo.save(item);
  }

  async updateNews(id: string, data: { text?: string; displayDate?: string }): Promise<NewsItem> {
    const item = await this.newsRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('News item not found');
    if (data.text !== undefined) item.text = data.text;
    if (data.displayDate !== undefined) item.displayDate = data.displayDate;
    return this.newsRepo.save(item);
  }

  async deleteNews(id: string): Promise<void> {
    const item = await this.newsRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('News item not found');
    await this.newsRepo.remove(item);
  }

  // ── Shop CRUD ──

  async listShopItems(): Promise<ShopItem[]> {
    return this.shopRepo.find({ order: { sortOrder: 'ASC' } });
  }

  async createShopItem(data: {
    name: string;
    description: string;
    detailedDescription?: string | null;
    imageUrl: string;
    priceHours: number;
    stock?: number | null;
    estimatedShip?: string | null;
    isActive?: boolean;
    isFeatured?: boolean;
    isSuperFeatured?: boolean;
    isBlackMarket?: boolean;
  }, adminId?: string): Promise<ShopItem> {
    const maxOrder = await this.shopRepo
      .createQueryBuilder('s')
      .select('MAX(s.sortOrder)', 'max')
      .getRawOne();
    const sortOrder = (maxOrder?.max ?? -1) + 1;

    const item = this.shopRepo.create({
      name: data.name,
      description: data.description,
      detailedDescription: data.detailedDescription ?? null,
      imageUrl: data.imageUrl,
      priceHours: data.priceHours,
      stock: data.stock ?? null,
      estimatedShip: data.estimatedShip ?? null,
      isActive: data.isActive ?? true,
      isFeatured: data.isFeatured ?? false,
      isSuperFeatured: data.isSuperFeatured ?? false,
      isBlackMarket: data.isBlackMarket ?? false,
      sortOrder,
    });
    if (item.isSuperFeatured) {
      await this.shopRepo.update({ isSuperFeatured: true }, { isSuperFeatured: false });
    }
    const saved = await this.shopRepo.save(item);
    if (adminId) {
      await this.auditLogService.log(
        adminId,
        'admin_shop_item_change',
        `Created shop item "${saved.name}" (${saved.priceHours} Pipes, stock ${saved.stock ?? '∞'})`,
      );
    }
    return saved;
  }

  async updateShopItem(id: string, data: {
    name?: string;
    description?: string;
    detailedDescription?: string | null;
    imageUrl?: string;
    priceHours?: number;
    stock?: number | null;
    estimatedShip?: string | null;
    isActive?: boolean;
    isFeatured?: boolean;
    isSuperFeatured?: boolean;
    isBlackMarket?: boolean;
  }, adminId?: string): Promise<ShopItem> {
    const item = await this.shopRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Shop item not found');
    // Capture the economically-sensitive fields before mutating so the audit
    // entry records what actually changed (price/stock edits are the collusion
    // risk — edit price down, let a colluder buy cheap, edit it back).
    const changes: string[] = [];
    if (data.priceHours !== undefined && data.priceHours !== item.priceHours) {
      changes.push(`price ${item.priceHours}→${data.priceHours}`);
    }
    if (data.stock !== undefined && data.stock !== item.stock) {
      changes.push(`stock ${item.stock ?? '∞'}→${data.stock ?? '∞'}`);
    }
    if (data.isActive !== undefined && data.isActive !== item.isActive) {
      changes.push(`active ${item.isActive}→${data.isActive}`);
    }
    if (data.name !== undefined) item.name = data.name;
    if (data.description !== undefined) item.description = data.description;
    if (data.detailedDescription !== undefined) item.detailedDescription = data.detailedDescription;
    if (data.imageUrl !== undefined) item.imageUrl = data.imageUrl;
    if (data.priceHours !== undefined) item.priceHours = data.priceHours;
    if (data.stock !== undefined) item.stock = data.stock;
    if (data.estimatedShip !== undefined) item.estimatedShip = data.estimatedShip;
    if (data.isActive !== undefined) item.isActive = data.isActive;
    if (data.isFeatured !== undefined) item.isFeatured = data.isFeatured;
    if (data.isSuperFeatured !== undefined) {
      // Only one item holds the spotlight slot — turning it on here steals it
      // from whichever item had it before.
      if (data.isSuperFeatured && !item.isSuperFeatured) {
        await this.shopRepo.update({ isSuperFeatured: true }, { isSuperFeatured: false });
      }
      item.isSuperFeatured = data.isSuperFeatured;
    }
    if (data.isBlackMarket !== undefined) item.isBlackMarket = data.isBlackMarket;
    const saved = await this.shopRepo.save(item);
    if (adminId) {
      const detail = changes.length ? ` [${changes.join(', ')}]` : '';
      await this.auditLogService.log(
        adminId,
        'admin_shop_item_change',
        `Updated shop item "${saved.name}"${detail}`,
      );
    }
    return saved;
  }

  async deleteShopItem(id: string, adminId?: string): Promise<void> {
    const item = await this.shopRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Shop item not found');
    await this.shopRepo.remove(item);
    if (adminId) {
      await this.auditLogService.log(
        adminId,
        'admin_shop_item_change',
        `Deleted shop item "${item.name}"`,
      );
    }
  }

  async reorderShopItems(items: { id: string; sortOrder: number }[]): Promise<void> {
    await Promise.all(
      items.map((i) => this.shopRepo.update(i.id, { sortOrder: i.sortOrder })),
    );
  }

  /**
   * Super-admin-only order detail for fulfillment: returns the buyer's address
   * (fetched live from HCA — never persisted in beest) plus their approved
   * projects so fulfillment staff can verify what to ship.
   */
  async getOrderDetailForFulfillment(orderId: string): Promise<{
    address: {
      streetAddress: string | null;
      locality: string | null;
      region: string | null;
      postalCode: string | null;
      country: string | null;
    } | null;
    phone : string | null;
    fulfillmentNotes: string | null;
    addressMissing: boolean;
    projects: {
      id: string;
      name: string;
      projectType: string | null;
      hours: number | null;
      approvedAt: string;
    }[];
  }> {
    const order = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: ['user'],
    });
    if (!order) throw new NotFoundException('Order not found');
 
    const user = order.user;

    const [identity, projects] = await Promise.all([
      user?.hcaSub ? this.hcaService.getIdentity(user.hcaSub) : Promise.resolve(null),
      this.projectRepo
        .createQueryBuilder('project')
        .where('project.userId = :uid', { uid: order.userId })
        .andWhere('project.status = :status', { status: 'approved' })
        .select([
          'project.id',
          'project.name',
          'project.projectType',
          'project.overrideHours',
          'project.updatedAt',
        ])
        .orderBy('project.updatedAt', 'DESC')
        .getMany(),
    ]);

    const addr = identity?.address ?? null;
    const address = addr
      ? {
          streetAddress: addr.street_address ?? null,
          locality: addr.locality ?? null,
          region: addr.region ?? null,
          postalCode: addr.postal_code ?? null,
          country: addr.country ?? null,
        }
      : null;
    const phone = identity?.phone_number?.trim() || null;

    return {
      address,
      phone,
      fulfillmentNotes: order.fulfillmentNotes ?? null,
      addressMissing: !address,
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        projectType: p.projectType ?? null,
        hours: p.overrideHours ?? null,
        approvedAt: p.updatedAt.toISOString(),
      })),
    };
  }
}

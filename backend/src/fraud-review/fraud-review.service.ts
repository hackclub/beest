import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Project } from '../entities/project.entity';
import { User } from '../entities/user.entity';
import { Devlog } from '../entities/devlog.entity';
import { FraudReview } from '../entities/fraud-review.entity';
import { ProjectReview } from '../entities/project-review.entity';
import { Submission } from '../entities/submission.entity';
import { fetchWithTimeout } from '../fetch.util';
import { AuditLogService } from '../audit-log/audit-log.service';
import { ProjectAirtableSyncService } from '../projects/project-airtable-sync.service';
import { RsvpService } from '../rsvp/rsvp.service';
import { SlackNotifyService } from '../slack/slack-notify.service';
import {
  fraudClearedDm,
  reviewChangesNeededDm,
} from '../slack/slack-notify.templates';

const POLL_INTERVAL_MS = 5 * 60 * 1000;
const FRAUD_REJECT_THRESHOLD = 4;
const USER_FACING_FRAUD_FEEDBACK =
  'This project was flagged for review and could not be approved at this time. Please reach out to the organizers if you believe this was in error.';

interface JoeFraudListProject {
  id: string;
  organizerPlatformId?: string | null;
  status: 'pending' | 'complete';
  review?: {
    trustScore: number;
    justification: string;
    reviewedAt: string;
  } | null;
  outcome?: { status: 'approved' | 'rejected' } | null;
}

interface HardwareJournalEntry {
  title: string;
  content: string;
  timestamp: string;
  hours: number;
  images?: string[];
}

@Injectable()
export class FraudReviewService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(FraudReviewService.name);
  private readonly apiBaseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly eventId: string | undefined;
  private readonly hackatimeBaseUrl: string;
  private readonly hackatimeAdminKey: string | undefined;
  private readonly configured: boolean;

  private pollTimer: NodeJS.Timeout | null = null;
  private polling = false;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(Project) private readonly projectRepo: Repository<Project>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Devlog) private readonly devlogRepo: Repository<Devlog>,
    @InjectRepository(FraudReview) private readonly fraudRepo: Repository<FraudReview>,
    @InjectRepository(ProjectReview) private readonly reviewRepo: Repository<ProjectReview>,
    @InjectRepository(Submission) private readonly submissionRepo: Repository<Submission>,
    private readonly auditLogService: AuditLogService,
    private readonly airtableSync: ProjectAirtableSyncService,
    private readonly rsvpService: RsvpService,
    private readonly slackNotify: SlackNotifyService,
  ) {
    this.apiBaseUrl = (
      this.config.get('FRAUD_REVIEW_API_URL') ??
      'https://joe.fraud.hackclub.com/api/v1/ysws'
    ).replace(/\/+$/, '');
    this.apiKey = this.config.get('FRAUD_REVIEW_API_KEY');
    this.eventId = this.config.get('FRAUD_REVIEW_EVENT_ID');
    this.hackatimeBaseUrl = this.config.get(
      'HACKATIME_BASE_URL',
      'https://hackatime.hackclub.com',
    );
    this.hackatimeAdminKey = this.config.get('HACKATIME_ADMIN_API_KEY');
    this.configured = !!(this.apiKey && this.eventId);
    if (!this.configured) {
      this.logger.warn(
        'FRAUD_REVIEW_API_KEY/FRAUD_REVIEW_EVENT_ID not set — fraud review integration disabled',
      );
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  onApplicationBootstrap() {
    return;
  }

  onApplicationShutdown() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  // ── Public API (called from AdminService when a beest reviewer approves) ───

  /**
   * Idempotently records that a project has been approved by beest review and
   * is now waiting for joe.fraud's first-pass verdict. The actual upstream
   * Create Project call is deferred to the poller so the reviewer's request is
   * never blocked by joe.fraud's availability.
   */
  async stageProjectForReview(projectId: string): Promise<void> {
    const existing = await this.fraudRepo.findOne({ where: { projectId } });
    if (existing) {
      // Re-stage — clear any prior verdict so the poller treats it as fresh.
      existing.remoteProjectId = null;
      existing.status = 'pending';
      existing.trustScore = null;
      existing.justification = null;
      existing.reviewedAt = null;
      existing.outcomeRecorded = false;
      await this.fraudRepo.save(existing);
      return;
    }
    const row = this.fraudRepo.create({ projectId, status: 'pending' });
    await this.fraudRepo.save(row);
  }

  // ── Poller ─────────────────────────────────────────────────────────────────

  /** Public so an admin endpoint can trigger a manual reconcile if needed. */
  async poll(): Promise<void> {
    if (!this.configured) return;
    if (this.polling) return; // skip overlapping cycles
    this.polling = true;
    try {
      // 1. Submit any rows that haven't been posted upstream yet.
      const unsubmitted = await this.fraudRepo.find({
        where: { remoteProjectId: IsNull(), status: 'pending' },
      });
      for (const row of unsubmitted) {
        try {
          await this.submitOne(row);
        } catch (err) {
          this.logger.error(
            `Fraud submit failed for project ${row.projectId}: ${err}`,
          );
        }
      }

      // 2. Reconcile pending verdicts.
      const remoteList = await this.listRemoteProjects();
      if (!remoteList) return;
      const byId = new Map(remoteList.map((p) => [p.id, p]));

      const pending = await this.fraudRepo.find({
        where: { status: 'pending' },
      });
      for (const row of pending) {
        if (!row.remoteProjectId) continue;
        const remote = byId.get(row.remoteProjectId);
        if (!remote || remote.status !== 'complete' || !remote.review) continue;
        try {
          await this.reconcile(row, remote);
        } catch (err) {
          this.logger.error(
            `Fraud reconcile failed for project ${row.projectId}: ${err}`,
          );
        }
      }
    } finally {
      this.polling = false;
    }
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  private async submitOne(row: FraudReview): Promise<void> {
    const project = await this.projectRepo.findOne({
      where: { id: row.projectId },
      relations: ['user'],
    });
    if (!project || !project.user) {
      this.logger.warn(
        `Cannot submit fraud review for ${row.projectId} — project or user missing`,
      );
      return;
    }

    const submitter = this.buildSubmitter(project.user);
    if (!submitter) {
      this.logger.warn(
        `Cannot submit fraud review for ${row.projectId} — no slackId or email on user`,
      );
      return;
    }

    const isHardware = project.projectType === 'hardware';

    const body: Record<string, any> = {
      name: project.name,
      codeLink: project.codeUrl ?? '',
      submitter,
      organizerPlatformId: project.id,
    };
    if (project.demoUrl) body.demoLink = project.demoUrl;

    if (isHardware) {
      body.isHardware = true;
      body.hardwareJournal = await this.buildHardwareJournal(project);
    } else if (project.hackatimeProjectName?.length) {
      body.hackatimeProjects = project.hackatimeProjectName;
    }

    const res = await fetchWithTimeout(
      `${this.apiBaseUrl}/events/${encodeURIComponent(this.eventId!)}/projects`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );

    const respBody = await res.json().catch(() => null);
    if (!res.ok && res.status !== 200) {
      this.logger.error(
        `joe.fraud create failed (${res.status}) for ${row.projectId}: ${JSON.stringify(respBody)}`,
      );
      return;
    }
    const remoteId = respBody?.id;
    if (typeof remoteId !== 'string' || remoteId.length === 0) {
      this.logger.error(
        `joe.fraud create returned no id for ${row.projectId}: ${JSON.stringify(respBody)}`,
      );
      return;
    }
    row.remoteProjectId = remoteId;
    await this.fraudRepo.save(row);
    this.logger.log(
      `Submitted project ${project.id} to joe.fraud as ${remoteId}`,
    );
  }

  private buildSubmitter(
    user: User,
  ): { slackId: string } | { email: string } | null {
    if (user.slackId) return { slackId: user.slackId };
    if (user.email) return { email: user.email };
    return null;
  }

  // ── List ───────────────────────────────────────────────────────────────────

  private async listRemoteProjects(): Promise<JoeFraudListProject[] | null> {
    const res = await fetchWithTimeout(
      `${this.apiBaseUrl}/events/${encodeURIComponent(this.eventId!)}/projects`,
      { headers: { Authorization: `Bearer ${this.apiKey}` } },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.error(`joe.fraud list failed (${res.status}): ${text}`);
      return null;
    }
    const body = await res.json().catch(() => null);
    const raw = body?.projects;
    if (!Array.isArray(raw)) {
      this.logger.error(`joe.fraud list returned non-array body`);
      return null;
    }

    // Defensively validate each entry's shape — only act on records that
    // pass schema checks. A malformed entry is logged and dropped.
    const out: JoeFraudListProject[] = [];
    for (const entry of raw) {
      const validated = this.validateRemoteProject(entry);
      if (validated) out.push(validated);
    }
    return out;
  }

  /**
   * Validate that a list entry from joe.fraud has the structure we expect
   * before we let it influence beest state. Returns a typed object on success
   * or null if the entry is malformed.
   */
  private validateRemoteProject(entry: unknown): JoeFraudListProject | null {
    if (!entry || typeof entry !== 'object') return null;
    const e = entry as Record<string, unknown>;

    if (typeof e.id !== 'string' || e.id.length === 0 || e.id.length > 64) {
      return null;
    }
    if (e.status !== 'pending' && e.status !== 'complete') return null;

    let review: JoeFraudListProject['review'] = null;
    if (e.review && typeof e.review === 'object') {
      const r = e.review as Record<string, unknown>;
      if (
        typeof r.trustScore !== 'number' ||
        !Number.isInteger(r.trustScore) ||
        r.trustScore < 1 ||
        r.trustScore > 10
      ) {
        return null;
      }
      if (typeof r.justification !== 'string') return null;
      if (typeof r.reviewedAt !== 'string') return null;
      review = {
        trustScore: r.trustScore,
        // Cap justification length to 4 KB — defense against pathological
        // payloads that would bloat our DB or audit logs.
        justification: r.justification.slice(0, 4000),
        reviewedAt: r.reviewedAt,
      };
    }

    return {
      id: e.id,
      organizerPlatformId:
        typeof e.organizerPlatformId === 'string' ? e.organizerPlatformId : null,
      status: e.status as 'pending' | 'complete',
      review,
      outcome: null, // not used in reconcile path
    };
  }

  // ── Reconcile ──────────────────────────────────────────────────────────────

  private async reconcile(
    row: FraudReview,
    remote: JoeFraudListProject,
  ): Promise<void> {
    const review = remote.review!;

    // Defense in depth: confirm the remote record is actually for this beest
    // project. If joe.fraud's response had an organizerPlatformId that doesn't
    // match our project id, refuse to act and log loudly. (The list endpoint
    // map is keyed by remote id, but we still verify identity before mutating
    // local state to make response-tampering immediately obvious.)
    if (
      remote.organizerPlatformId &&
      remote.organizerPlatformId !== row.projectId
    ) {
      this.logger.error(
        `Refusing to reconcile ${row.projectId}: remote ${remote.id} reports organizerPlatformId=${remote.organizerPlatformId}`,
      );
      return;
    }

    row.status = 'complete';
    row.trustScore = review.trustScore;
    row.justification = review.justification;
    row.reviewedAt = new Date(review.reviewedAt);
    await this.fraudRepo.save(row);

    // If the beest reviewer flipped the project out of 'fraud_pending' (e.g.
    // back to changes_needed) between submit and verdict, don't act on the
    // verdict — record it on our row but leave the project alone.
    const project = await this.projectRepo.findOne({
      where: { id: row.projectId },
    });
    if (!project || project.status !== 'fraud_pending') {
      this.logger.log(
        `Skipping reconcile side-effects for ${row.projectId} — current status is ${project?.status ?? 'missing'}`,
      );
      return;
    }

    if (review.trustScore <= FRAUD_REJECT_THRESHOLD) {
      await this.markFraudRejected(row, review.justification);
      return;
    }

    await this.completeApproval(row);
  }

  private async markFraudRejected(
    row: FraudReview,
    justification: string,
  ): Promise<void> {
    const project = await this.projectRepo.findOne({
      where: { id: row.projectId },
      relations: ['user'],
    });
    if (!project) return;

    project.status = 'changes_needed';
    // Beest review previously bumped overrideHours; clear since the project is
    // now rejected. (No pipes were granted yet — that only happens after fraud
    // passes — so there's nothing to claw back.)
    project.overrideHours = 0;
    project.internalHours = 0;
    await this.projectRepo.save(project);

    // Also bump the latest submission back to 'changes_needed' so the user
    // sees the project as needing changes in the dashboard.
    const submission = await this.submissionRepo.findOne({
      where: { projectId: row.projectId },
      order: { createdAt: 'DESC' },
    });
    if (submission && submission.status !== 'changes_needed') {
      submission.status = 'changes_needed';
      submission.overrideHours = 0;
      submission.internalHours = 0;
      await this.submissionRepo.save(submission);
    }

    // Surface a generic message to the user; keep the upstream justification
    // internal so reviewers can see the real reason without exposing it.
    const review = this.reviewRepo.create({
      projectId: row.projectId,
      reviewerId: null, // system-authored — no human reviewer
      submissionId: submission?.id ?? null,
      status: 'changes_needed',
      feedback: USER_FACING_FRAUD_FEEDBACK,
      internalNote: `Fraud review flagged: ${justification}`,
      overrideJustification: null,
    });
    await this.reviewRepo.save(review);

    await this.auditLogService.log(
      project.userId,
      'project_reviewed',
      `Project "${project.name}" was flagged by fraud review`,
    );

    // DM the builder the same generic, non-accusatory message we store on the
    // review record; never reveal that this was a fraud flag (best-effort).
    const rejectDm = reviewChangesNeededDm({
      projectName: project.name,
      projectLink: project.codeUrl ?? project.demoUrl ?? null,
      reviewerName: null,
      feedback: USER_FACING_FRAUD_FEEDBACK,
    });
    await this.slackNotify.dm(
      project.user?.slackId,
      rejectDm.text,
      rejectDm.blocks,
    );

    this.logger.log(
      `Fraud-rejected project ${project.id} (trust=${row.trustScore})`,
    );
  }

  /**
   * Sum of approved devlog hours across the user's "earned" projects (approved,
   * or already partially paid out) — the same project set the pipe reconcile
   * counts override_hours over. Kept as a separate aggregate (not a JOIN into
   * the override_hours SUM) so devlog rows can't fan out and inflate the
   * project-hours total.
   */
  private async approvedDevlogHoursForUser(userId: string): Promise<number> {
    const rows: Array<{ h: string }> = await this.projectRepo.manager.query(
      `SELECT COALESCE(SUM(d.approved_hours), 0) AS h
         FROM devlogs d
         JOIN projects p ON p.id = d.project_id
        WHERE p.user_id = $1
          AND d.approved = true
          AND (p.status = 'approved' OR (p.status <> 'approved' AND p.pipes_granted > 0))`,
      [userId],
    );
    return Number(rows?.[0]?.h ?? 0);
  }

  private async completeApproval(row: FraudReview): Promise<void> {
    const project = await this.projectRepo.findOne({
      where: { id: row.projectId },
      relations: ['user'],
    });
    if (!project) return;

    // 1. Flip status to approved.
    project.status = 'approved';
    await this.projectRepo.save(project);

    // 2. Find the latest submission for this project (the one that was just
    //    fraud-approved). It currently sits at status='unreviewed' because
    //    AdminService deferred the flip to here.
    const submission = await this.submissionRepo.findOne({
      where: { projectId: row.projectId },
      order: { createdAt: 'DESC' },
    });
    if (submission && submission.status !== 'approved') {
      submission.status = 'approved';
      await this.submissionRepo.save(submission);
    }

    // 3. Grant pipes — same delta logic as AdminService.reviewProject. Target =
    //    floor(earned hours across the user's earned projects), delta =
    //    target − sum(pipes_granted) across all the user's projects. Earned
    //    hours = project override_hours PLUS approved devlog hours: devlog hours
    //    count exactly like normal hours, and (like all hours) they only mint
    //    pipes here, at fraud review.
    if ((project.overrideHours ?? 0) > 0) {
      const totals = await this.projectRepo
        .createQueryBuilder('p')
        .select('COALESCE(SUM(p.override_hours), 0)', 'earnedHours')
        .addSelect('COALESCE(SUM(p.pipes_granted), 0)', 'granted')
        .where('p.user_id = :uid', { uid: project.userId })
        .andWhere(
          `(p.status = 'approved' OR (p.status <> 'approved' AND p.pipes_granted > 0))`,
        )
        .getRawOne<{ earnedHours: string; granted: string }>();
      const devlogHours = await this.approvedDevlogHoursForUser(project.userId);
      const target = Math.floor(Number(totals?.earnedHours ?? 0) + devlogHours);
      const previouslyGranted = Number(totals?.granted ?? 0);
      const delta = target - previouslyGranted;
      if (delta > 0) {
        await this.userRepo.increment({ id: project.userId }, 'pipes', delta);
        project.pipesGranted = (project.pipesGranted ?? 0) + delta;
        await this.projectRepo.save(project);
        if (submission) {
          submission.pipesGranted = delta;
          await this.submissionRepo.save(submission);
        }
      }
    }

    // 4. Find the review record the beest reviewer just created so we can pass
    //    its overrideJustification to the Airtable sync, with the fraud
    //    reviewer's justification appended for downstream traceability.
    const beestReview = await this.reviewRepo.findOne({
      where: { projectId: row.projectId, status: 'approved' },
      order: { createdAt: 'DESC' },
    });
    const combinedJustification = this.combineJustifications(
      beestReview?.overrideJustification ?? null,
      row.trustScore,
      row.justification,
    );

    // Apply the first-pass reviewer's golden decision now that the approval
    // is final — first pass records it on the review row without touching the
    // project, since golden unlocks user-visible perks.
    if (beestReview?.golden != null && project.isGolden !== beestReview.golden) {
      project.isGolden = beestReview.golden;
      await this.projectRepo.save(project);
    }

    // 5. Loops sync + Airtable Projects push.
    if (project.user?.email) {
      this.rsvpService.updateDateField(
        project.user.email,
        'Loops - beestApprovedProject',
      );
    }
    try {
      await this.airtableSync.syncApprovedProject(
        project,
        combinedJustification,
        submission ?? null,
      );
    } catch (err) {
      this.logger.error(
        `Airtable sync failed for fraud-approved project ${project.id}: ${err}`,
      );
    }

    // 6. Audit log + outcome callback.
    await this.auditLogService.log(
      project.userId,
      'project_reviewed',
      `Project "${project.name}" was approved (fraud-cleared)`,
    );

    // Confirm final approval + Pipes to the builder (best-effort).
    const clearedDm = fraudClearedDm({
      projectName: project.name,
      projectLink: project.codeUrl ?? project.demoUrl ?? null,
    });
    await this.slackNotify.dm(
      project.user?.slackId,
      clearedDm.text,
      clearedDm.blocks,
    );

    if (!row.outcomeRecorded && row.remoteProjectId) {
      try {
        await this.recordOutcome(row.remoteProjectId, 'approved');
        row.outcomeRecorded = true;
        await this.fraudRepo.save(row);
      } catch (err) {
        this.logger.error(
          `joe.fraud outcome push failed for ${project.id}: ${err}`,
        );
      }
    }

    this.logger.log(
      `Fraud-approved project ${project.id} (trust=${row.trustScore})`,
    );
  }

  private combineJustifications(
    beest: string | null,
    fraudScore: number | null,
    fraudJustification: string | null,
  ): string | null {
    const parts: string[] = [];
    if (beest && beest.trim().length > 0) parts.push(beest.trim());
    if (fraudJustification && fraudJustification.trim().length > 0) {
      const scoreLabel = fraudScore != null ? `trust ${fraudScore}/10` : 'verdict';
      parts.push(`Fraud review (${scoreLabel}): ${fraudJustification.trim()}`);
    }
    return parts.length > 0 ? parts.join('\n\n') : null;
  }

  private async recordOutcome(
    remoteProjectId: string,
    status: 'approved' | 'rejected',
    reason?: string,
  ): Promise<void> {
    const body: Record<string, any> = { status };
    if (status === 'rejected' && reason) body.reason = reason;
    const res = await fetchWithTimeout(
      `${this.apiBaseUrl}/events/${encodeURIComponent(this.eventId!)}/projects/${encodeURIComponent(remoteProjectId)}/outcome`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`outcome ${res.status}: ${text}`);
    }
  }

  // ── Hardware journal mapping ───────────────────────────────────────────────

  private async buildHardwareJournal(
    project: Project,
  ): Promise<HardwareJournalEntry[]> {
    const devlogs = await this.devlogRepo.find({
      where: { projectId: project.id },
      order: { createdAt: 'ASC' },
    });
    if (devlogs.length === 0) return [];

    // Bucket devlogs by UTC date so we can spread that day's Hackatime hours
    // across the entries written on the same day.
    const devlogsByDay = new Map<string, Devlog[]>();
    for (const d of devlogs) {
      const day = d.createdAt.toISOString().slice(0, 10);
      const bucket = devlogsByDay.get(day) ?? [];
      bucket.push(d);
      devlogsByDay.set(day, bucket);
    }

    const hoursByDay = await this.hoursPerDayFromHackatime(project);

    return devlogs.map((d) => {
      const day = d.createdAt.toISOString().slice(0, 10);
      const dayHours = hoursByDay.get(day) ?? 0;
      const sameDayCount = devlogsByDay.get(day)?.length ?? 1;
      const hours = sameDayCount > 0 ? dayHours / sameDayCount : 0;

      return {
        title: d.title,
        content: d.text,
        timestamp: d.createdAt.toISOString(),
        hours: Math.round(hours * 100) / 100,
        ...(d.imageUrls && d.imageUrls.length > 0 ? { images: d.imageUrls } : {}),
      };
    });
  }

  private async hoursPerDayFromHackatime(
    project: Project,
  ): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    const names = project.hackatimeProjectName ?? [];
    if (names.length === 0 || !this.hackatimeAdminKey) return out;

    const user = await this.userRepo.findOne({
      where: { id: project.userId },
      select: ['id', 'hackatimeUserId'],
    });
    const htUserId = user?.hackatimeUserId;
    if (!htUserId) return out;

    // Fetch a wide window — start_date is bounded by the project's earliest
    // devlog (or createdAt), end_date is today + 1 day.
    const startMs = Math.min(
      project.createdAt?.getTime() ?? Date.now(),
      Date.now(),
    );
    const startDate = new Date(startMs).toISOString().slice(0, 10);
    const endDate = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);

    for (const name of names) {
      try {
        const res = await fetchWithTimeout(
          `${this.hackatimeBaseUrl}/api/v1/users/${encodeURIComponent(htUserId)}/heartbeats/spans` +
            `?start_date=${startDate}&end_date=${endDate}` +
            `&project=${encodeURIComponent(name)}`,
          { headers: { Authorization: `Bearer ${this.hackatimeAdminKey}` } },
        );
        if (!res.ok) continue;
        const body = await res.json().catch(() => null);
        const spans: { start_time?: number; duration?: number }[] = body?.spans ?? [];
        for (const span of spans) {
          const t = span.start_time;
          const d = span.duration;
          if (typeof t !== 'number' || typeof d !== 'number') continue;
          if (!Number.isFinite(t) || !Number.isFinite(d) || d <= 0) continue;
          const ms = t > 1e12 ? t : t * 1000;
          const day = new Date(ms).toISOString().slice(0, 10);
          out.set(day, (out.get(day) ?? 0) + d / 3600);
        }
      } catch (err) {
        this.logger.warn(
          `Hackatime spans fetch failed for ${project.id}/${name}: ${err}`,
        );
      }
    }
    return out;
  }
}

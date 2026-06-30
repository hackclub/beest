import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Project } from '../entities/project.entity';
import { Submission } from '../entities/submission.entity';
import { ProjectReview } from '../entities/project-review.entity';
import { User } from '../entities/user.entity';
import { AuditLogService } from '../audit-log/audit-log.service';
import { RsvpService } from '../rsvp/rsvp.service';
import { ProjectAirtableSyncService } from '../projects/project-airtable-sync.service';
import { IdentityService } from '../identity/identity.service';
import { IframeContextService } from './iframe-context.service';
import { AdminService } from './admin.service';
import { Inject, forwardRef } from '@nestjs/common';

export type AuditAction = 'approve' | 'rereview' | 'reject' | 'ban';

export interface AuditDecisionDto {
  action: AuditAction;
  // approve
  overrideHours?: number | null;
  internalHours?: number | null;
  justification?: string | null;
  // rereview (feedback to the first reviewer, internal)
  reviewerFeedback?: string | null;
  // reject + ban (feedback to the user)
  userFeedback?: string | null;
  // ban only: caller must be Super Admin — the controller passes this through
  // from the resolved request perms so the service can refuse non-SA bans.
  isSuperAdmin?: boolean;
}

function parseHackatimeNames(raw: string | string[] | null | undefined): string[] {
  if (!raw) return [];
  // The Project entity transforms this column to a string[] already, but guard
  // against a raw string (JSON or comma-separated) just in case.
  if (Array.isArray(raw)) {
    return raw.map((s) => String(s).trim()).filter(Boolean);
  }
  const trimmed = raw.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.map((s) => String(s).trim()).filter(Boolean);
    }
    if (typeof parsed === 'string') return [parsed.trim()].filter(Boolean);
  } catch {
    // not JSON — fall back to comma-separated
  }
  return trimmed
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly iframeContexts: IframeContextService,
    @InjectRepository(Project) private readonly projectRepo: Repository<Project>,
    @InjectRepository(Submission)
    private readonly submissionRepo: Repository<Submission>,
    @InjectRepository(ProjectReview)
    private readonly reviewRepo: Repository<ProjectReview>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly auditLogService: AuditLogService,
    private readonly rsvpService: RsvpService,
    private readonly airtableSync: ProjectAirtableSyncService,
    private readonly identityService: IdentityService,
    @Inject(forwardRef(() => AdminService))
    private readonly adminService: AdminService,
  ) {}

  // ── Iframe context ─────────────────────────────────────────────────────────

  /**
   * Mint an opaque, single-use context id for the private audit iframe service.
   * The heartbeat display + anomaly heuristics now live in that separate
   * (private) service; beest hands it only the minimal identifiers it needs to
   * fetch + analyze, behind the shared key. The browser only ever sees the
   * opaque ctx.
   */
  async mintIframeContext(projectId: string): Promise<{ ctx: string }> {
    const project = await this.projectRepo.findOne({
      where: { id: projectId },
      relations: ['user'],
    });
    if (!project) throw new NotFoundException('Project not found');

    // Token fallback is off by default — only include the builder's Hackatime
    // OAuth token in the payload when the operator has explicitly opted in.
    const includeToken =
      this.config.get<string>('AUDIT_SVC_INCLUDE_TOKEN') === 'true';

    const ctx = this.iframeContexts.mint({
      projectId: project.id,
      projectName: project.name ?? null,
      hackatimeUserId: project.user?.hackatimeUserId ?? null,
      projectNames: parseHackatimeNames(project.hackatimeProjectName),
      ...(includeToken
        ? { hackatimeToken: project.user?.hackatimeToken ?? null }
        : {}),
    });
    return { ctx };
  }

  // ── Queue ──────────────────────────────────────────────────────────────────

  /**
   * Projects awaiting a super-admin second pass. These are first-reviewer
   * approved projects parked in `fraud_pending` (the old fraud-review holding
   * state, now repurposed as the second-pass queue). Oldest first.
   */
  async listQueue(): Promise<unknown[]> {
    const projects = await this.projectRepo.find({
      where: { status: 'fraud_pending' },
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });

    return Promise.all(projects.map((p) => this.serializeQueueItem(p)));
  }

  /**
   * Pull up to N oldest unreviewed projects into the audit queue so a super
   * admin can clear them as one-shot reviews (skipping the first-pass stage).
   *
   * Constraint: only allowed when the queue is empty — this is meant to bridge
   * a temporary first-reviewer shortage, not run as a parallel review stream.
   * The "one-shot" property is inferred at decide-time by checking that no
   * prior `ProjectReview` with status='approved' exists for the project; we
   * don't tag the row, we just rely on the absence of a first-pass approval.
   */
  async loadUnreviewedIntoQueue(superAdminId: string, limit = 10): Promise<{ loaded: number }> {
    const pending = await this.projectRepo.count({ where: { status: 'fraud_pending' } });
    if (pending > 0) {
      throw new BadRequestException(
        `Cannot load unreviewed projects — audit queue is not empty (${pending} project${pending === 1 ? '' : 's'} still pending).`,
      );
    }

    const safeLimit = Math.max(1, Math.min(limit, 25));
    const candidates = await this.projectRepo.find({
      where: { status: 'unreviewed' },
      order: { createdAt: 'ASC' },
      take: safeLimit,
    });
    if (candidates.length === 0) {
      return { loaded: 0 };
    }

    for (const p of candidates) {
      p.status = 'fraud_pending';
    }
    await this.projectRepo.save(candidates);

    await this.auditLogService.log(
      superAdminId,
      'project_reviewed',
      `Loaded ${candidates.length} unreviewed project${candidates.length === 1 ? '' : 's'} into the audit queue for one-shot review`,
    );
    this.logger.log(
      `Super admin ${superAdminId} loaded ${candidates.length} unreviewed projects into the audit queue`,
    );
    return { loaded: candidates.length };
  }

  private async serializeQueueItem(project: Project) {
    // Pull every submission for this project so we can show the SA the full
    // history (approved hours + reasons + reviewer) for resubmissions. The
    // current submission is the newest one; everything older goes into
    // priorSubmissions for the UI to render as a timeline.
    const allSubmissions = await this.submissionRepo.find({
      where: { projectId: project.id },
      order: { createdAt: 'DESC' },
    });
    const submission = allSubmissions[0] ?? null;
    const olderSubmissions = allSubmissions.slice(1);

    const submissionIds = allSubmissions.map((s) => s.id);
    const allReviews = submissionIds.length
      ? await this.reviewRepo.find({
          where: { submissionId: In(submissionIds) },
          order: { createdAt: 'DESC' },
        })
      : [];

    const reviewsBySubmission = new Map<string, ProjectReview[]>();
    for (const r of allReviews) {
      if (!r.submissionId) continue;
      const list = reviewsBySubmission.get(r.submissionId) ?? [];
      list.push(r);
      reviewsBySubmission.set(r.submissionId, list);
    }

    // Submission-scoped one-shot detection: did the first-pass approve THIS
    // submission? A re-ship whose new submission has never been approved
    // correctly registers as one-shot when loaded.
    const currentReviews = submission
      ? reviewsBySubmission.get(submission.id) ?? []
      : [];
    const originalApproval =
      currentReviews.find((r) => r.status === 'approved') ?? null;

    const reviewerIds = Array.from(
      new Set(
        allReviews
          .map((r) => r.reviewerId)
          .filter((id): id is string => !!id),
      ),
    );
    const reviewers = reviewerIds.length
      ? await this.userRepo.find({ where: { id: In(reviewerIds) } })
      : [];
    const reviewerById = new Map(reviewers.map((u) => [u.id, u]));
    const nameOf = (reviewerId: string | null | undefined): string | null => {
      if (!reviewerId) return null;
      const u = reviewerById.get(reviewerId);
      return u?.nickname || u?.name || null;
    };

    const reviewerName = nameOf(originalApproval?.reviewerId);

    const priorSubmissions = olderSubmissions.map((sub) => {
      const subReviews = reviewsBySubmission.get(sub.id) ?? [];
      // Latest review (already DESC sorted) — the one that decided this submission
      const latest = subReviews[0] ?? null;
      return {
        id: sub.id,
        status: sub.status,
        overrideHours: sub.overrideHours,
        internalHours: sub.internalHours,
        pipesGranted: sub.pipesGranted,
        changeDescription: sub.changeDescription,
        createdAt: sub.createdAt,
        review: latest
          ? {
              status: latest.status,
              overrideJustification: latest.overrideJustification,
              feedback: latest.feedback,
              internalNote: latest.internalNote,
              reviewerName: nameOf(latest.reviewerId),
              createdAt: latest.createdAt,
            }
          : null,
      };
    });

    const user = project.user;
    // Live identity status so the reviewer can see whether the builder is
    // actually YSWS-eligible — a `verified_ineligible` user can slip through
    // older queue entries that predate the ship-time eligibility gate.
    const identityStatus = user
      ? await this.identityService.getStatus({
          slackId: user.slackId,
          email: user.email,
        })
      : 'unverified';
    return {
      id: project.id,
      name: project.name,
      description: project.description,
      projectType: project.projectType,
      codeUrl: project.codeUrl,
      readmeUrl: project.readmeUrl,
      demoUrl: project.demoUrl,
      screenshot1Url: project.screenshot1Url,
      screenshot2Url: project.screenshot2Url,
      hackatimeProjectNames: parseHackatimeNames(project.hackatimeProjectName),
      aiUse: project.aiUse,
      isUpdate: project.isUpdate,
      otherHcProgram: project.otherHcProgram,
      overrideHours: project.overrideHours ?? 0,
      internalHours: project.internalHours ?? 0,
      pipesGranted: project.pipesGranted ?? 0,
      createdAt: project.createdAt,
      owner: user
        ? {
            id: user.id,
            name: user.name,
            nickname: user.nickname,
            slackId: user.slackId,
            email: user.email,
            hackatimeConnected: !!user.hackatimeToken,
            identityStatus,
            watchlisted: !!user.watchlisted,
            coolBuilder: !!user.coolBuilder,
          }
        : null,
      originalApproval: originalApproval
        ? {
            reviewerId: originalApproval.reviewerId,
            reviewerName,
            overrideJustification: originalApproval.overrideJustification,
            feedback: originalApproval.feedback,
            internalNote: originalApproval.internalNote,
            createdAt: originalApproval.createdAt,
          }
        : null,
      // One-shot = pulled into the queue via the SA escape hatch (no prior
      // first-pass approval). The decide endpoint enforces stricter checks in
      // this mode; the UI surfaces it so the SA knows they're the only review.
      isOneShot: !originalApproval,
      submission: submission
        ? {
            id: submission.id,
            changeDescription: submission.changeDescription,
            overrideHours: submission.overrideHours,
            createdAt: submission.createdAt,
          }
        : null,
      // Older submissions on the same project, newest first, each with its
      // latest review (so the SA can see history for resubmissions). Empty
      // array for first ships.
      priorSubmissions,
    };
  }

  // ── Decision ─────────────────────────────────────────────────────────────--

  async decide(
    projectId: string,
    superAdminId: string,
    dto: AuditDecisionDto,
  ): Promise<{ success: true }> {
    const project = await this.projectRepo.findOne({
      where: { id: projectId },
      relations: ['user'],
    });
    if (!project) throw new NotFoundException('Project not found');
    // An auditor must never decide on their own project — matches the
    // self-review guard the first-pass reviewProject/banAndRejectProject paths
    // already enforce. Applies to every action (approve/reject/rereview/ban).
    if (project.userId === superAdminId) {
      throw new ForbiddenException('You cannot review or decide on your own project');
    }
    if (project.status !== 'fraud_pending') {
      throw new BadRequestException(
        `Project is not awaiting second review (status: ${project.status}).`,
      );
    }

    const submission = await this.submissionRepo.findOne({
      where: { projectId },
      order: { createdAt: 'DESC' },
    });

    switch (dto.action) {
      case 'approve':
        return this.approve(project, submission, superAdminId, dto);
      case 'rereview':
        return this.returnForReReview(project, submission, superAdminId, dto);
      case 'reject':
        return this.reject(project, submission, superAdminId, dto);
      case 'ban':
        return this.banFromAudit(project, superAdminId, dto);
      default:
        throw new BadRequestException('Unknown action');
    }
  }

  /** Ban-and-reject — Super-Admin only. Delegates to AdminService so the ban
   *  path stays identical to the first-pass ban. */
  private async banFromAudit(
    project: Project,
    superAdminId: string,
    dto: AuditDecisionDto,
  ): Promise<{ success: true }> {
    if (!dto.isSuperAdmin) {
      throw new BadRequestException(
        'Only Super Admins can ban from the audit panel.',
      );
    }
    const feedback = (dto.userFeedback ?? '').trim();
    if (feedback.length < 10) {
      throw new BadRequestException(
        'Ban feedback for the user must be at least 10 characters.',
      );
    }
    await this.adminService.banAndRejectProject(
      project.id,
      superAdminId,
      feedback,
      'Banned via audit panel',
      null,
      false,
      null,
      // This path is Super-Admin-only (dto.isSuperAdmin checked above).
      true,
    );
    return { success: true };
  }

  /** Final approval: grant pipes + push to Airtable (relocated from the old
   * fraud-review poller's completeApproval). */
  private async approve(
    project: Project,
    submission: Submission | null,
    superAdminId: string,
    dto: AuditDecisionDto,
  ): Promise<{ success: true }> {
    // One-shot mode: this *submission* has no first-pass approval, so this is
    // the only review it will get. Tighten the justification floor and apply
    // the same Hackatime cap the first-pass would have enforced. Submission-
    // scoped so re-ships of previously-approved projects still register.
    const priorApproval = submission
      ? await this.reviewRepo.findOne({
          where: { submissionId: submission.id, status: 'approved' },
        })
      : null;
    const isOneShot = !priorApproval;

    const justification = (dto.justification ?? '').trim();
    const minJustification = isOneShot ? 250 : 50;
    if (justification.length < minJustification) {
      throw new BadRequestException(
        `Approval justification must be at least ${minJustification} characters.`,
      );
    }

    // The SA may set overrideHours (user-facing, drives pipes) and internalHours
    // (Airtable's "Override Hours Spent") independently. Both are treated as
    // FINAL cumulative values, overwriting the first reviewer's numbers. If
    // internalHours isn't supplied the existing project value is preserved,
    // EXCEPT in one-shot mode where it defaults to the override value (no
    // first-pass left an internalHours behind).
    if (dto.overrideHours !== null && dto.overrideHours !== undefined) {
      const finalOverride = Math.round(dto.overrideHours * 10) / 10;
      if (!Number.isFinite(finalOverride) || finalOverride <= 0) {
        throw new BadRequestException('overrideHours must be a positive number.');
      }
      if (finalOverride < (project.pipesGranted ?? 0)) {
        throw new BadRequestException(
          `Cannot reduce hours to ${finalOverride} — ${project.pipesGranted} pipes already granted.`,
        );
      }
      // No Hackatime ceiling here: the audit is a manual SA decision and may
      // legitimately approve more hours than Hackatime recorded (e.g. work the
      // tracker missed). The recorded Hackatime total is surfaced in the UI for
      // context, but the SA's number is authoritative.
      project.overrideHours = finalOverride;
      if (submission) submission.overrideHours = finalOverride;

      let finalInternal: number;
      if (dto.internalHours !== null && dto.internalHours !== undefined) {
        finalInternal = Math.round(dto.internalHours * 10) / 10;
        if (!Number.isFinite(finalInternal) || finalInternal < 0) {
          throw new BadRequestException('internalHours must be a non-negative number.');
        }
      } else {
        finalInternal = isOneShot ? finalOverride : (project.internalHours ?? finalOverride);
      }
      project.internalHours = finalInternal;
      if (submission) submission.internalHours = finalInternal;
    } else if (isOneShot) {
      // One-shot requires the SA to explicitly set the approved hours — the
      // project has no first-pass-set value to inherit from.
      throw new BadRequestException(
        'One-shot approval requires overrideHours to be set.',
      );
    }

    project.status = 'approved';
    await this.projectRepo.save(project);

    if (submission && submission.status !== 'approved') {
      submission.status = 'approved';
      await this.submissionRepo.save(submission);
    }

    // Grant pipes — delta logic identical to the previous fraud poller path.
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
      const target = Math.floor(Number(totals?.earnedHours ?? 0));
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

    // Record the second-pass approval. One-shot approvals can carry a
    // user-facing feedback string (the only review the user will see, so the
    // SA may want to leave a note); regular second-pass approvals don't.
    const approveUserFeedback = isOneShot
      ? ((dto.userFeedback ?? '').trim() || null)
      : null;
    const review = this.reviewRepo.create({
      projectId: project.id,
      reviewerId: superAdminId,
      submissionId: submission?.id ?? null,
      status: 'approved',
      feedback: approveUserFeedback,
      internalNote: isOneShot ? 'One-shot approval' : 'Second-pass (super admin) approval',
      overrideJustification: justification,
    });
    await this.reviewRepo.save(review);

    // Loops + Airtable Projects push — now gated to this stage only.
    if (project.user?.email) {
      this.rsvpService.updateDateField(
        project.user.email,
        'Loops - beestApprovedProject',
      );
    }
    try {
      await this.airtableSync.syncApprovedProject(
        project,
        justification,
        submission ?? null,
      );
    } catch (err) {
      this.logger.error(
        `Airtable sync failed for second-pass-approved project ${project.id}: ${err}`,
      );
    }

    await this.auditLogService.log(
      project.userId,
      'project_reviewed',
      `Project "${project.name}" was approved`,
    );
    this.logger.log(`Second-pass approved project ${project.id}`);
    return { success: true };
  }

  /** Send back to the first-review queue with feedback for the first reviewer
   * (internal — the user is not notified). */
  private async returnForReReview(
    project: Project,
    submission: Submission | null,
    superAdminId: string,
    dto: AuditDecisionDto,
  ): Promise<{ success: true }> {
    const feedback = (dto.reviewerFeedback ?? '').trim();
    if (feedback.length < 10) {
      throw new BadRequestException(
        'Re-review feedback must be at least 10 characters.',
      );
    }

    // Revert the pending approval delta this submission contributed, so a
    // re-approval re-adds it cleanly rather than double-counting.
    const subOverride = submission?.overrideHours ?? 0;
    const subInternal = submission?.internalHours ?? 0;
    if (subOverride > 0) {
      project.overrideHours = Math.max(
        0,
        Math.round(((project.overrideHours ?? 0) - subOverride) * 10) / 10,
      );
    }
    if (subInternal > 0) {
      project.internalHours = Math.max(
        0,
        Math.round(((project.internalHours ?? 0) - subInternal) * 10) / 10,
      );
    }
    project.status = 'unreviewed';
    await this.projectRepo.save(project);

    if (submission) {
      submission.status = 'unreviewed';
      submission.reviewerNote = `[Returned by second-pass review] ${feedback}`;
      await this.submissionRepo.save(submission);
    }

    // Internal trace (logged against the super admin, not the user).
    await this.auditLogService.log(
      superAdminId,
      'project_reviewed',
      `Returned "${project.name}" to the first-review queue for re-review`,
    );
    this.logger.log(`Second-pass returned project ${project.id} for re-review`);
    return { success: true };
  }

  /** Regular rejection — user-facing changes-needed, no pipes (none granted). */
  private async reject(
    project: Project,
    submission: Submission | null,
    superAdminId: string,
    dto: AuditDecisionDto,
  ): Promise<{ success: true }> {
    const feedback = (dto.userFeedback ?? '').trim();
    if (feedback.length < 10) {
      throw new BadRequestException(
        'Rejection feedback for the user must be at least 10 characters.',
      );
    }

    project.status = 'changes_needed';
    project.overrideHours = 0;
    project.internalHours = 0;
    await this.projectRepo.save(project);

    if (submission && submission.status !== 'changes_needed') {
      submission.status = 'changes_needed';
      submission.overrideHours = 0;
      submission.internalHours = 0;
      await this.submissionRepo.save(submission);
    }

    const review = this.reviewRepo.create({
      projectId: project.id,
      reviewerId: superAdminId,
      submissionId: submission?.id ?? null,
      status: 'changes_needed',
      feedback,
      internalNote: 'Rejected at second-pass review',
      overrideJustification: null,
    });
    await this.reviewRepo.save(review);

    await this.auditLogService.log(
      project.userId,
      'project_reviewed',
      `Project "${project.name}" received feedback`,
    );
    this.logger.log(`Second-pass rejected project ${project.id}`);
    return { success: true };
  }

}

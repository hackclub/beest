import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AdminService } from '../admin/admin.service';
import { AuditService } from '../admin/audit.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { Comment } from '../entities/comment.entity';
import { FulfillmentUpdate } from '../entities/fulfillment-update.entity';
import { Order } from '../entities/order.entity';
import { Project } from '../entities/project.entity';
import { ProjectReview } from '../entities/project-review.entity';
import { ShopItem } from '../entities/shop-item.entity';
import { Submission } from '../entities/submission.entity';
import { User } from '../entities/user.entity';
import { HackatimeService } from '../hackatime/hackatime.service';
import { HcaService } from '../hca/hca.service';
import { ShopService } from '../shop/shop.service';
import {
  actorIdFor,
  decodeCursor,
  diffSnapshots,
  encodeCursor,
  hoursForSubmission,
  shipDisplayFields,
  toSidekickOrder,
  toSidekickProject,
  toSidekickShopItem,
} from './sidekick.mappers';
import {
  FetchOrdersInput,
  FetchOrdersOutput,
  FetchProjectsInput,
  FetchProjectsOutput,
  FetchProjectTimelineOutput,
  FetchUserNoteInput,
  FetchUserNoteOutput,
  GetProgramStatsOutput,
  RevealOrderAddressOutput,
  SidekickProject,
  SubmitReviewActionInput,
  SubmitReviewActionOutput,
  TimelineEvent,
  UpdateItemFieldsInput,
  UpdateOrderFieldsInput,
  UpdateOrderStatusInput,
  UpdateReviewActionInput,
  UpdateUserNoteInput,
} from './sidekick.types';

/** Sort-stable rank so same-timestamp events keep a sensible order. */
const EVENT_RANK: Record<TimelineEvent['type'], number> = {
  ship: 0,
  comment: 1,
  approval: 2,
  discarded_approval: 2,
  rejection: 2,
};

@Injectable()
export class SidekickService {
  private readonly logger = new Logger(SidekickService.name);

  constructor(
    @InjectRepository(Project) private readonly projectRepo: Repository<Project>,
    @InjectRepository(Submission) private readonly submissionRepo: Repository<Submission>,
    @InjectRepository(ProjectReview) private readonly reviewRepo: Repository<ProjectReview>,
    @InjectRepository(Comment) private readonly commentRepo: Repository<Comment>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(ShopItem) private readonly shopRepo: Repository<ShopItem>,
    @InjectRepository(FulfillmentUpdate)
    private readonly fulfillmentRepo: Repository<FulfillmentUpdate>,
    private readonly adminService: AdminService,
    private readonly auditService: AuditService,
    private readonly shopService: ShopService,
    private readonly hcaService: HcaService,
    private readonly auditLogService: AuditLogService,
    private readonly hackatimeService: HackatimeService,
  ) {}

  // ── Health / stats ──────────────────────────────────────────────────────

  healthCheck() {
    return { ok: true, version: process.env.npm_package_version ?? 'unknown' };
  }

  async getProgramStats(): Promise<GetProgramStatsOutput> {
    const [pendingReviewCount, pendingHqCount, pendingFulfillmentCount] = await Promise.all([
      // 'unreviewed' projects always carry an open submission, so this equals
      // "projects with ≥1 pending ship".
      this.projectRepo.count({ where: { status: 'unreviewed' } }),
      // fraud_pending = community-approved, parked in the second-pass audit
      // queue — Sidekick's pending_hq.
      this.projectRepo.count({ where: { status: 'fraud_pending' } }),
      this.orderRepo.count({ where: { status: 'pending' } }),
    ]);
    return { pendingReviewCount, pendingHqCount, pendingFulfillmentCount };
  }

  // ── Projects ────────────────────────────────────────────────────────────

  async fetchProjects(input: FetchProjectsInput): Promise<FetchProjectsOutput> {
    const status = input.status ?? 'all';
    if (!['pending', 'pending_hq', 'approved', 'rejected', 'all'].includes(status)) {
      throw new BadRequestException(`Unknown status filter: ${status}`);
    }
    const limit = clampLimit(input.limit);
    const filterEcho = `projects:${status}`;
    const offset = input.cursor ? decodeCursor(input.cursor, filterEcho) : 0;

    const qb = this.projectRepo
      .createQueryBuilder('project')
      .innerJoinAndSelect('project.user', 'user')
      // Draft projects have never been shipped — they have no submissions and
      // are none of Sidekick's business.
      .where('EXISTS (SELECT 1 FROM submissions s WHERE s.project_id = project.id)');

    switch (status) {
      case 'pending':
        qb.andWhere(`project.status = 'unreviewed'`);
        break;
      case 'pending_hq':
        qb.andWhere(`project.status = 'fraud_pending'`);
        break;
      case 'approved':
        qb.andWhere(
          `EXISTS (SELECT 1 FROM submissions s WHERE s.project_id = project.id AND s.status = 'approved')`,
        );
        break;
      case 'rejected':
        qb.andWhere(
          `EXISTS (SELECT 1 FROM submissions s WHERE s.project_id = project.id AND s.status IN ('changes_needed', 'rejected'))`,
        );
        break;
    }

    const [projects, totalCount] = await qb
      .orderBy('project.createdAt', 'DESC')
      .addOrderBy('project.id', 'DESC')
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    const submissionsByProject = await this.loadSubmissions(projects.map((p) => p.id));
    const mapped = projects.map((p) =>
      toSidekickProject(p, submissionsByProject.get(p.id) ?? []),
    );

    return {
      projects: mapped,
      totalCount,
      nextCursor:
        offset + projects.length < totalCount
          ? encodeCursor(offset + projects.length, filterEcho)
          : undefined,
    };
  }

  async fetchProjectDetail(projectId: string): Promise<SidekickProject> {
    const project = await this.requireProject(projectId);
    const submissions = await this.submissionRepo.find({
      where: { projectId: project.id },
      order: { createdAt: 'ASC' },
    });
    await this.backfillHoursSnapshot(project, submissions);
    return toSidekickProject(project, submissions);
  }

  /**
   * Optional protocol action: the author's other projects, shown next to the
   * one under review. Unknown authors get an empty list (not an error) — the
   * section simply stays empty.
   */
  async fetchAuthorProjects(input: {
    authorId: string;
    excludeProjectId?: string;
  }): Promise<{ projects: SidekickProject[] }> {
    requireString(input?.authorId, 'authorId');
    const author = await this.resolveActor(input.authorId);
    if (!author) return { projects: [] };

    const qb = this.projectRepo
      .createQueryBuilder('project')
      .innerJoinAndSelect('project.user', 'user')
      .where('project.userId = :uid', { uid: author.id })
      // Drafts have never been shipped and are none of Sidekick's business.
      .andWhere('EXISTS (SELECT 1 FROM submissions s WHERE s.project_id = project.id)');
    if (input.excludeProjectId) {
      qb.andWhere('project.id <> :excluded', { excluded: input.excludeProjectId });
    }
    const projects = await qb.orderBy('project.createdAt', 'DESC').getMany();

    const submissionsByProject = await this.loadSubmissions(projects.map((p) => p.id));
    return {
      projects: projects.map((p) =>
        toSidekickProject(p, submissionsByProject.get(p.id) ?? []),
      ),
    };
  }

  // ── User notes ──────────────────────────────────────────────────────────

  /**
   * Optional protocol action: the per-user reviewer note shown on Sidekick's
   * user card (users.reviewer_user_note — the same note the admin panel
   * edits). Unknown users read as "no note" rather than an error, since
   * Sidekick may ask about authors it saw elsewhere.
   */
  async fetchUserNote(input: FetchUserNoteInput): Promise<FetchUserNoteOutput> {
    requireString(input?.userId, 'userId');
    const user = await this.resolveActor(input.userId);
    return { note: user?.reviewerUserNote ?? null };
  }

  async updateUserNote(input: UpdateUserNoteInput): Promise<{ success: true }> {
    requireString(input?.userId, 'userId');
    requireString(input?.editorId, 'editorId');
    if (input.note != null && typeof input.note !== 'string') {
      throw new BadRequestException('note must be a string or null.');
    }

    const user = await this.resolveActor(input.userId);
    if (!user) throw new NotFoundException(`No user found with ID ${input.userId}.`);

    // Same normalization as the admin panel: trimmed, capped, empty clears.
    const cleaned = input.note?.trim().slice(0, 2000) || null;
    user.reviewerUserNote = cleaned;
    await this.userRepo.save(user);

    const editor = await this.resolveActor(input.editorId);
    await this.auditLogService.log(
      user.id,
      'sidekick_user_note_change',
      `Reviewer note ${cleaned ? 'updated' : 'cleared'} via Sidekick by ${editor?.name ?? input.editorId}`,
    );
    return { success: true };
  }

  async fetchProjectTimeline(projectId: string): Promise<FetchProjectTimelineOutput> {
    const project = await this.requireProject(projectId);
    const [submissions, reviews, comments] = await Promise.all([
      this.submissionRepo
        .find({
          where: { projectId: project.id },
          order: { createdAt: 'ASC' },
        })
        .then(async (subs) => {
          await this.backfillHoursSnapshot(project, subs);
          return subs;
        }),
      this.reviewRepo.find({
        where: { projectId: project.id },
        relations: ['reviewer', 'returnedBy'],
        order: { createdAt: 'ASC' },
      }),
      // Internal comments included — this endpoint is reviewer-facing only.
      this.commentRepo.find({
        where: { projectId: project.id },
        relations: ['user'],
        order: { createdAt: 'ASC' },
      }),
    ]);

    const authorActorId = actorIdFor(project.user);
    const submissionById = new Map(submissions.map((s) => [s.id, s]));
    const events: TimelineEvent[] = [];

    submissions.forEach((s, i) => {
      const changes =
        i > 0 ? diffSnapshots(submissions[i - 1].projectSnapshot, s.projectSnapshot) : [];
      const displayFields = shipDisplayFields(s);
      events.push({
        type: 'ship',
        shipId: s.id,
        actorId: authorActorId,
        hoursSubmitted: hoursForSubmission(s),
        ...(changes.length > 0 ? { changes } : {}),
        ...(displayFields.length > 0 ? { displayFields } : {}),
        timestamp: new Date(s.createdAt).toISOString(),
      });
    });

    for (const review of reviews) {
      const reviewerActorId = actorIdFor(review.reviewer);
      const submission = review.submissionId
        ? submissionById.get(review.submissionId)
        : undefined;
      const shipId = review.submissionId ?? submissions[0]?.id ?? '';
      const timestamp = new Date(review.createdAt).toISOString();

      // internalHours is the canonical Unified-YSWS-DB value (hoursAssigned);
      // overrideHours is what the author was rewarded — echoed as the
      // rewarded-hours override when the two differ. Legacy rows without an
      // internalHours fall back to the rewarded value alone.
      const assignedHours = submission?.internalHours ?? submission?.overrideHours ?? 0;
      const rewardedHours =
        submission?.internalHours != null &&
        submission?.overrideHours != null &&
        submission.overrideHours !== submission.internalHours
          ? submission.overrideHours
          : undefined;

      if (review.status === 'approved') {
        events.push({
          type: 'approval',
          shipId,
          actorId: reviewerActorId,
          hoursAssigned: assignedHours,
          ...(rewardedHours !== undefined ? { rewardedHoursOverride: rewardedHours } : {}),
          feedbackMessage: review.feedback ?? '',
          justification: review.overrideJustification ?? review.internalNote ?? '',
          fields: {
            // internal_note only when it isn't already surfaced as the
            // justification above.
            ...(review.internalNote && review.overrideJustification
              ? { internal_note: review.internalNote }
              : {}),
            ...(review.hideReviewerName ? { hide_reviewer_name: true } : {}),
          },
          timestamp,
        });
      } else if (review.status === 'returned') {
        // A first-pass approval that second-pass review sent back. The pill is
        // attributed to whoever returned it, not the original reviewer.
        events.push({
          type: 'discarded_approval',
          id: `ret:${review.id}`,
          shipId,
          actorId: reviewerActorId,
          discardedByActorId: review.returnedBy
            ? actorIdFor(review.returnedBy)
            : reviewerActorId,
          hoursAssigned: assignedHours,
          ...(rewardedHours !== undefined ? { rewardedHoursOverride: rewardedHours } : {}),
          feedbackMessage: review.feedback ?? '',
          justification: review.overrideJustification ?? review.internalNote ?? '',
          timestamp,
        });
      } else {
        events.push({
          type: 'rejection',
          shipId,
          actorId: reviewerActorId,
          feedbackMessage: review.feedback ?? '',
          internalMessage: review.internalNote ?? undefined,
          ...(review.hideReviewerName ? { fields: { hide_reviewer_name: true } } : {}),
          timestamp,
        });
      }
    }

    for (const comment of comments) {
      events.push({
        type: 'comment',
        actorId: actorIdFor(comment.user),
        message: comment.body,
        isInternal: comment.isInternal,
        timestamp: new Date(comment.createdAt).toISOString(),
      });
    }

    events.sort(
      (a, b) =>
        a.timestamp.localeCompare(b.timestamp) || EVENT_RANK[a.type] - EVENT_RANK[b.type],
    );
    return { events };
  }

  // ── Review actions ──────────────────────────────────────────────────────

  async submitReviewAction(input: SubmitReviewActionInput): Promise<SubmitReviewActionOutput> {
    requireString(input?.shipId, 'shipId');
    requireString(input?.reviewerId, 'reviewerId');

    const reviewer = await this.resolveActor(input.reviewerId);
    if (!reviewer) {
      throw new BadRequestException(
        `Reviewer ${input.reviewerId} has no Beest account — they need to log into Beest once before reviewing.`,
      );
    }

    const submission = await this.submissionRepo.findOne({ where: { id: input.shipId } });
    if (!submission) {
      throw new NotFoundException(`No ship found with ID ${input.shipId}.`);
    }
    const project = await this.projectRepo.findOne({
      where: { id: submission.projectId },
      relations: ['user'],
    });
    if (!project) throw new NotFoundException('Project not found for this ship.');

    const now = new Date().toISOString();
    const reviewerActorId = input.reviewerId;

    switch (input.action) {
      case 'approve': {
        if (typeof input.hoursAssigned !== 'number' || !(input.hoursAssigned > 0)) {
          throw new BadRequestException('hoursAssigned must be a positive number.');
        }
        if (
          input.rewardedHoursOverride !== undefined &&
          (typeof input.rewardedHoursOverride !== 'number' || !(input.rewardedHoursOverride > 0))
        ) {
          throw new BadRequestException('rewardedHoursOverride must be a positive number.');
        }
        requireString(input.feedbackMessage, 'feedbackMessage');
        requireString(input.justification, 'justification');
        await this.requireOpenSubmission(project.id, submission.id);

        const fields = input.fields ?? {};
        const hideReviewerName = fields.hide_reviewer_name === true;
        // Golden semantics match the admin panel: a boolean decides the flag
        // on this approval; an absent field (older Sidekick clients) maps to
        // null = leave the project's golden mark unchanged.
        const markGolden =
          typeof fields.mark_golden === 'boolean' ? fields.mark_golden : null;
        const internalNote =
          typeof fields.internal_note === 'string' && fields.internal_note.trim()
            ? fields.internal_note.trim()
            : null;

        const justification = await this.composeJustification(
          project,
          reviewer,
          input.hoursAssigned,
          input.justification,
        );

        // hoursAssigned is the canonical Unified-YSWS-DB number → internalHours
        // (Airtable "Override Hours Spent"). The rewarded override, when given,
        // is what the author actually earns → overrideHours (drives pipes);
        // without one the author is rewarded the assigned hours as usual.
        await this.adminService.reviewProject(
          project.id,
          reviewer.id,
          'approved',
          input.feedbackMessage,
          internalNote,
          undefined,
          hideReviewerName,
          justification,
          input.rewardedHoursOverride ?? input.hoursAssigned,
          input.hoursAssigned,
          markGolden,
        );

        // HQ reviewers skip the second-pass audit stage: immediately authorize
        // the approval we just recorded (grants pipes, flips to 'approved',
        // syncs Airtable/Loops). Community approvals stay parked in
        // fraud_pending → reported to Sidekick as pending_hq.
        // Only the authorization note is sent here — the audit stage combines
        // it with the composed first-pass justification stored on the review
        // row, so passing the composed text again would duplicate it.
        if (input.isHq === true) {
          await this.auditService.decide(project.id, reviewer.id, {
            action: 'approve',
            justification:
              'HQ direct approval via Sidekick — first pass and authorization by the same HQ reviewer.',
            combineWithFirstPass: true,
            isSuperAdmin: true,
          });
        }

        return {
          success: true,
          event: {
            type: 'approval',
            shipId: submission.id,
            actorId: reviewerActorId,
            hoursAssigned: input.hoursAssigned,
            ...(input.rewardedHoursOverride !== undefined
              ? { rewardedHoursOverride: input.rewardedHoursOverride }
              : {}),
            feedbackMessage: input.feedbackMessage,
            justification,
            fields: input.fields,
            timestamp: now,
          },
        };
      }

      case 'reject': {
        requireString(input.feedbackMessage, 'feedbackMessage');
        await this.requireOpenSubmission(project.id, submission.id);

        const fields = input.fields ?? {};
        const hideReviewerName = fields.hide_reviewer_name === true;
        // hard_reject = terminal 'rejected' (cannot resubmit or delete);
        // default is Beest's regular 'changes_needed'.
        const status = fields.hard_reject === true ? 'rejected' : 'changes_needed';

        await this.adminService.reviewProject(
          project.id,
          reviewer.id,
          status,
          input.feedbackMessage,
          input.internalMessage ?? null,
          undefined,
          hideReviewerName,
          null,
          null,
          null,
        );

        return {
          success: true,
          event: {
            type: 'rejection',
            shipId: submission.id,
            actorId: reviewerActorId,
            feedbackMessage: input.feedbackMessage,
            internalMessage: input.internalMessage,
            fields: input.fields,
            timestamp: now,
          },
        };
      }

      case 'authorize': {
        if (project.status !== 'fraud_pending') {
          throw new BadRequestException(
            'This ship is not awaiting HQ authorization (only pending_hq ships can be authorized).',
          );
        }
        // Sidekick sends per-ship hours; the audit stage wants FINAL cumulative
        // totals for the project. Replace this submission's delta with the
        // authorizer's numbers on top of the prior approved hours. When
        // hoursAssigned is absent, decide() preserves the first-pass values
        // (which already carry any rewarded override from the approval).
        let overrideHours: number | null = null;
        let internalHours: number | null = null;
        if (input.hoursAssigned !== undefined) {
          if (typeof input.hoursAssigned !== 'number' || !(input.hoursAssigned > 0)) {
            throw new BadRequestException('hoursAssigned must be a positive number.');
          }
          if (
            input.rewardedHoursOverride !== undefined &&
            (typeof input.rewardedHoursOverride !== 'number' ||
              !(input.rewardedHoursOverride > 0))
          ) {
            throw new BadRequestException('rewardedHoursOverride must be a positive number.');
          }
          // Same split as approve: hoursAssigned → internalHours (Airtable),
          // rewarded override (or assigned when none) → overrideHours (pipes).
          // Rows from before internalHours was tracked implicitly used the
          // rewarded value as the internal one — fall back accordingly.
          const priorRewarded = (project.overrideHours ?? 0) - (submission.overrideHours ?? 0);
          const priorInternal =
            (project.internalHours ?? project.overrideHours ?? 0) -
            (submission.internalHours ?? submission.overrideHours ?? 0);
          overrideHours =
            Math.round((priorRewarded + (input.rewardedHoursOverride ?? input.hoursAssigned)) * 10) / 10;
          internalHours = Math.round((priorInternal + input.hoursAssigned) * 10) / 10;
        }

        await this.auditService.decide(project.id, reviewer.id, {
          action: 'approve',
          overrideHours,
          internalHours,
          justification: padJustification(
            input.justification,
            `Authorized by ${reviewer.name ?? 'unknown'} via Sidekick — second-pass review conducted in the Sidekick console.`,
          ),
          combineWithFirstPass: true,
          isSuperAdmin: true,
        });

        return {
          success: true,
          event: {
            type: 'approval',
            shipId: submission.id,
            actorId: reviewerActorId,
            hoursAssigned:
              input.hoursAssigned ?? submission.internalHours ?? submission.overrideHours ?? 0,
            ...(input.rewardedHoursOverride !== undefined
              ? { rewardedHoursOverride: input.rewardedHoursOverride }
              : {}),
            feedbackMessage: '',
            justification: input.justification ?? 'Authorized via Sidekick.',
            timestamp: now,
          },
        };
      }

      case 'deauthorize': {
        if (project.status !== 'fraud_pending') {
          throw new BadRequestException(
            'This ship is not awaiting HQ authorization (only pending_hq ships can be deauthorized).',
          );
        }
        const message =
          typeof input.message === 'string' && input.message.trim()
            ? input.message.trim()
            : 'Returned for re-review via Sidekick.';

        await this.auditService.decide(project.id, reviewer.id, {
          action: 'rereview',
          reviewerFeedback: message,
        });

        return {
          success: true,
          event: {
            type: 'comment',
            actorId: reviewerActorId,
            message: `Returned to the first-review queue: ${message}`,
            isInternal: true,
            timestamp: now,
          },
        };
      }

      case 'comment':
      case 'internal_comment': {
        requireString(input.commentText, 'commentText');
        const body = sanitizeText(input.commentText).slice(0, 500);
        if (!body) throw new BadRequestException('Comment cannot be empty.');

        // Written via the repo on purpose: ProjectsService.addComment only
        // allows comments on approved projects, but reviewers comment on
        // projects that are mid-review.
        const isInternal = input.action === 'internal_comment';
        await this.commentRepo.save(
          this.commentRepo.create({
            projectId: project.id,
            userId: reviewer.id,
            body,
            isInternal,
          }),
        );

        return {
          success: true,
          event: {
            type: 'comment',
            actorId: reviewerActorId,
            message: body,
            isInternal,
            timestamp: now,
          },
        };
      }

      default:
        throw new BadRequestException(
          `Unknown review action: ${(input as { action?: string }).action}`,
        );
    }
  }

  async updateReviewAction(input: UpdateReviewActionInput): Promise<{ success: true }> {
    requireString(input?.shipId, 'shipId');
    requireString(input?.reviewerId, 'reviewerId');
    requireString(input?.feedbackMessage, 'feedbackMessage');

    const reviewer = await this.resolveActor(input.reviewerId);
    if (!reviewer) {
      throw new BadRequestException(`Reviewer ${input.reviewerId} has no Beest account.`);
    }

    const statuses =
      input.type === 'approval'
        ? ['approved']
        : input.type === 'rejection'
          ? ['changes_needed', 'rejected']
          : null;
    if (!statuses) {
      throw new BadRequestException(`Unknown review type: ${(input as { type?: string }).type}`);
    }

    const review = await this.reviewRepo.findOne({
      where: {
        submissionId: input.shipId,
        reviewerId: reviewer.id,
        status: In(statuses),
      },
      order: { createdAt: 'DESC' },
    });
    if (!review) {
      throw new NotFoundException(
        `No ${input.type} by ${input.reviewerId} found on ship ${input.shipId}.`,
      );
    }

    review.feedback = input.feedbackMessage;
    if (input.type === 'approval') {
      review.overrideJustification = input.justification ?? review.overrideJustification;
      const note = input.fields?.internal_note;
      if (typeof note === 'string') review.internalNote = note.trim() || null;
    } else if (input.internalMessage !== undefined) {
      review.internalNote = input.internalMessage || null;
    }
    const hide = input.fields?.hide_reviewer_name;
    if (typeof hide === 'boolean') review.hideReviewerName = hide;

    // Assigned-hours edits are only meaningful before HQ authorization: while
    // the ship sits in pending_hq nothing has paid out pipes or synced to
    // Airtable, so the first-pass numbers written by reviewProject can be
    // swapped in place and the eventual authorize (which preserves first-pass
    // values when sent without hours) picks them up. Once finalized, hour
    // changes must route through changes_needed → re-approve (pipes clawback)
    // — reject those instead of silently dropping the edit.
    if (input.type === 'approval' && input.hoursAssigned !== undefined) {
      if (typeof input.hoursAssigned !== 'number' || !(input.hoursAssigned > 0)) {
        throw new BadRequestException('hoursAssigned must be a positive number.');
      }
      const submission = await this.submissionRepo.findOne({ where: { id: input.shipId } });
      if (!submission) throw new NotFoundException(`No ship found with ID ${input.shipId}.`);
      const project = await this.projectRepo.findOne({ where: { id: submission.projectId } });
      if (!project) throw new NotFoundException('Project not found for this ship.');

      const newInternal = Math.round(input.hoursAssigned * 10) / 10;
      const oldInternal = submission.internalHours ?? submission.overrideHours ?? 0;
      const oldRewarded = submission.overrideHours ?? 0;
      const isPendingHq =
        project.status === 'fraud_pending' && submission.status === 'unreviewed';

      if (!isPendingHq) {
        if (newInternal !== oldInternal) {
          throw new BadRequestException(
            'Assigned hours can only be edited while the ship awaits HQ authorization. Send finalized approvals to "changes needed" and re-approve instead.',
          );
        }
      } else if (newInternal !== oldInternal) {
        // An explicit rewarded override from the first pass survives the edit;
        // without one, the rewarded hours track the assigned hours as on
        // approve. Same delta-on-top-of-prior bookkeeping as reviewProject.
        const hadExplicitOverride =
          submission.internalHours != null &&
          submission.overrideHours != null &&
          submission.overrideHours !== submission.internalHours;
        const newRewarded = hadExplicitOverride ? oldRewarded : newInternal;

        project.internalHours =
          Math.round(
            ((project.internalHours ?? project.overrideHours ?? 0) - oldInternal + newInternal) *
              10,
          ) / 10;
        project.overrideHours =
          Math.round(((project.overrideHours ?? 0) - oldRewarded + newRewarded) * 10) / 10;
        submission.internalHours = newInternal;
        submission.overrideHours = newRewarded;
        await this.projectRepo.save(project);
        await this.submissionRepo.save(submission);
      }
    }

    await this.reviewRepo.save(review);
    return { success: true };
  }

  // ── Shop ────────────────────────────────────────────────────────────────

  async fetchShopItems() {
    const items = await this.shopRepo.find({
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
    return { items: items.map(toSidekickShopItem) };
  }

  async fetchOrders(input: FetchOrdersInput): Promise<FetchOrdersOutput> {
    const status = input.status ?? 'all';
    if (!['pending', 'fulfilled', 'cancelled', 'all'].includes(status)) {
      throw new BadRequestException(`Unknown status filter: ${status}`);
    }
    const sortBy = input.sortBy ?? 'date';
    const sortOrder = input.sortOrder === 'desc' ? 'DESC' : 'ASC';
    const sortColumns: Record<string, string> = {
      id: 'order.id',
      user: 'user.name',
      // The denormalized name snapshot — avoids a join and still covers
      // orders whose shop item was deleted.
      item: 'order.itemName',
      quantity: 'order.quantity',
      date: 'order.createdAt',
      status: 'order.status',
    };
    const sortColumn = sortColumns[sortBy];
    if (!sortColumn) throw new BadRequestException(`Unknown sortBy: ${sortBy}`);

    const limit = clampLimit(input.limit);
    const search = typeof input.searchUser === 'string' ? input.searchUser.trim() : '';
    const filterEcho = `orders:${status}:${input.filterItemId ?? ''}:${search}:${sortBy}:${sortOrder}`;
    const offset = input.cursor ? decodeCursor(input.cursor, filterEcho) : 0;

    const qb = this.orderRepo
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.user', 'user');
    if (status !== 'all') qb.andWhere('order.status = :status', { status });
    if (input.filterItemId) {
      qb.andWhere('order.shopItemId = :itemId', { itemId: input.filterItemId });
    }
    if (search) {
      // Name/nickname only: emails are encrypted at rest with a random IV, so
      // there is no ciphertext to match a substring against in SQL.
      qb.andWhere('(user.name ILIKE :q OR user.nickname ILIKE :q)', { q: `%${search}%` });
    }

    const [orders, totalCount] = await qb
      .orderBy(sortColumn, sortOrder)
      .addOrderBy('order.id', 'ASC')
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    const orderIds = orders.map((o) => o.id);
    const [latestNotes, items] = await Promise.all([
      this.latestFulfillmentNotes(orderIds),
      this.shopRepo.find({
        where: {
          id: In([...new Set(orders.map((o) => o.shopItemId).filter((id): id is string => !!id))]),
        },
      }),
    ]);

    return {
      orders: orders.map((o) => toSidekickOrder(o, latestNotes.get(o.id) ?? null)),
      items: Object.fromEntries(items.map((i) => [i.id, toSidekickShopItem(i)])),
      totalCount,
      nextCursor:
        offset + orders.length < totalCount
          ? encodeCursor(offset + orders.length, filterEcho)
          : undefined,
    };
  }

  async fetchOrderDetail(orderId: string) {
    const order = await this.requireOrder(orderId);
    const item = order.shopItemId
      ? await this.shopRepo.findOne({ where: { id: order.shopItemId } })
      : null;
    const notes = await this.latestFulfillmentNotes([order.id]);
    return {
      order: toSidekickOrder(order, notes.get(order.id) ?? null),
      // The shop item may have been deleted (FK is SET NULL) — synthesize a
      // minimal stand-in from the order's name snapshot.
      item: item
        ? toSidekickShopItem(item)
        : { id: order.shopItemId ?? '', name: order.itemName },
    };
  }

  async revealOrderAddress(orderId: string): Promise<RevealOrderAddressOutput> {
    const order = await this.requireOrder(orderId);
    if (!order.user?.hcaSub) {
      throw new NotFoundException({ error: 'NOT_FOUND', message: 'No address on file.' });
    }

    // Addresses are never stored in Beest — fetched live from Hack Club Auth
    // with the user's OAuth tokens, exactly like the internal admin panel.
    const identity = await this.hcaService.getIdentity(order.user.hcaSub);
    if (!identity) {
      throw new ServiceUnavailableException({
        error: 'ADDRESS_UNAVAILABLE',
        message:
          'HCA tokens expired or the address vault is unreachable — the user may need to log into Beest again. Retry later.',
      });
    }
    const address = identity.address;
    if (!address?.street_address || !address.locality || !address.country) {
      throw new NotFoundException({ error: 'NOT_FOUND', message: 'No address on file.' });
    }

    // Every reveal is recorded (against the order owner; Sidekick audits the
    // requesting staff member on its side).
    await this.auditLogService.log(
      order.userId,
      'sidekick_address_reveal',
      `Shipping address for order ${order.id} (${order.itemName}) revealed via Sidekick`,
    );

    const fullName = (identity.name ?? order.user.name ?? '').trim();
    const lastSpace = fullName.lastIndexOf(' ');
    const firstName = lastSpace > 0 ? fullName.slice(0, lastSpace) : fullName;
    const lastName = lastSpace > 0 ? fullName.slice(lastSpace + 1) : '';

    return {
      firstName,
      lastName,
      line1: address.street_address,
      city: address.locality,
      stateProvince: address.region || undefined,
      postalCode: address.postal_code ?? '',
      country: address.country,
      phoneNumber: identity.phone_number || undefined,
    };
  }

  async updateOrderStatus(input: UpdateOrderStatusInput): Promise<{ success: true }> {
    requireString(input?.orderId, 'orderId');
    switch (input.newStatus) {
      case 'fulfilled': {
        if (typeof input.reference === 'string' && input.reference.trim()) {
          const order = await this.requireOrder(input.orderId);
          order.reference = input.reference.trim().slice(0, 500);
          await this.orderRepo.save(order);
        }
        await this.shopService.fulfillOrder(input.orderId);
        return { success: true };
      }
      case 'cancelled': {
        // Soft cancel: returns pipes, restocks, keeps the row as 'cancelled'.
        await this.shopService.refundOrder(input.orderId);
        return { success: true };
      }
      case 'pending':
        throw new BadRequestException(
          'Orders cannot be moved back to pending — the buyer was already notified of the previous status.',
        );
      default:
        throw new BadRequestException(`Unknown order status: ${String(input.newStatus)}`);
    }
  }

  async updateOrderFields(input: UpdateOrderFieldsInput): Promise<{ success: true }> {
    requireString(input?.orderId, 'orderId');
    const order = await this.requireOrder(input.orderId);

    if (input.reference !== undefined) {
      order.reference = String(input.reference).trim().slice(0, 500) || null;
    }
    if (input.adminNotes !== undefined) {
      order.adminNotes = String(input.adminNotes).trim() || null;
    }
    await this.orderRepo.save(order);

    if (typeof input.userNotes === 'string' && input.userNotes.trim()) {
      // Beest's user-visible order notes are an append-only message feed
      // (each one notifies the buyer), not an editable field. Sidekick's
      // userNotes reads back as the latest message.
      await this.shopService.sendFulfillmentMessage(order.id, input.userNotes);
    }
    return { success: true };
  }

  async updateItemFields(input: UpdateItemFieldsInput): Promise<{ success: true }> {
    requireString(input?.itemId, 'itemId');
    const item = await this.shopRepo.findOne({ where: { id: input.itemId } });
    if (!item) throw new NotFoundException(`No shop item found with ID ${input.itemId}.`);
    if (input.fulfillerContext !== undefined) {
      item.fulfillerContext = String(input.fulfillerContext).trim() || null;
      await this.shopRepo.save(item);
    }
    return { success: true };
  }

  // ── Internals ───────────────────────────────────────────────────────────

  /**
   * Beest's admin UI pre-fills the justification textarea with an accounting
   * header (Hackatime tracked hours, linked projects, prior-approval delta
   * bookkeeping, unified-first-submission note) and a sign-off line; whatever
   * the reviewer submits is stored verbatim. Reviews arriving through Sidekick
   * skip that UI, so compose the same header around the reviewer's text here —
   * the audit record (→ Airtable) stays uniform regardless of review surface.
   * `project.user` must be loaded. Lookups are best-effort: on failure the
   * corresponding line is simply omitted.
   */
  private async composeJustification(
    project: Project,
    reviewer: User,
    hoursAssigned: number,
    justification: string,
  ): Promise<string> {
    const facts = await this.adminService.getJustificationFacts(project);

    const updateNote = project.isUpdate ? ' (this is an update to an existing project)' : '';
    const lines: string[] = [];
    if (facts.trackedHours !== null) {
      lines.push(
        `the user tracked ${facts.trackedHours} hours on the project through hackatime${updateNote}`,
      );
    } else if (project.isUpdate) {
      lines.push('this is an update to an existing project');
    }

    const htNames = (project.hackatimeProjectName ?? []).filter((n) => !!n).join(', ');
    if (htNames) lines.push(`Hackatime projects: ${htNames}`);

    const prevHours = project.internalHours ?? project.overrideHours ?? 0;
    if (prevHours > 0) {
      const totalAfter = Math.round((prevHours + hoursAssigned) * 10) / 10;
      lines.push(
        `Previously approved: ${prevHours}h — this ship's delta: ${hoursAssigned}h (project total after: ${totalAfter}h)`,
      );
    }

    if (facts.unifiedFirstSubmission && project.codeUrl) {
      const today = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
      lines.push(`As of ${today} this is the first submission of this code URL to unified.`);
    }

    const signOff = `signed off by ${reviewer.name ?? 'unknown'} via Sidekick`;
    return [lines.join('\n'), justification.trim(), signOff].filter(Boolean).join('\n\n');
  }

  /** Incoming actor IDs are a Slack ID or an HCA identity ID. */
  private resolveActor(actorId: string): Promise<User | null> {
    return this.userRepo.findOne({
      where: [{ slackId: actorId }, { hcaSub: actorId }],
    });
  }

  private async requireProject(projectId: string): Promise<Project> {
    requireString(projectId, 'projectId');
    const project = await this.projectRepo.findOne({
      where: { id: projectId },
      relations: ['user'],
    });
    if (!project) {
      throw new NotFoundException(`No project found with ID ${projectId}.`);
    }
    return project;
  }

  private async requireOrder(orderId: string): Promise<Order> {
    requireString(orderId, 'orderId');
    const order = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: ['user'],
    });
    if (!order) throw new NotFoundException(`No order found with ID ${orderId}.`);
    return order;
  }

  /**
   * Lazy backfill for pre-Sidekick submissions: `hours_snapshot` only exists
   * for ships created after the Sidekick migration, so the still-open ship of
   * an older project would report 0 claimed hours. Mirror the-game's fallback
   * (live ship → current Hackatime total) and persist the result so list views
   * pick it up and the remote call happens at most once per legacy ship.
   * Best-effort: a Hackatime outage must never break a fetch.
   */
  private async backfillHoursSnapshot(
    project: Project,
    submissions: Submission[],
  ): Promise<void> {
    const latest = submissions[submissions.length - 1];
    const names = (project.hackatimeProjectName ?? []).filter((n) => !!n);
    if (
      !latest ||
      latest.status !== 'unreviewed' ||
      latest.hoursSnapshot != null ||
      names.length === 0 ||
      !project.user?.hcaSub
    ) {
      return;
    }
    try {
      const { hours } = await this.hackatimeService.getHoursForProjects(
        project.user.hcaSub,
        [...new Set(names)],
      );
      // 0 also means "no Hackatime token" — leave null so a later fetch can
      // retry rather than freezing a false zero.
      if (hours > 0) {
        latest.hoursSnapshot = hours;
        await this.submissionRepo.update(latest.id, { hoursSnapshot: hours });
      }
    } catch (err) {
      this.logger.warn(`Hackatime hours backfill failed for project ${project.id}: ${err}`);
    }
  }

  /**
   * Approve/reject act on the project's single open submission (that's what
   * AdminService.reviewProject picks up) — reject stale ship IDs so a
   * decision never lands on a different submission than the reviewer saw.
   */
  private async requireOpenSubmission(projectId: string, shipId: string): Promise<void> {
    const latest = await this.submissionRepo.findOne({
      where: { projectId, status: 'unreviewed' },
      order: { createdAt: 'DESC' },
    });
    if (!latest || latest.id !== shipId) {
      throw new BadRequestException(
        'This ship is not the project’s open submission — refresh and review the latest ship.',
      );
    }
  }

  /**
   * Newest user-visible fulfillment message per order. One bounded query
   * (orderIds is at most a page of orders), first-per-order picked in JS.
   */
  private async latestFulfillmentNotes(orderIds: string[]): Promise<Map<string, string>> {
    if (orderIds.length === 0) return new Map();
    const rows = await this.fulfillmentRepo.find({
      where: { orderId: In(orderIds) },
      order: { createdAt: 'DESC' },
      select: ['orderId', 'message', 'createdAt'],
    });
    const latest = new Map<string, string>();
    for (const row of rows) {
      if (!latest.has(row.orderId)) latest.set(row.orderId, row.message);
    }
    return latest;
  }

  private loadSubmissions(projectIds: string[]): Promise<Map<string, Submission[]>> {
    if (projectIds.length === 0) return Promise.resolve(new Map());
    return this.submissionRepo
      .find({ where: { projectId: In(projectIds) }, order: { createdAt: 'ASC' } })
      .then((subs) => {
        const byProject = new Map<string, Submission[]>();
        for (const s of subs) {
          const list = byProject.get(s.projectId) ?? [];
          list.push(s);
          byProject.set(s.projectId, list);
        }
        return byProject;
      });
  }
}

// ── Module-level helpers (pure) ───────────────────────────────────────────

function clampLimit(limit: unknown): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) return 50;
  return Math.min(100, Math.max(1, Math.floor(limit)));
}

function requireString(value: unknown, field: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestException(`${field} is required.`);
  }
}

/** Same character stripping the rest of the codebase applies to free text. */
function sanitizeText(raw: string): string {
  return String(raw)
    .replace(/[<>"`&\\]/g, '')
    .replace(/\0/g, '')
    .trim();
}

/**
 * AuditService.decide enforces a minimum justification length; Sidekick's
 * justification is free text (with a canned default when the authorizer wrote
 * none), so extend short ones instead of failing the authorization.
 */
function padJustification(justification: string | undefined, suffix: string): string {
  const base = (justification ?? '').trim();
  if (base.length >= 50) return base;
  return base ? `${base} — ${suffix}` : suffix;
}

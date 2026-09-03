import { BadRequestException } from '@nestjs/common';
import { HACKATIME_EVENT_START } from '../hackatime/hackatime.constants';
import { Order } from '../entities/order.entity';
import { Project } from '../entities/project.entity';
import { ShopItem } from '../entities/shop-item.entity';
import { Submission } from '../entities/submission.entity';
import { User } from '../entities/user.entity';
import {
  ProjectChange,
  ReviewFieldDefinition,
  ShipDisplayField,
  SidekickOrder,
  SidekickOrderStatus,
  SidekickProject,
  SidekickShip,
  SidekickShipStatus,
  SidekickShopItem,
  SidekickTag,
} from './sidekick.types';

/**
 * Pure mapping helpers between Beest entities and the Sidekick protocol.
 * Kept free of Nest/TypeORM dependencies so they can be unit-tested directly.
 */

/** Outgoing actor ID: Slack ID when we have one, HCA identity ID otherwise. */
export function actorIdFor(user: Pick<User, 'slackId' | 'hcaSub'> | null | undefined): string {
  return user?.slackId || user?.hcaSub || 'unknown';
}

/**
 * Beest → Sidekick ship status. A submission still marked `unreviewed` while
 * its project sits in `fraud_pending` is a community-approved ship awaiting
 * the second-pass audit — Sidekick's `pending_hq`. Only the latest submission
 * can be in that state (older ones were each decided before a re-ship was
 * possible).
 */
export function mapShipStatus(
  submissionStatus: string,
  projectStatus: string,
  isLatest: boolean,
): SidekickShipStatus {
  switch (submissionStatus) {
    case 'approved':
      return 'approved';
    case 'changes_needed':
    case 'rejected':
      return 'rejected';
    default:
      return isLatest && projectStatus === 'fraud_pending' ? 'pending_hq' : 'pending';
  }
}

/** Claimed hours for a ship, with fallbacks for pre-snapshot rows. */
export function hoursForSubmission(submission: Submission): number {
  return submission.hoursSnapshot ?? submission.overrideHours ?? 0;
}

const APPROVE_FIELDS: ReviewFieldDefinition[] = [
  {
    name: 'internal_note',
    label: 'Internal note',
    type: 'markdown',
    required: false,
    placeholder: 'Only visible to other reviewers',
  },
  {
    name: 'hide_reviewer_name',
    label: 'Hide my name from the builder',
    type: 'boolean',
    required: false,
  },
  {
    name: 'mark_golden',
    label: 'Mark as golden (queue priority + black market access)',
    type: 'boolean',
    required: false,
  },
];

const REJECT_FIELDS: ReviewFieldDefinition[] = [
  {
    name: 'hide_reviewer_name',
    label: 'Hide my name from the builder',
    type: 'boolean',
    required: false,
  },
  {
    name: 'hard_reject',
    label: 'Hard reject',
    type: 'boolean',
    required: false,
    placeholder:
      'Terminal rejection — the project cannot be resubmitted or deleted. Leave off for a normal "changes needed".',
  },
];

export function toSidekickShip(
  submission: Submission,
  projectStatus: string,
  isLatest: boolean,
): SidekickShip {
  const status = mapShipStatus(submission.status, projectStatus, isLatest);
  const ship: SidekickShip = {
    id: submission.id,
    hoursSubmitted: hoursForSubmission(submission),
    submittedAt: new Date(submission.createdAt).toISOString(),
    status,
  };
  if (status === 'pending' || status === 'pending_hq') {
    ship.approveFields = APPROVE_FIELDS;
    ship.rejectFields = REJECT_FIELDS;
    // hoursAssigned lands in the Airtable Unified YSWS DB (internalHours);
    // the override, when given, is what the author is actually rewarded
    // (overrideHours → pipes).
    ship.supportsRewardedOverride = true;
  }
  return ship;
}

/** Queue-priority pills. `golden` marks a golden project; `golden author`
 * marks any project whose author has shipped at least one golden project (the
 * same authors who get review-queue priority + black-market access). */
export function projectTags(project: Project, isGoldenAuthor: boolean): SidekickTag[] {
  const tags: SidekickTag[] = [];
  if (project.isGolden) tags.push({ label: 'golden', color: '#eab308' });
  if (isGoldenAuthor) tags.push({ label: 'golden author', color: '#ca8a04' });
  return tags;
}

/**
 * `project.user` must be loaded. `submissions` must be ordered oldest-first.
 * `isGoldenAuthor` is whether the author has shipped any golden project — it
 * drives the `golden author` tag and must be supplied by the caller since it's
 * a cross-project fact not derivable from this project alone.
 */
export function toSidekickProject(
  project: Project,
  submissions: Submission[],
  isGoldenAuthor = false,
): SidekickProject {
  const tags = projectTags(project, isGoldenAuthor);
  return {
    id: project.id,
    title: project.name,
    description: project.description,
    // The protocol requires codeUrl; Beest allows it to be null. Fall back to
    // whatever project link we have so Sidekick always gets something usable.
    codeUrl: project.codeUrl ?? project.readmeUrl ?? project.demoUrl ?? '',
    demoUrl: project.demoUrl ?? undefined,
    screenshotUrl: project.screenshot1Url ?? undefined,
    authorId: actorIdFor(project.user),
    // User.name is the HCA full name captured at sign-in (not the nickname).
    authorHcaName: project.user?.name?.trim() || undefined,
    hackatimeId: project.user?.hackatimeUserId ?? undefined,
    hackatimeProjectKeys: project.hackatimeProjectName ?? [],
    hackatimeStartDate: HACKATIME_EVENT_START,
    ships: submissions.map((s, i) =>
      toSidekickShip(s, project.status, i === submissions.length - 1),
    ),
    ...(tags.length > 0 ? { tags } : {}),
    metadata: {
      projectType: project.projectType,
      aiUse: project.aiUse,
      isUpdate: project.isUpdate,
      isGolden: project.isGolden,
      beestStatus: project.status,
    },
  };
}

const DIFF_FIELDS: { field: string; label: string; diffType: ProjectChange['diffType'] }[] = [
  { field: 'title', label: 'Title', diffType: 'text' },
  { field: 'description', label: 'Description', diffType: 'text' },
  { field: 'demoUrl', label: 'Demo URL', diffType: 'url' },
  { field: 'codeUrl', label: 'Code URL', diffType: 'url' },
  { field: 'screenshotUrl', label: 'Screenshot', diffType: 'image' },
];

type Snapshot = NonNullable<Submission['projectSnapshot']>;

/** Changed protocol fields between two adjacent ship snapshots. */
export function diffSnapshots(
  prev: Snapshot | null | undefined,
  curr: Snapshot | null | undefined,
): ProjectChange[] {
  if (!prev || !curr) return [];
  const changes: ProjectChange[] = [];
  for (const { field, label, diffType } of DIFF_FIELDS) {
    const oldValue = (prev as Record<string, string | null>)[field] ?? '';
    const newValue = (curr as Record<string, string | null>)[field] ?? '';
    if (oldValue !== newValue) {
      changes.push({ field, label, oldValue, newValue, diffType });
    }
  }
  return changes;
}

/** Before 2026-07-09 the second-pass return flow overwrote the author's
 * reviewerNote with the returning admin's feedback under this prefix (it is
 * recorded as an internal comment now). A handful of production rows still
 * carry it — surface those as reviewer feedback, not as an author note. */
const LEGACY_RETURN_PREFIX = '[Returned by second-pass review]';

/** The submitter-provided texts shown on a ship's timeline event. */
export function shipDisplayFields(submission: Submission): ShipDisplayField[] {
  const fields: ShipDisplayField[] = [];
  if (submission.changeDescription) {
    fields.push({ label: 'What changed', value: submission.changeDescription });
  }
  if (submission.reviewerNote) {
    const legacyReturn = submission.reviewerNote.startsWith(LEGACY_RETURN_PREFIX);
    fields.push({
      label: legacyReturn ? 'Second-pass return feedback' : 'Note to reviewer',
      value: legacyReturn
        ? submission.reviewerNote.slice(LEGACY_RETURN_PREFIX.length).trim()
        : submission.reviewerNote,
      isInternal: true,
    });
  }
  return fields;
}

export function toSidekickShopItem(item: ShopItem): SidekickShopItem {
  return {
    id: item.id,
    name: item.name,
    description: item.description || undefined,
    fulfillerContext: item.fulfillerContext ?? undefined,
    thumbnailUrl: item.imageUrl || undefined,
    // Beest's shop currency is Pipes (1 Pipe ≈ 1 approved hour), not USD.
    unitPrice: item.priceHours,
    metadata: {
      stock: item.stock,
      isActive: item.isActive,
      isFeatured: item.isFeatured,
      sortOrder: item.sortOrder,
      estimatedShip: item.estimatedShip,
      detailedDescription: item.detailedDescription,
    },
  };
}

/** `order.user` must be loaded. */
export function toSidekickOrder(order: Order, latestUserNote: string | null): SidekickOrder {
  return {
    id: order.id,
    userId: actorIdFor(order.user),
    userName: order.user?.nickname || order.user?.name || 'Unknown',
    userEmail: order.user?.email ?? '',
    // The FK is SET NULL when a shop item is deleted, but the protocol
    // requires itemId — metadata.itemName keeps such orders identifiable.
    itemId: order.shopItemId ?? '',
    quantity: order.quantity,
    totalPrice: order.pipesSpent,
    status: (order.status as SidekickOrderStatus) ?? 'pending',
    reference: order.reference ?? undefined,
    adminNotes: order.adminNotes ?? undefined,
    userNotes: latestUserNote ?? undefined,
    createdAt: new Date(order.createdAt).toISOString(),
    // Beest has no dedicated fulfilled_at column; updatedAt is the closest
    // approximation (any later write to the row shifts it).
    fulfilledAt:
      order.status === 'fulfilled' ? new Date(order.updatedAt).toISOString() : undefined,
    metadata: {
      itemName: order.itemName,
      fulfillmentNotes: order.fulfillmentNotes,
      hcbCardGrantId: order.hcbCardGrantId,
    },
  };
}

// ---------------------------------------------------------------------------
// Pagination cursors — opaque base64url of { o: offset, f: filter/sort echo }.
// The echo pins a cursor to the query it was minted for, so a client can't
// combine a stale cursor with different filters and silently skip rows.
// ---------------------------------------------------------------------------

export function encodeCursor(offset: number, filterEcho: string): string {
  return Buffer.from(JSON.stringify({ o: offset, f: filterEcho })).toString('base64url');
}

export function decodeCursor(cursor: string, expectedFilterEcho: string): number {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new BadRequestException({
      error: 'VALIDATION_ERROR',
      message: 'Malformed pagination cursor.',
    });
  }
  const obj = parsed as { o?: unknown; f?: unknown };
  if (
    typeof obj !== 'object' ||
    obj === null ||
    typeof obj.o !== 'number' ||
    !Number.isInteger(obj.o) ||
    obj.o < 0 ||
    obj.f !== expectedFilterEcho
  ) {
    throw new BadRequestException({
      error: 'VALIDATION_ERROR',
      message: 'Pagination cursor does not match the requested filters.',
    });
  }
  return obj.o;
}

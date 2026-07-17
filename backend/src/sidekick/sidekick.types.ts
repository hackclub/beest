// Types for the Sidekick master-endpoint protocol, mirrored from
// sidekick/src/lib/server/protocol/types.ts (and docs/PROTOCOL.md) so the
// service is compile-checked against what Sidekick actually sends/expects.
// Keep in sync when the protocol evolves.

// A short, colored label surfacing an attribute of a project in the reviewer's
// queue (renders as a GitHub-style pill). `color` is an optional hex string
// (`#rrggbb` or `#rgb`); omit for neutral gray. Empty labels are dropped by
// Sidekick. The same tags must be returned on FETCH_PROJECTS,
// FETCH_PROJECT_DETAIL, and FETCH_AUTHOR_PROJECTS for a given project.
export interface SidekickTag {
  label: string;
  color?: string;
}

export interface SidekickProject {
  id: string;
  title: string;
  description: string;
  demoUrl?: string;
  codeUrl: string;
  screenshotUrl?: string;
  authorId: string; // Slack ID ("U...") or HCA ID ("ident!...")
  hackatimeId?: string;
  hackatimeProjectKeys: string[];
  // ISO date (YYYY-MM-DD). Sidekick only counts Hackatime activity on or after
  // this date when aggregating hours — Beest sends the event start so pre-event
  // time on reused Hackatime projects doesn't inflate Sidekick's totals.
  hackatimeStartDate?: string;
  ships: SidekickShip[];
  tags?: SidekickTag[];
  metadata?: Record<string, unknown>;
}

export interface ReviewFieldDefinition {
  name: string;
  label: string;
  // 'markdown' = 'string' on the wire, rendered as a Markdown textarea.
  type: 'string' | 'integer' | 'boolean' | 'markdown';
  required?: boolean;
  placeholder?: string;
  defaultValue?: string | number | boolean;
}

export type ReviewFieldValues = Record<string, string | number | boolean>;

export type SidekickShipStatus = 'pending' | 'pending_hq' | 'approved' | 'rejected';

export interface SidekickShip {
  id: string;
  hoursSubmitted: number;
  submittedAt: string; // ISO 8601
  status: SidekickShipStatus;
  approveFields?: ReviewFieldDefinition[];
  rejectFields?: ReviewFieldDefinition[];
  // Advertises that approvals of this ship accept `rewardedHoursOverride` —
  // the hours actually rewarded to the author (Beest: overrideHours → pipes)
  // when they differ from the canonical `hoursAssigned` (Beest: internalHours
  // → Airtable Unified YSWS DB).
  supportsRewardedOverride?: boolean;
}

export interface ProjectChange {
  field: string;
  label: string;
  oldValue: string;
  newValue: string;
  diffType: 'text' | 'url' | 'image';
}

export interface ShipDisplayField {
  label: string;
  value: string;
  isInternal?: boolean;
}

export type TimelineEvent =
  | {
      type: 'ship';
      shipId: string;
      actorId: string;
      hoursSubmitted: number;
      changes?: ProjectChange[];
      displayFields?: ShipDisplayField[];
      timestamp: string;
    }
  | {
      type: 'approval';
      shipId: string;
      actorId: string;
      hoursAssigned: number;
      hoursDeflated?: number;
      rewardedHoursOverride?: number;
      feedbackMessage: string;
      justification: string;
      fields?: ReviewFieldValues;
      timestamp: string;
    }
  | {
      // An approval that was discarded before finalizing — e.g. returned to
      // the first-review queue by second-pass review. `actorId` is the
      // original reviewer; `discardedByActorId` is who discarded it.
      type: 'discarded_approval';
      id: string;
      shipId: string;
      actorId: string;
      discardedByActorId: string;
      hoursAssigned: number;
      rewardedHoursOverride?: number;
      feedbackMessage: string;
      justification: string;
      fields?: ReviewFieldValues;
      timestamp: string;
    }
  | {
      type: 'rejection';
      shipId: string;
      actorId: string;
      feedbackMessage: string;
      internalMessage?: string;
      fields?: ReviewFieldValues;
      timestamp: string;
    }
  | {
      type: 'comment';
      actorId: string;
      message: string;
      isInternal: boolean;
      timestamp: string;
    };

export interface SidekickShopItem {
  id: string;
  name: string;
  description?: string;
  fulfillerContext?: string;
  thumbnailUrl?: string;
  unitPrice?: number;
  metadata?: Record<string, unknown>;
}

export type SidekickOrderStatus = 'pending' | 'fulfilled' | 'cancelled';

export interface SidekickOrder {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userAvatarUrl?: string;
  itemId: string;
  quantity: number;
  totalPrice?: number;
  status: SidekickOrderStatus;
  reference?: string;
  adminNotes?: string;
  userNotes?: string;
  createdAt: string; // ISO 8601
  fulfilledAt?: string; // ISO 8601
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Action inputs
// ---------------------------------------------------------------------------

export interface FetchProjectsInput {
  status?: SidekickShipStatus | 'all';
  cursor?: string;
  limit?: number;
}

// Optional protocol action — powers Sidekick's "Other projects" section.
export interface FetchAuthorProjectsInput {
  authorId: string; // Slack ID ("U...") or HCA ID ("ident!...")
  excludeProjectId?: string; // usually the project currently under review
}

// Optional action pair — the per-user reviewer note on Sidekick's user card.
// Implementing them advertises support. Notes are per-USER (Beest:
// users.reviewer_user_note), not per-review.
export interface FetchUserNoteInput {
  userId: string; // Slack ID ("U...") or HCA ID ("ident!...")
}

export interface UpdateUserNoteInput {
  userId: string; // Slack ID ("U...") or HCA ID ("ident!...")
  note: string | null; // whole-note replacement; null/empty clears it
  editorId: string; // actor ID of the reviewer making the edit
}

export type SubmitReviewActionInput = {
  shipId: string;
  reviewerId: string;
} & (
  | {
      action: 'approve';
      hoursAssigned: number;
      // Only sent when the ship advertises `supportsRewardedOverride` and the
      // reviewer filled it in.
      rewardedHoursOverride?: number;
      feedbackMessage: string;
      justification: string;
      isHq: boolean;
      fields?: ReviewFieldValues;
    }
  | {
      action: 'reject';
      feedbackMessage: string;
      internalMessage?: string;
      isHq: boolean;
      fields?: ReviewFieldValues;
    }
  | {
      action: 'authorize';
      hoursAssigned?: number;
      rewardedHoursOverride?: number; // carried over from the original approval, if any
      justification?: string;
    }
  | {
      action: 'deauthorize';
      message?: string;
    }
  | {
      action: 'comment';
      commentText: string;
    }
  | {
      action: 'internal_comment';
      commentText: string;
    }
);

export type UpdateReviewActionInput = {
  shipId: string;
  reviewerId: string;
} & (
  | {
      type: 'approval';
      feedbackMessage: string;
      justification: string;
      // Honored only while the ship is pending_hq (nothing has paid out yet);
      // hour edits on finalized approvals are rejected — those must route
      // through changes_needed → re-approve, which handles pipes clawback.
      hoursAssigned?: number;
      fields?: ReviewFieldValues;
    }
  | {
      type: 'rejection';
      feedbackMessage: string;
      internalMessage?: string;
      fields?: ReviewFieldValues;
    }
);

export interface FetchOrdersInput {
  status?: SidekickOrderStatus | 'all';
  filterItemId?: string;
  cursor?: string;
  limit?: number;
  searchUser?: string;
  sortBy?: 'id' | 'user' | 'item' | 'quantity' | 'date' | 'status';
  sortOrder?: 'asc' | 'desc';
}

export interface UpdateOrderStatusInput {
  orderId: string;
  newStatus: SidekickOrderStatus;
  reference?: string;
}

export interface UpdateOrderFieldsInput {
  orderId: string;
  reference?: string;
  adminNotes?: string;
  userNotes?: string;
}

export interface UpdateItemFieldsInput {
  itemId: string;
  fulfillerContext?: string;
}

// ---------------------------------------------------------------------------
// Action outputs
// ---------------------------------------------------------------------------

export interface FetchProjectsOutput {
  projects: SidekickProject[];
  nextCursor?: string;
  totalCount: number;
  // When true, Sidekick renders projects in the exact order received and does
  // not re-sort. Must be set consistently across every page of a status query.
  explicitlySorted?: boolean;
}

export interface FetchProjectTimelineOutput {
  events: TimelineEvent[];
}

export interface FetchAuthorProjectsOutput {
  projects: SidekickProject[];
}

export interface FetchUserNoteOutput {
  note: string | null;
}

export interface SubmitReviewActionOutput {
  success: boolean;
  event: TimelineEvent;
}

export interface FetchOrdersOutput {
  orders: SidekickOrder[];
  items: Record<string, SidekickShopItem>;
  nextCursor?: string;
  totalCount: number;
}

export interface RevealOrderAddressOutput {
  firstName: string;
  lastName: string;
  line1: string;
  line2?: string;
  city: string;
  stateProvince?: string;
  postalCode: string;
  country: string;
  phoneNumber?: string;
}

export interface GetProgramStatsOutput {
  pendingReviewCount: number;
  pendingHqCount: number;
  pendingFulfillmentCount: number;
}

export const SIDEKICK_ACTIONS = [
  'HEALTH_CHECK',
  'GET_PROGRAM_STATS',
  'FETCH_PROJECTS',
  'FETCH_PROJECT_DETAIL',
  'FETCH_PROJECT_TIMELINE',
  'FETCH_AUTHOR_PROJECTS',
  'FETCH_USER_NOTE',
  'UPDATE_USER_NOTE',
  'SUBMIT_REVIEW_ACTION',
  'UPDATE_REVIEW_ACTION',
  'FETCH_SHOP_ITEMS',
  'FETCH_ORDERS',
  'FETCH_ORDER_DETAIL',
  'REVEAL_ORDER_ADDRESS',
  'UPDATE_ORDER_STATUS',
  'UPDATE_ORDER_FIELDS',
  'UPDATE_ITEM_FIELDS',
] as const;

export type SidekickAction = (typeof SIDEKICK_ACTIONS)[number];

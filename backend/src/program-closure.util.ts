/**
 * BEEST has ended. Nothing new enters the review queue: project creation is
 * closed outright, and shipping / resubmitting is closed by default.
 *
 * Two narrow exceptions survive:
 *
 *  1. A project a reviewer sent back as `changes_needed` gets exactly
 *     CHANGES_NEEDED_GRACE_MS from the moment the changes were requested
 *     (`projects.changes_requested_at`) to be fixed and reshipped. After that
 *     the window is gone and the project is effectively final.
 *
 *  2. An admin can grant one user SUBMISSION_EXTENSION_DAYS of normal shipping
 *     via `users.submission_extension_until`. That covers shipping drafts and
 *     resubmitting updates; creating brand-new projects stays closed even for
 *     them.
 *
 * A hard reject (`rejected`) is untouched by all of this — it was already
 * terminal (see the status-transition guard in ProjectsService.update) and gets
 * no grace window.
 *
 * Everything else about the site keeps working: users still log in, still hold
 * pipes, and still spend them in the shop.
 */

/** Master switch. Flip to false to reopen the program wholesale. */
export const PROGRAM_CLOSED = true;

/** Exactly 2 days to act on requested changes before resubmission closes. */
export const CHANGES_NEEDED_GRACE_MS = 2 * 24 * 60 * 60 * 1000;

/** Length of the admin-granted per-user shipping extension. */
export const SUBMISSION_EXTENSION_DAYS = 14;
export const SUBMISSION_EXTENSION_MS =
  SUBMISSION_EXTENSION_DAYS * 24 * 60 * 60 * 1000;

export const PROGRAM_CLOSED_CREATE_MESSAGE =
  'BEEST has ended — new projects can no longer be created.';

export const PROGRAM_CLOSED_SHIP_MESSAGE =
  'BEEST has ended — projects can no longer be shipped for review.';

export const CHANGES_WINDOW_EXPIRED_MESSAGE =
  'BEEST has ended. The 2-day window to make the requested changes and resubmit this project has closed.';

/** True while an admin-granted shipping extension is still running. */
export function hasActiveSubmissionExtension(
  submissionExtensionUntil: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!submissionExtensionUntil) return false;
  const until = new Date(submissionExtensionUntil).getTime();
  return Number.isFinite(until) && until > now.getTime();
}

/**
 * Resubmission deadline for a project a reviewer sent back, or null when the
 * project isn't in `changes_needed` (so no window applies to it at all).
 */
export function changesNeededDeadline(project: {
  status: string;
  changesRequestedAt: Date | string | null;
}): Date | null {
  if (project.status !== 'changes_needed' || !project.changesRequestedAt) {
    return null;
  }
  const requestedAt = new Date(project.changesRequestedAt).getTime();
  if (!Number.isFinite(requestedAt)) return null;
  return new Date(requestedAt + CHANGES_NEEDED_GRACE_MS);
}

/** True while a `changes_needed` project is still inside its 2-day window. */
export function isWithinChangesWindow(
  project: { status: string; changesRequestedAt: Date | string | null },
  now: Date = new Date(),
): boolean {
  const deadline = changesNeededDeadline(project);
  return deadline !== null && deadline.getTime() > now.getTime();
}

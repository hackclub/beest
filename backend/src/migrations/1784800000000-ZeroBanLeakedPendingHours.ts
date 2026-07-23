import { MigrationInterface, QueryRunner } from 'typeorm';

export class ZeroBanLeakedPendingHours1784800000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    // Repair projects whose pending first-pass approval hours leaked when
    // the author was banned: banUser kicked 'fraud_pending' projects to
    // 'changes_needed' without reverting the not-yet-paid-out hours delta
    // that reviewProject had already added. After an unban + resubmit, the
    // stale override_hours starve the Hackatime cap check ("Cannot approve
    // Xh of new work — Hackatime shows only Yh of new time since last
    // approval") even though nothing was ever paid out.
    //
    // Invariant restored here: an unreviewed/changes_needed project with no
    // pipes granted has no standing approval, so its approved-hours
    // counters must be zero. Projects with pipes_granted > 0 keep their
    // hours — those reflect a prior approval that still stands.
    await q.query(`
            UPDATE "projects"
            SET "override_hours" = 0, "internal_hours" = 0
            WHERE "status" IN ('unreviewed', 'changes_needed')
              AND COALESCE("pipes_granted", 0) = 0
              AND COALESCE("override_hours", 0) > 0
        `);
  }

  async down(): Promise<void> {
    // Data repair — not reversible.
  }
}

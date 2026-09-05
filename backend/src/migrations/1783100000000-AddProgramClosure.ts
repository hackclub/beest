import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * BEEST has ended. Two columns back the wind-down (see program-closure.util.ts):
 *
 *  - projects.changes_requested_at — when a reviewer last asked for changes.
 *    Starts the 2-day window in which the builder may still resubmit.
 *  - users.submission_extension_until — admin-granted per-user reprieve that
 *    restores normal shipping for a fortnight.
 *
 * Backfill: every project sitting in 'changes_needed' right now is stamped with
 * the migration time, not its original review date. Those builders were told
 * nothing about a deadline, so measuring from the old review would silently
 * expire most of them on deploy; this gives everyone the same fresh 2 days.
 */
export class AddProgramClosure1783100000000 implements MigrationInterface {
    async up(q: QueryRunner): Promise<void> {
        await q.query(`ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "changes_requested_at" timestamptz`);
        await q.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "submission_extension_until" timestamptz`);
        await q.query(`
            UPDATE "projects"
            SET "changes_requested_at" = NOW()
            WHERE "status" = 'changes_needed' AND "changes_requested_at" IS NULL
        `);
    }

    async down(q: QueryRunner): Promise<void> {
        await q.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "submission_extension_until"`);
        await q.query(`ALTER TABLE "projects" DROP COLUMN IF EXISTS "changes_requested_at"`);
    }
}

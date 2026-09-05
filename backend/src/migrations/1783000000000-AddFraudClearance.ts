import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Fraud clearance is a review axis independent of the functional
 * review/approval flow. A Fraud Reviewer can mark a project "not fraud"
 * (cleared) without touching its `status`, or ban the maker. Cleared projects
 * drop out of the fraud queue; the clearance metadata is kept for the audit
 * trail and to surface the verdict to functional reviewers.
 */
export class AddFraudClearance1783000000000 implements MigrationInterface {
    async up(q: QueryRunner): Promise<void> {
        await q.query(`ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "fraud_cleared" boolean NOT NULL DEFAULT false`);
        await q.query(`ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "fraud_cleared_by_id" uuid`);
        await q.query(`ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "fraud_cleared_by_name" varchar(255)`);
        await q.query(`ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "fraud_cleared_at" timestamptz`);
        await q.query(`ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "fraud_clearance_note" text`);
    }

    async down(q: QueryRunner): Promise<void> {
        await q.query(`ALTER TABLE "projects" DROP COLUMN IF EXISTS "fraud_clearance_note"`);
        await q.query(`ALTER TABLE "projects" DROP COLUMN IF EXISTS "fraud_cleared_at"`);
        await q.query(`ALTER TABLE "projects" DROP COLUMN IF EXISTS "fraud_cleared_by_name"`);
        await q.query(`ALTER TABLE "projects" DROP COLUMN IF EXISTS "fraud_cleared_by_id"`);
        await q.query(`ALTER TABLE "projects" DROP COLUMN IF EXISTS "fraud_cleared"`);
    }
}

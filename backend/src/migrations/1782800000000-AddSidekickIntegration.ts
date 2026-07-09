import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSidekickIntegration1782800000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    // Hackatime hours + project field values captured at ship time, so the
    // Sidekick timeline can show claimed hours and old→new diffs per ship.
    await q.query(`ALTER TABLE "submissions" ADD COLUMN "hours_snapshot" real`);
    await q.query(`ALTER TABLE "submissions" ADD COLUMN "project_snapshot" jsonb`);
    // Reviewer-only comments written from Sidekick.
    await q.query(`ALTER TABLE "comments" ADD COLUMN "is_internal" boolean NOT NULL DEFAULT false`);
    // Fulfiller-editable order fields surfaced in Sidekick.
    await q.query(`ALTER TABLE "orders" ADD COLUMN "reference" varchar(500)`);
    await q.query(`ALTER TABLE "orders" ADD COLUMN "admin_notes" text`);
    // Staff-facing fulfillment instructions, shared across all orders of an item.
    await q.query(`ALTER TABLE "shop_items" ADD COLUMN "fulfiller_context" text`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "submissions" DROP COLUMN IF EXISTS "hours_snapshot"`);
    await q.query(`ALTER TABLE "submissions" DROP COLUMN IF EXISTS "project_snapshot"`);
    await q.query(`ALTER TABLE "comments" DROP COLUMN IF EXISTS "is_internal"`);
    await q.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "reference"`);
    await q.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "admin_notes"`);
    await q.query(`ALTER TABLE "shop_items" DROP COLUMN IF EXISTS "fulfiller_context"`);
  }
}

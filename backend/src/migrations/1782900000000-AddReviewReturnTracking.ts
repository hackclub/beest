import { MigrationInterface, QueryRunner } from "typeorm";

export class AddReviewReturnTracking1782900000000 implements MigrationInterface {
    async up(q: QueryRunner): Promise<void> {
        await q.query(`ALTER TABLE "project_reviews" ADD COLUMN IF NOT EXISTS "returned_by_id" uuid`);
    }

    async down(q: QueryRunner): Promise<void> {
        await q.query(`ALTER TABLE "project_reviews" DROP COLUMN IF EXISTS "returned_by_id"`);
    }
}

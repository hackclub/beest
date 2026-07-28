import { MigrationInterface, QueryRunner } from "typeorm";

export class AddReviewGolden1785000000000 implements MigrationInterface {
    async up(q: QueryRunner): Promise<void> {
        await q.query(`ALTER TABLE "project_reviews" ADD COLUMN IF NOT EXISTS "golden" boolean`);
    }

    async down(q: QueryRunner): Promise<void> {
        await q.query(`ALTER TABLE "project_reviews" DROP COLUMN IF EXISTS "golden"`);
    }
}

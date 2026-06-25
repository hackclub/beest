import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReviewDrafts1779600000000 implements MigrationInterface {
  name = 'AddReviewDrafts1779600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "review_drafts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "project_id" uuid NOT NULL,
        "reviewer_id" uuid NOT NULL,
        "reviewer_name" varchar,
        "justification" text,
        "feedback" text,
        "internal_note" text,
        "user_note" text,
        "hide_reviewer_name" boolean NOT NULL DEFAULT false,
        "override_hours" real,
        "internal_hours" real,
        "quick_reject_reason" varchar,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_review_drafts" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_review_drafts_project_id" ON "review_drafts" ("project_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "UQ_review_drafts_project_id"`);
    await queryRunner.query(`DROP TABLE "review_drafts"`);
  }
}

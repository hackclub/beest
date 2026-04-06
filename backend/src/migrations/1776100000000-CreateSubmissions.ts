import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateSubmissions1776100000000 implements MigrationInterface {
    name = 'CreateSubmissions1776100000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "submissions" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "project_id" uuid NOT NULL,
                "user_id" uuid NOT NULL,
                "change_description" text,
                "min_hours_confirmed" boolean NOT NULL DEFAULT false,
                "status" varchar(20) NOT NULL DEFAULT 'unreviewed',
                "override_hours" real,
                "internal_hours" real,
                "pipes_granted" integer NOT NULL DEFAULT 0,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_submissions" PRIMARY KEY ("id"),
                CONSTRAINT "FK_submissions_project" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_submissions_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
            )
        `);
        await queryRunner.query(`CREATE INDEX "IDX_submissions_project_id" ON "submissions"("project_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_submissions_status" ON "submissions"("status")`);

        // Link project_reviews to submissions instead of directly to projects
        await queryRunner.query(`ALTER TABLE "project_reviews" ADD "submission_id" uuid`);
        await queryRunner.query(`ALTER TABLE "project_reviews" ADD CONSTRAINT "FK_project_reviews_submission" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "project_reviews" DROP CONSTRAINT "FK_project_reviews_submission"`);
        await queryRunner.query(`ALTER TABLE "project_reviews" DROP COLUMN "submission_id"`);
        await queryRunner.query(`DROP TABLE "submissions"`);
    }
}

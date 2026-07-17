import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProjectIsGolden1783000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "projects" ADD COLUMN "is_golden" boolean NOT NULL DEFAULT false`,
    );
    // Fast "author has a golden project" EXISTS checks (queue priority, black
    // market eligibility) — partial index keeps it tiny.
    await queryRunner.query(
      `CREATE INDEX "idx_projects_user_golden" ON "projects" ("user_id") WHERE "is_golden" = true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_projects_user_golden"`);
    await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN "is_golden"`);
  }
}

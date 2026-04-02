import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddForeignKeyIndexes1743552001000 implements MigrationInterface {
  name = 'AddForeignKeyIndexes1743552001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_sessions_user_id" ON "sessions" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_projects_user_id" ON "projects" ("user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_projects_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_sessions_user_id"`);
  }
}

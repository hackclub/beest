import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDevlogToLookoutSessions1779700000000
  implements MigrationInterface
{
  name = 'AddDevlogToLookoutSessions1779700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "lookout_sessions" ADD COLUMN "devlog_id" uuid`,
    );
    await queryRunner.query(`
      ALTER TABLE "lookout_sessions"
      ADD CONSTRAINT "FK_lookout_sessions_devlog" FOREIGN KEY ("devlog_id")
        REFERENCES "devlogs"("id") ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    // One Lookout session per devlog (multiple unattached sessions allowed).
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_lookout_sessions_devlog"
        ON "lookout_sessions" ("devlog_id") WHERE "devlog_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "UQ_lookout_sessions_devlog"`);
    await queryRunner.query(
      `ALTER TABLE "lookout_sessions" DROP CONSTRAINT "FK_lookout_sessions_devlog"`,
    );
    await queryRunner.query(
      `ALTER TABLE "lookout_sessions" DROP COLUMN "devlog_id"`,
    );
  }
}

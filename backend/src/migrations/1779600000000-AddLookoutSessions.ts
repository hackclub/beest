import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLookoutSessions1779600000000 implements MigrationInterface {
  name = 'AddLookoutSessions1779600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "lookout_sessions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "project_id" uuid NOT NULL,
        "user_id" character varying NOT NULL,
        "lookout_session_id" character varying NOT NULL,
        "token" character varying NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_lookout_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_lookout_sessions_project" FOREIGN KEY ("project_id")
          REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_lookout_sessions_project" ON "lookout_sessions" ("project_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_lookout_sessions_project"`);
    await queryRunner.query(`DROP TABLE "lookout_sessions"`);
  }
}

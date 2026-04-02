import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1743552000000 implements MigrationInterface {
  name = 'InitialSchema1743552000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // — users —
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id"              uuid DEFAULT gen_random_uuid() NOT NULL,
        "hca_sub"         varchar NOT NULL,
        "email"           text NOT NULL,
        "name"            varchar,
        "nickname"        varchar,
        "slack_id"        varchar,
        "hackatime_token" text,
        "created_at"      TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"      TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_users_hca_sub" UNIQUE ("hca_sub")
      )
    `);

    // — sessions —
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sessions" (
        "id"                 uuid DEFAULT gen_random_uuid() NOT NULL,
        "user_id"            uuid NOT NULL,
        "refresh_token_hash" varchar NOT NULL,
        "expires_at"         TIMESTAMP NOT NULL,
        "created_at"         TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_sessions_refresh_token_hash" UNIQUE ("refresh_token_hash"),
        CONSTRAINT "FK_sessions_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    // — projects —
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "projects" (
        "id"                      uuid DEFAULT gen_random_uuid() NOT NULL,
        "user_id"                 uuid NOT NULL,
        "name"                    varchar(50) NOT NULL,
        "description"             varchar(300) NOT NULL,
        "project_type"            varchar(20) NOT NULL,
        "code_url"                varchar(2048),
        "readme_url"              varchar(2048),
        "demo_url"                varchar(2048),
        "screenshot_1_url"        varchar(2048),
        "screenshot_2_url"        varchar(2048),
        "hackatime_project_name"  varchar(255),
        "created_at"              TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"              TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_projects" PRIMARY KEY ("id"),
        CONSTRAINT "FK_projects_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "projects"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sessions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAppSettings1785300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "app_settings" (
        "key" varchar PRIMARY KEY,
        "bool_value" boolean NOT NULL DEFAULT false,
        "updated_at" timestamptz,
        "updated_by" uuid
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "app_settings"`);
  }
}

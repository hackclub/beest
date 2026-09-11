import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLookoutSessionCdnUrl1785600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "lookout_sessions" ADD COLUMN "cdn_url" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "lookout_sessions" DROP COLUMN "cdn_url"`);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserShopClosingNotified1785800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "shop_closing_notified_at" TIMESTAMPTZ`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "shop_closing_notified_at"`);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddShopItemGrantFields1785200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "shop_items" ADD COLUMN "is_grant" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "shop_items" ADD COLUMN "grant_instructions" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "shop_items" DROP COLUMN "grant_instructions"`);
    await queryRunner.query(`ALTER TABLE "shop_items" DROP COLUMN "is_grant"`);
  }
}

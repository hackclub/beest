import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddShopItemBlackMarket1783100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "shop_items" ADD COLUMN "is_black_market" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "shop_items" DROP COLUMN "is_black_market"`);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddShopItemSuperFeatured1783300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "shop_items" ADD COLUMN "is_super_featured" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "shop_items" DROP COLUMN "is_super_featured"`);
  }
}

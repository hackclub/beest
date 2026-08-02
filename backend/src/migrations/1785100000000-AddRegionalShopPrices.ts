import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRegionalShopPrices1785100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "country" character varying(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "shop_items" ADD COLUMN "regional_prices" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "shop_items" DROP COLUMN "regional_prices"`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "country"`);
  }
}

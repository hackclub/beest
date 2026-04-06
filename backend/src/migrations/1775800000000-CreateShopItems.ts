import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateShopItems1775800000000 implements MigrationInterface {
    name = 'CreateShopItems1775800000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "shop_items" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" varchar(200) NOT NULL,
                "description" varchar(500) NOT NULL,
                "image_url" varchar(500) NOT NULL,
                "price_hours" integer NOT NULL,
                "stock" integer,
                "sort_order" integer NOT NULL DEFAULT 0,
                "is_active" boolean NOT NULL DEFAULT true,
                "estimated_ship" varchar(200),
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_shop_items" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`CREATE INDEX "IDX_shop_items_sort_order" ON "shop_items"("sort_order")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "shop_items"`);
    }
}

import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateOrdersAndFulfillment1776000000000 implements MigrationInterface {
    name = 'CreateOrdersAndFulfillment1776000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add pipes column to users
        await queryRunner.query(`ALTER TABLE "users" ADD "pipes" integer NOT NULL DEFAULT 0`);

        // Add pipes_granted to projects (tracks how many pipes were already granted to prevent double-granting)
        await queryRunner.query(`ALTER TABLE "projects" ADD "pipes_granted" integer NOT NULL DEFAULT 0`);

        // Create orders table
        await queryRunner.query(`
            CREATE TABLE "orders" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "user_id" uuid NOT NULL,
                "shop_item_id" uuid,
                "quantity" integer NOT NULL,
                "pipes_spent" integer NOT NULL,
                "item_name" varchar(200) NOT NULL,
                "status" varchar(20) NOT NULL DEFAULT 'pending',
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_orders" PRIMARY KEY ("id"),
                CONSTRAINT "FK_orders_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_orders_shop_item" FOREIGN KEY ("shop_item_id") REFERENCES "shop_items"("id") ON DELETE SET NULL
            )
        `);
        await queryRunner.query(`CREATE INDEX "IDX_orders_user_id" ON "orders"("user_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_orders_status" ON "orders"("status")`);
        await queryRunner.query(`CREATE INDEX "IDX_orders_created_at" ON "orders"("created_at")`);

        // Create fulfillment_updates table
        await queryRunner.query(`
            CREATE TABLE "fulfillment_updates" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "user_id" uuid NOT NULL,
                "order_id" uuid NOT NULL,
                "message" varchar(500) NOT NULL,
                "is_read" boolean NOT NULL DEFAULT false,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_fulfillment_updates" PRIMARY KEY ("id"),
                CONSTRAINT "FK_fulfillment_updates_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_fulfillment_updates_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE
            )
        `);
        await queryRunner.query(`CREATE INDEX "IDX_fulfillment_updates_user_id" ON "fulfillment_updates"("user_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_fulfillment_updates_user_read" ON "fulfillment_updates"("user_id", "is_read")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "fulfillment_updates"`);
        await queryRunner.query(`DROP TABLE "orders"`);
        await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN "pipes_granted"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "pipes"`);
    }
}

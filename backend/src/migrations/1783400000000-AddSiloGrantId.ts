import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSiloGrantId1783400000000 implements MigrationInterface {
    name = 'AddSiloGrantId1783400000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "orders" ADD "silo_grant_id" varchar(64)`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_orders_silo_grant_id" ON "orders"("silo_grant_id") WHERE "silo_grant_id" IS NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "UQ_orders_silo_grant_id"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "silo_grant_id"`);
    }
}

import { MigrationInterface, QueryRunner } from "typeorm";

export class AddShippingEligibility1775900000000 implements MigrationInterface {
    name = 'AddShippingEligibility1775900000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "has_address" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "users" ADD "has_birthdate" boolean NOT NULL DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "has_birthdate"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "has_address"`);
    }

}

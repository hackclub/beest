import { MigrationInterface, QueryRunner } from "typeorm";

export class AddHcaTokens1776200000000 implements MigrationInterface {
    name = 'AddHcaTokens1776200000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "users" ADD "hca_access_token" text NULL`,
        );
        await queryRunner.query(
            `ALTER TABLE "users" ADD "hca_refresh_token" text NULL`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "users" DROP COLUMN "hca_refresh_token"`,
        );
        await queryRunner.query(
            `ALTER TABLE "users" DROP COLUMN "hca_access_token"`,
        );
    }
}

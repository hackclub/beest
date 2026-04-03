import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTwoEmails1775200000000 implements MigrationInterface {
    name = 'AddTwoEmails1775200000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "two_emails" boolean NOT NULL DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "two_emails"`);
    }

}

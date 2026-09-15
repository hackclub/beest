import { MigrationInterface, QueryRunner } from "typeorm";

export class AddGrantCertificateSupport1785500000000 implements MigrationInterface {
    name = 'AddGrantCertificateSupport1785500000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "certificates" ALTER COLUMN "order_id" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "certificates" ADD COLUMN "grant_value" integer`);
        await queryRunner.query(`ALTER TABLE "certificates" ADD COLUMN "is_grant" boolean NOT NULL DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "certificates" DROP COLUMN "is_grant"`);
        await queryRunner.query(`ALTER TABLE "certificates" DROP COLUMN "grant_value"`);
        await queryRunner.query(`ALTER TABLE "certificates" ALTER COLUMN "order_id" SET NOT NULL`);
    }
}

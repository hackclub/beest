import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProjectClaimColumns1779500000000 implements MigrationInterface {
    name = 'AddProjectClaimColumns1779500000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "projects" ADD "claimedByReviewerId" varchar`);
        await queryRunner.query(`ALTER TABLE "projects" ADD "claimedByReviewerName" varchar`);
        await queryRunner.query(`ALTER TABLE "projects" ADD "claimedAt" timestamptz`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN "claimedAt"`);
        await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN "claimedByReviewerName"`);
        await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN "claimedByReviewerId"`);
    }
}

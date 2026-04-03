import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAiUse1775300000000 implements MigrationInterface {
    name = 'AddAiUse1775300000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "projects" ADD "ai_use" varchar(1000)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN "ai_use"`);
    }
}

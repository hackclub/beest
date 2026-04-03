import { MigrationInterface, QueryRunner } from "typeorm";

export class ShrinkAiUse1775300001000 implements MigrationInterface {
    name = 'ShrinkAiUse1775300001000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "projects" ALTER COLUMN "ai_use" TYPE varchar(200)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "projects" ALTER COLUMN "ai_use" TYPE varchar(1000)`);
    }
}

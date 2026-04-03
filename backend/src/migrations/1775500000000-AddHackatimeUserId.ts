import { MigrationInterface, QueryRunner } from "typeorm";

export class AddHackatimeUserId1775500000000 implements MigrationInterface {
    name = 'AddHackatimeUserId1775500000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "users" ADD "hackatime_user_id" varchar NULL`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "users" DROP COLUMN "hackatime_user_id"`,
        );
    }
}

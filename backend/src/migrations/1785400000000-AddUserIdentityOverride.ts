import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserIdentityOverride1785400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "identity_override" varchar(20)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "identity_override_reason" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "identity_override_reason"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "identity_override"`,
    );
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGrantCertificateUniqueIndex1785600000000
  implements MigrationInterface
{
  name = 'AddGrantCertificateUniqueIndex1785600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_certificates_grant_user_award"
      ON "certificates" ("user_id", lower(btrim("award_item")))
      WHERE "is_grant" = true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "UQ_certificates_grant_user_award"`,
    );
  }
}

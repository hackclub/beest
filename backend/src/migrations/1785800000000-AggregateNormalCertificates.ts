import { MigrationInterface, QueryRunner } from 'typeorm';

export class AggregateNormalCertificates1785800000000
  implements MigrationInterface
{
  name = 'AggregateNormalCertificates1785800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Keep the newest normal certificate before enforcing one aggregate per user.
    await queryRunner.query(`
      DELETE FROM "certificates" older
      USING "certificates" newer
      WHERE older."is_grant" = false
        AND newer."is_grant" = false
        AND older."user_id" = newer."user_id"
      AND (
        older."created_at" < newer."created_at"
        OR (
          older."created_at" = newer."created_at"
          AND older.ctid < newer.ctid
        )
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_certificates_normal_user"
      ON "certificates" ("user_id")
      WHERE "is_grant" = false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "UQ_certificates_normal_user"`,
    );
  }
}

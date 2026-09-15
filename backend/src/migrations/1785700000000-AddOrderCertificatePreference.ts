import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrderCertificatePreference1785700000000 implements MigrationInterface {
  name = 'AddOrderCertificatePreference1785700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "orders" ADD COLUMN "certificate_requested" boolean');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "orders" DROP COLUMN "certificate_requested"');
  }
}

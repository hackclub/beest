import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateCertificates1785000000000 implements MigrationInterface {
    name = 'CreateCertificates1785000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "certificates" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "user_id" uuid NOT NULL,
                "order_id" uuid NOT NULL,
                "recipient_name" varchar(500) NOT NULL,
                "approved_hours" integer NOT NULL,
                "award_item" text NOT NULL,
                "certificate_number" varchar(64) NOT NULL UNIQUE,
                "certificate_text" text NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_certificates" PRIMARY KEY ("id"),
                CONSTRAINT "FK_certificates_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_certificates_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE,
                CONSTRAINT "UQ_certificates_order_id" UNIQUE ("order_id")
            )
        `);
        await queryRunner.query(`CREATE INDEX "IDX_certificates_user_id" ON "certificates"("user_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_certificates_order_id" ON "certificates"("order_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_certificates_created_at" ON "certificates"("created_at")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_certificates_created_at"`);
        await queryRunner.query(`DROP INDEX "IDX_certificates_order_id"`);
        await queryRunner.query(`DROP INDEX "IDX_certificates_user_id"`);
        await queryRunner.query(`DROP TABLE "certificates"`);
    }
}

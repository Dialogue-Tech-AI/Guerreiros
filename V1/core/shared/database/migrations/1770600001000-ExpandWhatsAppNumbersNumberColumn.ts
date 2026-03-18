import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Expands whatsapp_numbers.number from varchar(20) to varchar(80)
 * so official numbers can store "official_{phoneNumberId}_{uuidPrefix}" (e.g. ~40 chars).
 */
export class ExpandWhatsAppNumbersNumberColumn1770600001000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "whatsapp_numbers" ALTER COLUMN "number" TYPE varchar(80)`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "whatsapp_numbers" ALTER COLUMN "number" TYPE varchar(20)`
    );
  }
}

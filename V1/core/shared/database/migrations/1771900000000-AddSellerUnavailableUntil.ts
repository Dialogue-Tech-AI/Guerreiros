import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSellerUnavailableUntil1771900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE sellers
      ADD COLUMN IF NOT EXISTS unavailable_until TIMESTAMP NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE sellers
      DROP COLUMN IF EXISTS unavailable_until;
    `);
  }
}

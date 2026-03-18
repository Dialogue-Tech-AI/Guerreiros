import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUndefinedToWhatsAppNumberType1705344800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // TypeORM creates enum with name based on table and column: whatsapp_numbers_number_type_enum
    // Add 'UNDEFINED' to the enum
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum 
          WHERE enumlabel = 'UNDEFINED' 
          AND enumtypid = (
            SELECT oid FROM pg_type WHERE typname = 'whatsapp_numbers_number_type_enum'
          )
        ) THEN
          ALTER TYPE "whatsapp_numbers_number_type_enum" ADD VALUE 'UNDEFINED';
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Note: PostgreSQL doesn't support removing enum values directly
    // This would require recreating the enum, which is complex
    // For now, we'll leave it as is
    // In production, you might need to recreate the enum without UNDEFINED
  }
}

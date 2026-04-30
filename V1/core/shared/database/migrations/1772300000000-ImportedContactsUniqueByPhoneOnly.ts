import { MigrationInterface, QueryRunner, TableUnique } from 'typeorm';

export class ImportedContactsUniqueByPhoneOnly1772300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM imported_contacts ic
      WHERE ic.id NOT IN (
        SELECT sub.id FROM (
          SELECT DISTINCT ON (client_phone) id
          FROM imported_contacts
          ORDER BY client_phone, created_at DESC NULLS LAST, id DESC
        ) sub
      )
    `);

    await queryRunner.dropUniqueConstraint('imported_contacts', 'UQ_imported_contacts_phone_whatsapp');

    await queryRunner.query(`
      ALTER TABLE imported_contacts
      ALTER COLUMN whatsapp_number_id DROP NOT NULL
    `);

    await queryRunner.createUniqueConstraint(
      'imported_contacts',
      new TableUnique({
        name: 'UQ_imported_contacts_client_phone',
        columnNames: ['client_phone'],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropUniqueConstraint('imported_contacts', 'UQ_imported_contacts_client_phone');

    await queryRunner.query(`
      DELETE FROM imported_contacts WHERE whatsapp_number_id IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE imported_contacts
      ALTER COLUMN whatsapp_number_id SET NOT NULL
    `);

    await queryRunner.createUniqueConstraint(
      'imported_contacts',
      new TableUnique({
        name: 'UQ_imported_contacts_phone_whatsapp',
        columnNames: ['client_phone', 'whatsapp_number_id'],
      })
    );
  }
}

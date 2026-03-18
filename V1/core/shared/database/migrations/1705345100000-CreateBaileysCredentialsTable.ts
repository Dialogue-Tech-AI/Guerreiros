import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex, TableUnique } from 'typeorm';

export class CreateBaileysCredentialsTable1705345100000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'baileys_credentials',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'whatsapp_number_id',
            type: 'uuid',
          },
          {
            name: 'credential_key',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'credential_value',
            type: 'text',
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true
    );

    // Foreign key to whatsapp_numbers
    await queryRunner.createForeignKey(
      'baileys_credentials',
      new TableForeignKey({
        columnNames: ['whatsapp_number_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'whatsapp_numbers',
        onDelete: 'CASCADE',
      })
    );

    // Unique constraint: one credential key per whatsapp number
    await queryRunner.createUniqueConstraint(
      'baileys_credentials',
      new TableUnique({
        columnNames: ['whatsapp_number_id', 'credential_key'],
        name: 'UQ_baileys_credentials_number_key',
      })
    );

    // Index for fast queries
    await queryRunner.createIndex(
      'baileys_credentials',
      new TableIndex({
        name: 'IDX_baileys_credentials_whatsapp_number',
        columnNames: ['whatsapp_number_id'],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('baileys_credentials');
  }
}

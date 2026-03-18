import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateWhatsAppNumbersTable1705344300000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'whatsapp_numbers',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'number',
            type: 'varchar',
            length: '20',
            isUnique: true,
          },
          {
            name: 'adapter_type',
            type: 'enum',
            enum: ['OFFICIAL', 'UNOFFICIAL'],
          },
          {
            name: 'handled_by',
            type: 'enum',
            enum: ['AI', 'HUMAN'],
          },
          {
            name: 'number_type',
            type: 'enum',
            enum: ['PRIMARY', 'SECONDARY'],
          },
          {
            name: 'active',
            type: 'boolean',
            default: true,
          },
          {
            name: 'config',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'connection_status',
            type: 'enum',
            enum: ['CONNECTED', 'DISCONNECTED', 'ERROR'],
            default: "'DISCONNECTED'",
          },
          {
            name: 'last_check_at',
            type: 'timestamp',
            isNullable: true,
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

    // Create index on active numbers
    await queryRunner.query(
      `CREATE INDEX "IDX_whatsapp_numbers_active" ON "whatsapp_numbers" ("active")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('whatsapp_numbers');
  }
}

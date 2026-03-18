import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateMessagesTable1705344500000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'messages',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'attendance_id',
            type: 'uuid',
          },
          {
            name: 'origin',
            type: 'enum',
            enum: ['CLIENT', 'SYSTEM', 'SELLER', 'AI'],
          },
          {
            name: 'content',
            type: 'text',
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'sent_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true
    );

    // Foreign key to attendances
    await queryRunner.createForeignKey(
      'messages',
      new TableForeignKey({
        columnNames: ['attendance_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'attendances',
        onDelete: 'CASCADE',
      })
    );

    // Index on attendance_id for fast queries
    await queryRunner.createIndex(
      'messages',
      new TableIndex({
        name: 'IDX_messages_attendance',
        columnNames: ['attendance_id', 'sent_at'],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('messages');
  }
}

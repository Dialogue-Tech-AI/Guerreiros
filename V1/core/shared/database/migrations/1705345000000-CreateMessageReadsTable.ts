import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex, TableUnique } from 'typeorm';

export class CreateMessageReadsTable1705345000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'message_reads',
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
            name: 'user_id',
            type: 'uuid',
          },
          {
            name: 'last_read_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
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

    // Foreign key to attendances
    await queryRunner.createForeignKey(
      'message_reads',
      new TableForeignKey({
        columnNames: ['attendance_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'attendances',
        onDelete: 'CASCADE',
      })
    );

    // Foreign key to users
    await queryRunner.createForeignKey(
      'message_reads',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      })
    );

    // Unique constraint: one read record per user per attendance
    await queryRunner.createUniqueConstraint(
      'message_reads',
      new TableUnique({
        columnNames: ['attendance_id', 'user_id'],
        name: 'UQ_message_reads_attendance_user',
      })
    );

    // Index for fast queries
    await queryRunner.createIndex(
      'message_reads',
      new TableIndex({
        name: 'IDX_message_reads_attendance_user',
        columnNames: ['attendance_id', 'user_id'],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('message_reads');
  }
}

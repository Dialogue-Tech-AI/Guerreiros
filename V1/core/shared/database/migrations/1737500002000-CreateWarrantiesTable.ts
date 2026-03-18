import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateWarrantiesTable1737500002000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'warranties',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'purchase_id',
            type: 'uuid',
          },
          {
            name: 'attendance_id',
            type: 'uuid',
          },
          {
            name: 'start_date',
            type: 'timestamp',
          },
          {
            name: 'end_date',
            type: 'timestamp',
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
          },
          {
            name: 'claims_count',
            type: 'integer',
            default: 0,
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

    // Foreign keys
    await queryRunner.createForeignKey(
      'warranties',
      new TableForeignKey({
        columnNames: ['purchase_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'purchases',
        onDelete: 'CASCADE',
      })
    );

    await queryRunner.createForeignKey(
      'warranties',
      new TableForeignKey({
        columnNames: ['attendance_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'attendances',
        onDelete: 'CASCADE',
      })
    );

    // Indexes
    await queryRunner.createIndex(
      'warranties',
      new TableIndex({
        name: 'idx_warranty_purchase',
        columnNames: ['purchase_id'],
      })
    );

    await queryRunner.createIndex(
      'warranties',
      new TableIndex({
        name: 'idx_warranty_attendance',
        columnNames: ['attendance_id'],
      })
    );

    await queryRunner.createIndex(
      'warranties',
      new TableIndex({
        name: 'idx_warranty_active',
        columnNames: ['is_active'],
      })
    );

    await queryRunner.createIndex(
      'warranties',
      new TableIndex({
        name: 'idx_warranty_end_date',
        columnNames: ['end_date'],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('warranties');
  }
}

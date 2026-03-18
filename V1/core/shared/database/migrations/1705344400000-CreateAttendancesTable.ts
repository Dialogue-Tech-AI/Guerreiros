import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateAttendancesTable1705344400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'attendances',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'client_phone',
            type: 'varchar',
            length: '20',
          },
          {
            name: 'whatsapp_number_id',
            type: 'uuid',
          },
          {
            name: 'state',
            type: 'enum',
            enum: ['OPEN', 'IN_PROGRESS', 'FINISHED'],
            default: "'OPEN'",
          },
          {
            name: 'handled_by',
            type: 'enum',
            enum: ['AI', 'HUMAN'],
            default: "'AI'",
          },
          {
            name: 'vehicle_brand',
            type: 'enum',
            enum: ['FORD', 'GM', 'VW', 'FIAT', 'IMPORTADOS'],
            isNullable: true,
          },
          {
            name: 'seller_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'supervisor_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'active_seller_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'ai_context',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'routed_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'finalized_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'assumed_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'returned_at',
            type: 'timestamp',
            isNullable: true,
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
      'attendances',
      new TableForeignKey({
        columnNames: ['whatsapp_number_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'whatsapp_numbers',
        onDelete: 'RESTRICT',
      })
    );

    await queryRunner.createForeignKey(
      'attendances',
      new TableForeignKey({
        columnNames: ['seller_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'sellers',
        onDelete: 'SET NULL',
      })
    );

    await queryRunner.createForeignKey(
      'attendances',
      new TableForeignKey({
        columnNames: ['supervisor_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'supervisors',
        onDelete: 'SET NULL',
      })
    );

    // Indexes
    await queryRunner.createIndex(
      'attendances',
      new TableIndex({
        name: 'IDX_attendances_client_open',
        columnNames: ['client_phone', 'state'],
      })
    );

    await queryRunner.createIndex(
      'attendances',
      new TableIndex({
        name: 'IDX_attendances_seller',
        columnNames: ['seller_id', 'state'],
      })
    );

    await queryRunner.createIndex(
      'attendances',
      new TableIndex({
        name: 'IDX_attendances_brand',
        columnNames: ['vehicle_brand', 'state'],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('attendances');
  }
}

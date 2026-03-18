import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateRouterOutputsTable1770200001000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'router_outputs',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'router_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'label',
            type: 'varchar',
            length: '200',
            isNullable: false,
          },
          {
            name: 'condition_type',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'condition_value',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'destination_type',
            type: 'varchar',
            length: '20',
            isNullable: false,
          },
          {
            name: 'destination_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'response_text',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'is_fallback',
            type: 'boolean',
            default: false,
            isNullable: false,
          },
          {
            name: 'order_index',
            type: 'int',
            default: 0,
            isNullable: false,
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
        ],
      }),
      true
    );

    await queryRunner.createForeignKey(
      'router_outputs',
      new TableForeignKey({
        name: 'fk_router_outputs_router_id',
        columnNames: ['router_id'],
        referencedTableName: 'routers',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      })
    );

    await queryRunner.createIndex(
      'router_outputs',
      new TableIndex({
        name: 'idx_router_outputs_router_id',
        columnNames: ['router_id'],
      })
    );

    await queryRunner.createIndex(
      'router_outputs',
      new TableIndex({
        name: 'idx_router_outputs_destination',
        columnNames: ['destination_type', 'destination_id'],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropForeignKey('router_outputs', 'fk_router_outputs_router_id');
    await queryRunner.dropTable('router_outputs');
  }
}

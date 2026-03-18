import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateRoutersTable1770200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'routers',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'name',
            type: 'varchar',
            length: '100',
            isUnique: true,
            isNullable: false,
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'router_type',
            type: 'varchar',
            length: '50',
            default: "'llm_choice'",
            isNullable: false,
          },
          {
            name: 'prompt',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'model',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'temperature',
            type: 'float',
            isNullable: true,
          },
          {
            name: 'config',
            type: 'jsonb',
            isNullable: true,
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

    await queryRunner.createIndex(
      'routers',
      new TableIndex({
        name: 'idx_routers_name',
        columnNames: ['name'],
        isUnique: true,
      })
    );

    await queryRunner.createIndex(
      'routers',
      new TableIndex({
        name: 'idx_routers_is_active',
        columnNames: ['is_active'],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('routers');
  }
}

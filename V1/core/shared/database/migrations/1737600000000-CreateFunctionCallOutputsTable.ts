import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateFunctionCallOutputsTable1737600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum type for output_type
    await queryRunner.query(`
      CREATE TYPE output_type_enum AS ENUM (
        'TEXT',
        'TEMPLATE',
        'JSON'
      );
    `);

    // Create function_call_outputs table
    await queryRunner.createTable(
      new Table({
        name: 'function_call_outputs',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'function_call_name',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'output_type',
            type: 'enum',
            enum: ['TEXT', 'TEMPLATE', 'JSON'],
            default: "'TEXT'",
          },
          {
            name: 'template',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'conditions',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
          },
          {
            name: 'priority',
            type: 'integer',
            default: 0,
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'now()',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'now()',
            isNullable: false,
          },
        ],
      }),
      true
    );

    // Create indexes
    await queryRunner.createIndex(
      'function_call_outputs',
      new TableIndex({
        name: 'idx_function_call_outputs_name',
        columnNames: ['function_call_name'],
      })
    );

    await queryRunner.createIndex(
      'function_call_outputs',
      new TableIndex({
        name: 'idx_function_call_outputs_active',
        columnNames: ['is_active'],
      })
    );

    await queryRunner.createIndex(
      'function_call_outputs',
      new TableIndex({
        name: 'idx_function_call_outputs_priority',
        columnNames: ['priority'],
      })
    );

    await queryRunner.createIndex(
      'function_call_outputs',
      new TableIndex({
        name: 'idx_function_call_outputs_name_active',
        columnNames: ['function_call_name', 'is_active'],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('function_call_outputs');
    await queryRunner.query('DROP TYPE IF EXISTS output_type_enum;');
  }
}

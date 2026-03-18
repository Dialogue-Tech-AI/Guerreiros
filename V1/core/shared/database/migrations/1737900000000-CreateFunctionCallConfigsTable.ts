import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateFunctionCallConfigsTable1737900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum type for processing_method
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE processing_method_enum AS ENUM (
          'RABBITMQ',
          'HTTP'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create table
    await queryRunner.createTable(
      new Table({
        name: 'function_call_configs',
        columns: [
          {
            name: 'function_call_name',
            type: 'varchar',
            length: '100',
            isPrimary: true,
          },
          {
            name: 'has_output',
            type: 'boolean',
            default: false,
          },
          {
            name: 'is_sync',
            type: 'boolean',
            default: true,
          },
          {
            name: 'processing_method',
            type: 'enum',
            enum: ['RABBITMQ', 'HTTP'],
            enumName: 'processing_method_enum',
            default: "'RABBITMQ'",
          },
          {
            name: 'metadata',
            type: 'jsonb',
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

    // Create unique index on function_call_name
    await queryRunner.createIndex(
      'function_call_configs',
      new TableIndex({
        name: 'idx_function_call_configs_name',
        columnNames: ['function_call_name'],
        isUnique: true,
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('function_call_configs');
    await queryRunner.query('DROP TYPE IF EXISTS processing_method_enum;');
  }
}

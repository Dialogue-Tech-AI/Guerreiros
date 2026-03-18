import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * Rename function_call_outputs -> function_call_inputs.
 * Creates new table, migrates data (output_type -> input_format), drops old table.
 */
export class RenameOutputsToInputs1738300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE input_format_enum AS ENUM (
        'TEXT',
        'TEMPLATE',
        'JSON'
      );
    `);

    await queryRunner.query(`
      CREATE TABLE function_call_inputs (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        function_call_name varchar(100) NOT NULL,
        input_format input_format_enum NOT NULL DEFAULT 'TEXT',
        template text NOT NULL,
        conditions jsonb,
        is_active boolean NOT NULL DEFAULT true,
        priority integer NOT NULL DEFAULT 0,
        description text,
        metadata jsonb,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      INSERT INTO function_call_inputs (
        id, function_call_name, input_format, template, conditions,
        is_active, priority, description, metadata, created_at, updated_at
      )
      SELECT
        id, function_call_name,
        output_type::text::input_format_enum,
        template, conditions,
        is_active, priority, description, metadata, created_at, updated_at
      FROM function_call_outputs
    `);

    await queryRunner.dropTable('function_call_outputs');
    await queryRunner.query('DROP TYPE IF EXISTS output_type_enum;');

    await queryRunner.createIndex(
      'function_call_inputs',
      new TableIndex({
        name: 'idx_function_call_inputs_name',
        columnNames: ['function_call_name'],
      })
    );
    await queryRunner.createIndex(
      'function_call_inputs',
      new TableIndex({
        name: 'idx_function_call_inputs_active',
        columnNames: ['is_active'],
      })
    );
    await queryRunner.createIndex(
      'function_call_inputs',
      new TableIndex({
        name: 'idx_function_call_inputs_priority',
        columnNames: ['priority'],
      })
    );
    await queryRunner.createIndex(
      'function_call_inputs',
      new TableIndex({
        name: 'idx_function_call_inputs_name_active',
        columnNames: ['function_call_name', 'is_active'],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE output_type_enum AS ENUM (
        'TEXT',
        'TEMPLATE',
        'JSON'
      );
    `);

    await queryRunner.createTable(
      new Table({
        name: 'function_call_outputs',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
          { name: 'function_call_name', type: 'varchar', length: '100', isNullable: false },
          { name: 'output_type', type: 'enum', enum: ['TEXT', 'TEMPLATE', 'JSON'], default: "'TEXT'" },
          { name: 'template', type: 'text', isNullable: false },
          { name: 'conditions', type: 'jsonb', isNullable: true },
          { name: 'is_active', type: 'boolean', default: true },
          { name: 'priority', type: 'integer', default: 0 },
          { name: 'description', type: 'text', isNullable: true },
          { name: 'metadata', type: 'jsonb', isNullable: true },
          { name: 'created_at', type: 'timestamp', default: 'now()', isNullable: false },
          { name: 'updated_at', type: 'timestamp', default: 'now()', isNullable: false },
        ],
      }),
      true
    );

    await queryRunner.query(`
      INSERT INTO function_call_outputs (
        id, function_call_name, output_type, template, conditions,
        is_active, priority, description, metadata, created_at, updated_at
      )
      SELECT
        id, function_call_name, input_format, template, conditions,
        is_active, priority, description, metadata, created_at, updated_at
      FROM function_call_inputs
    `);

    await queryRunner.dropTable('function_call_inputs');
    await queryRunner.query('DROP TYPE IF EXISTS input_format_enum;');
  }
}

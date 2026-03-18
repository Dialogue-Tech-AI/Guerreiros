import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class CreateBibliotecaTables1740000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create biblioteca_folders table
    await queryRunner.createTable(
      new Table({
        name: 'biblioteca_folders',
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
            length: '255',
            isNullable: false,
          },
          {
            name: 'parent_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'folder_type',
            type: 'varchar',
            length: '20',
            default: "'prompts'",
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

    // Create foreign key for parent_id
    await queryRunner.createForeignKey(
      'biblioteca_folders',
      new TableForeignKey({
        columnNames: ['parent_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'biblioteca_folders',
        onDelete: 'CASCADE',
      })
    );

    // Create index on folder_type
    await queryRunner.createIndex(
      'biblioteca_folders',
      new TableIndex({
        name: 'idx_biblioteca_folders_type',
        columnNames: ['folder_type'],
      })
    );

    // Create biblioteca_prompts table
    await queryRunner.createTable(
      new Table({
        name: 'biblioteca_prompts',
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
            length: '255',
            isNullable: false,
          },
          {
            name: 'content',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'folder_id',
            type: 'uuid',
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

    // Create foreign key for folder_id in biblioteca_prompts
    await queryRunner.createForeignKey(
      'biblioteca_prompts',
      new TableForeignKey({
        columnNames: ['folder_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'biblioteca_folders',
        onDelete: 'SET NULL',
      })
    );

    // Create biblioteca_function_calls table
    await queryRunner.createTable(
      new Table({
        name: 'biblioteca_function_calls',
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
            length: '255',
            isNullable: false,
          },
          {
            name: 'folder_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'objective',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'trigger_conditions',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'execution_timing',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'required_fields',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'optional_fields',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'restrictions',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'processing_notes',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
          },
          {
            name: 'has_output',
            type: 'boolean',
            default: false,
          },
          {
            name: 'processing_method',
            type: 'varchar',
            length: '20',
            default: "'RABBITMQ'",
          },
          {
            name: 'custom_attributes',
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

    // Create foreign key for folder_id in biblioteca_function_calls
    await queryRunner.createForeignKey(
      'biblioteca_function_calls',
      new TableForeignKey({
        columnNames: ['folder_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'biblioteca_folders',
        onDelete: 'SET NULL',
      })
    );

    // Create agent_function_calls table
    await queryRunner.createTable(
      new Table({
        name: 'agent_function_calls',
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
            length: '255',
            isNullable: false,
          },
          {
            name: 'objective',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'trigger_conditions',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'execution_timing',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'required_fields',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'optional_fields',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'restrictions',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'processing_notes',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
          },
          {
            name: 'has_output',
            type: 'boolean',
            default: false,
          },
          {
            name: 'processing_method',
            type: 'varchar',
            length: '20',
            default: "'RABBITMQ'",
          },
          {
            name: 'custom_attributes',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'biblioteca_id',
            type: 'uuid',
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

    // Create foreign key for biblioteca_id in agent_function_calls
    await queryRunner.createForeignKey(
      'agent_function_calls',
      new TableForeignKey({
        columnNames: ['biblioteca_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'biblioteca_function_calls',
        onDelete: 'SET NULL',
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop tables in reverse order
    await queryRunner.dropTable('agent_function_calls');
    await queryRunner.dropTable('biblioteca_function_calls');
    await queryRunner.dropTable('biblioteca_prompts');
    await queryRunner.dropTable('biblioteca_folders');
  }
}

import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

/**
 * Cria tabelas case_types e attendance_cases (Casos por atendimento).
 * case_types: tipos de caso configuráveis no painel.
 * attendance_cases: casos vinculados a um atendimento.
 */
export class CreateCaseTypesAndAttendanceCases1739000400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'case_types',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'key',
            type: 'varchar',
            length: '64',
            isUnique: true,
          },
          {
            name: 'label',
            type: 'varchar',
            length: '128',
          },
          {
            name: 'can_stay_open',
            type: 'boolean',
            default: true,
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
          },
          {
            name: 'ordem',
            type: 'int',
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

    await queryRunner.createTable(
      new Table({
        name: 'attendance_cases',
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
            isNullable: false,
          },
          {
            name: 'case_type_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'status',
            type: 'varchar',
            length: '64',
          },
          {
            name: 'title',
            type: 'varchar',
            length: '256',
            isNullable: true,
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

    await queryRunner.createForeignKey(
      'attendance_cases',
      new TableForeignKey({
        columnNames: ['attendance_id'],
        referencedTableName: 'attendances',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      })
    );

    await queryRunner.createForeignKey(
      'attendance_cases',
      new TableForeignKey({
        columnNames: ['case_type_id'],
        referencedTableName: 'case_types',
        referencedColumnNames: ['id'],
        onDelete: 'RESTRICT',
      })
    );

    await queryRunner.createIndex(
      'attendance_cases',
      new TableIndex({ name: 'IDX_attendance_cases_attendance_status', columnNames: ['attendance_id', 'status'] })
    );
    await queryRunner.createIndex(
      'attendance_cases',
      new TableIndex({ name: 'IDX_attendance_cases_attendance_type', columnNames: ['attendance_id', 'case_type_id'] })
    );

    // Seed case_types conforme spec
    await queryRunner.query(`
      INSERT INTO case_types (key, label, can_stay_open, is_active, ordem)
      VALUES
        ('pedido_peca', 'Pedido de peça', true, true, 1),
        ('orcamento', 'Orçamento', true, true, 2),
        ('pos_venda', 'Pós-venda', true, true, 3),
        ('garantia', 'Garantia', true, true, 4),
        ('duvida_simples', 'Dúvida simples', false, true, 5)
      ON CONFLICT (key) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('attendance_cases', true);
    await queryRunner.dropTable('case_types', true);
  }
}

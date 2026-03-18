import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

/**
 * Tabela ai_response_costs: custo por resposta da IA (tokens, USD, BRL).
 * Preenchida pelo AI worker via POST /api/internal/ai-costs.
 */
export class CreateAiResponseCostsTable1738900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'ai_response_costs',
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
            name: 'message_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'client_phone',
            type: 'varchar',
            length: '64',
            isNullable: true,
          },
          {
            name: 'scenario',
            type: 'varchar',
            length: '32',
            default: "'text'",
          },
          {
            name: 'model',
            type: 'varchar',
            length: '64',
          },
          {
            name: 'prompt_tokens',
            type: 'int',
            default: 0,
          },
          {
            name: 'completion_tokens',
            type: 'int',
            default: 0,
          },
          {
            name: 'total_tokens',
            type: 'int',
            default: 0,
          },
          {
            name: 'whisper_minutes',
            type: 'decimal',
            precision: 10,
            scale: 4,
            isNullable: true,
          },
          {
            name: 'usd_cost',
            type: 'decimal',
            precision: 12,
            scale: 6,
            default: 0,
          },
          {
            name: 'brl_cost',
            type: 'decimal',
            precision: 12,
            scale: 6,
            default: 0,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true
    );

    await queryRunner.createForeignKey(
      'ai_response_costs',
      new TableForeignKey({
        columnNames: ['attendance_id'],
        referencedTableName: 'attendances',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      })
    );

    await queryRunner.createIndex(
      'ai_response_costs',
      new TableIndex({ name: 'IDX_ai_response_costs_attendance', columnNames: ['attendance_id'] })
    );
    await queryRunner.createIndex(
      'ai_response_costs',
      new TableIndex({ name: 'IDX_ai_response_costs_created_at', columnNames: ['created_at'] })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('ai_response_costs', true);
  }
}

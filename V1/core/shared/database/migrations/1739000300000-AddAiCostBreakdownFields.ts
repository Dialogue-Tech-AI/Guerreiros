import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Adiciona colunas de breakdown de custos para Multi-Agentes:
 * - router_*: custos/tokens do Router Agent
 * - specialist_*: custos/tokens do Agente Especialista
 *
 * Mantém as colunas existentes (model/tokens/usd/brl) como TOTAL.
 */
export class AddAiCostBreakdownFields1739000300000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('ai_response_costs', [
      // Router
      new TableColumn({
        name: 'router_model',
        type: 'varchar',
        length: '64',
        isNullable: true,
      }),
      new TableColumn({ name: 'router_prompt_tokens', type: 'int', default: 0 }),
      new TableColumn({ name: 'router_completion_tokens', type: 'int', default: 0 }),
      new TableColumn({ name: 'router_total_tokens', type: 'int', default: 0 }),
      new TableColumn({ name: 'router_usd_cost', type: 'decimal', precision: 12, scale: 6, default: 0 }),
      new TableColumn({ name: 'router_brl_cost', type: 'decimal', precision: 12, scale: 6, default: 0 }),

      // Specialist
      new TableColumn({
        name: 'specialist_name',
        type: 'varchar',
        length: '255',
        isNullable: true,
      }),
      new TableColumn({
        name: 'specialist_model',
        type: 'varchar',
        length: '64',
        isNullable: true,
      }),
      new TableColumn({ name: 'specialist_prompt_tokens', type: 'int', default: 0 }),
      new TableColumn({ name: 'specialist_completion_tokens', type: 'int', default: 0 }),
      new TableColumn({ name: 'specialist_total_tokens', type: 'int', default: 0 }),
      new TableColumn({ name: 'specialist_usd_cost', type: 'decimal', precision: 12, scale: 6, default: 0 }),
      new TableColumn({ name: 'specialist_brl_cost', type: 'decimal', precision: 12, scale: 6, default: 0 }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumns('ai_response_costs', [
      'router_model',
      'router_prompt_tokens',
      'router_completion_tokens',
      'router_total_tokens',
      'router_usd_cost',
      'router_brl_cost',
      'specialist_name',
      'specialist_model',
      'specialist_prompt_tokens',
      'specialist_completion_tokens',
      'specialist_total_tokens',
      'specialist_usd_cost',
      'specialist_brl_cost',
    ]);
  }
}


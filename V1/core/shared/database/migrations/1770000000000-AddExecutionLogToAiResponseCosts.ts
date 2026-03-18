import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Adiciona execution_log (JSONB) em ai_response_costs para log completo por resposta:
 * roteamento, agente, prompt enviado, ChatML, tools disponíveis/utilizadas, tokens.
 * Usado na aba Custos → "Ver Log da Execução".
 */
export class AddExecutionLogToAiResponseCosts1770000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'ai_response_costs',
      new TableColumn({
        name: 'execution_log',
        type: 'jsonb',
        isNullable: true,
        comment: 'Log completo da execução (roteamento, prompt, ChatML, tools, etc.) para debug na aba Custos',
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('ai_response_costs', 'execution_log');
  }
}

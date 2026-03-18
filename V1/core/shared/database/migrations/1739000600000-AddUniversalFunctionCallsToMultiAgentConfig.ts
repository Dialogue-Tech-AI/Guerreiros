import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Adiciona universal_function_calls em multi_agent_config.
 * Function calls universais ficam presentes em todos os agentes especialistas (concatenação: universais + individuais).
 */
export class AddUniversalFunctionCallsToMultiAgentConfig1739000600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'multi_agent_config',
      new TableColumn({
        name: 'universal_function_calls',
        type: 'jsonb',
        isNullable: true,
        default: "'[]'",
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('multi_agent_config', 'universal_function_calls');
  }
}

import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Adiciona universal_prompt em multi_agent_config.
 * Prompt universal é usado em todos os agentes especialistas (concatenação: universal + individual).
 */
export class AddUniversalPromptToMultiAgentConfig1739000500000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'multi_agent_config',
      new TableColumn({
        name: 'universal_prompt',
        type: 'text',
        isNullable: true,
        default: null,
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('multi_agent_config', 'universal_prompt');
  }
}

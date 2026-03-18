import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Adiciona novos campos para estrutura completa de function calls:
 * - trigger_conditions (quando acionar)
 * - execution_timing (momento de execução)
 * - objective (objetivo/descrição)
 * - required_fields (informações obrigatórias)
 * - optional_fields (informações opcionais)
 * - restrictions (restrições/o que não fazer)
 * - processing_notes (anotações livres sobre como processar)
 */
export class UpdateFunctionCallConfigStructure1738400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Adicionar novos campos
    await queryRunner.addColumn(
      'function_call_configs',
      new TableColumn({
        name: 'trigger_conditions',
        type: 'text',
        isNullable: true,
        comment: 'Condições para acionar a function call (quando usar)',
      })
    );

    await queryRunner.addColumn(
      'function_call_configs',
      new TableColumn({
        name: 'execution_timing',
        type: 'text',
        isNullable: true,
        comment: 'Momento de execução na conversa (ex: após cliente terminar explicação)',
      })
    );

    await queryRunner.addColumn(
      'function_call_configs',
      new TableColumn({
        name: 'objective',
        type: 'text',
        isNullable: true,
        comment: 'Objetivo/descrição do que a function call faz',
      })
    );

    await queryRunner.addColumn(
      'function_call_configs',
      new TableColumn({
        name: 'required_fields',
        type: 'jsonb',
        isNullable: true,
        default: "'[]'",
        comment: 'Array de campos obrigatórios a coletar antes de disparar',
      })
    );

    await queryRunner.addColumn(
      'function_call_configs',
      new TableColumn({
        name: 'optional_fields',
        type: 'jsonb',
        isNullable: true,
        default: "'[]'",
        comment: 'Array de campos opcionais que podem ser coletados',
      })
    );

    await queryRunner.addColumn(
      'function_call_configs',
      new TableColumn({
        name: 'restrictions',
        type: 'text',
        isNullable: true,
        comment: 'Restrições/o que a IA não deve fazer ao usar essa FC',
      })
    );

    await queryRunner.addColumn(
      'function_call_configs',
      new TableColumn({
        name: 'processing_notes',
        type: 'text',
        isNullable: true,
        comment: 'Anotações livres sobre como essa FC é processada (para referência)',
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('function_call_configs', 'processing_notes');
    await queryRunner.dropColumn('function_call_configs', 'restrictions');
    await queryRunner.dropColumn('function_call_configs', 'optional_fields');
    await queryRunner.dropColumn('function_call_configs', 'required_fields');
    await queryRunner.dropColumn('function_call_configs', 'objective');
    await queryRunner.dropColumn('function_call_configs', 'execution_timing');
    await queryRunner.dropColumn('function_call_configs', 'trigger_conditions');
  }
}

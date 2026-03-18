import { MigrationInterface, QueryRunner, Table, TableColumn } from 'typeorm';

/**
 * Cria a tabela processes (processos do sistema, somente leitura na UI)
 * e adiciona process_id em function_call_configs para vincular FC como acionador.
 */
export class CreateProcessesAndLinkToFunctionCallConfigs1770400000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'processes',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          { name: 'name', type: 'varchar', length: '255' },
          { name: 'description', type: 'text', isNullable: true },
          {
            name: 'trigger_function_call_name',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          { name: 'required_inputs', type: 'jsonb', isNullable: true },
          { name: 'created_at', type: 'timestamp', default: 'now()' },
          { name: 'updated_at', type: 'timestamp', default: 'now()' },
        ],
      }),
      true
    );

    await queryRunner.addColumn(
      'function_call_configs',
      new TableColumn({
        name: 'process_id',
        type: 'uuid',
        isNullable: true,
        comment: 'Processo vinculado: ao executar esta FC, o processo também é executado',
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('function_call_configs', 'process_id');
    await queryRunner.dropTable('processes');
  }
}

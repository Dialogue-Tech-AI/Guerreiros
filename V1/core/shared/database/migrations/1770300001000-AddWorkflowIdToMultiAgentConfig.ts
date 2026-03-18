import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey } from 'typeorm';

export class AddWorkflowIdToMultiAgentConfig1770300001000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'multi_agent_config',
      new TableColumn({
        name: 'workflow_id',
        type: 'uuid',
        isNullable: true,
      })
    );

    await queryRunner.createForeignKey(
      'multi_agent_config',
      new TableForeignKey({
        name: 'fk_multi_agent_config_workflow_id',
        columnNames: ['workflow_id'],
        referencedTableName: 'workflows',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropForeignKey('multi_agent_config', 'fk_multi_agent_config_workflow_id');
    await queryRunner.dropColumn('multi_agent_config', 'workflow_id');
  }
}

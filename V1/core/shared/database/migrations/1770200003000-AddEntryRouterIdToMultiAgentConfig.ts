import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey } from 'typeorm';

export class AddEntryRouterIdToMultiAgentConfig1770200003000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'multi_agent_config',
      new TableColumn({
        name: 'entry_router_id',
        type: 'uuid',
        isNullable: true,
      })
    );

    await queryRunner.createForeignKey(
      'multi_agent_config',
      new TableForeignKey({
        name: 'fk_multi_agent_config_entry_router_id',
        columnNames: ['entry_router_id'],
        referencedTableName: 'routers',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropForeignKey('multi_agent_config', 'fk_multi_agent_config_entry_router_id');
    await queryRunner.dropColumn('multi_agent_config', 'entry_router_id');
  }
}

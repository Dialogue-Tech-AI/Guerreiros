import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddRouterResponsesToRouterConfig1739000100000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'router_agent_config',
      new TableColumn({
        name: 'routing_responses',
        type: 'jsonb',
        isNullable: true,
        default: "'[]'",
      })
    );
    await queryRunner.query(`
      UPDATE router_agent_config SET routing_responses = '[]'::jsonb WHERE routing_responses IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('router_agent_config', 'routing_responses');
  }
}

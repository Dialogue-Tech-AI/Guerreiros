import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddIntentRoutingResponsesToRouterConfig1769900000000 implements MigrationInterface {
  name = 'AddIntentRoutingResponsesToRouterConfig1769900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'router_agent_config',
      new TableColumn({
        name: 'intent_routing_responses',
        type: 'jsonb',
        isNullable: true,
        default: "'[]'",
      })
    );

    await queryRunner.query(`
      UPDATE router_agent_config
      SET intent_routing_responses = '[]'::jsonb
      WHERE intent_routing_responses IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('router_agent_config', 'intent_routing_responses');
  }
}


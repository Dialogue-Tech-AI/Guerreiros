import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIntentChannelRouterMode1769800000000 implements MigrationInterface {
  name = 'AddIntentChannelRouterMode1769800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add router_mode column (single_stage, two_stage_top2, or intent_channel)
    await queryRunner.query(`
      ALTER TABLE "router_agent_config"
        ADD COLUMN IF NOT EXISTS "router_mode" varchar(50) NOT NULL DEFAULT 'single_stage';
    `);

    // Add intent_channel_mapping column (JSONB for flexible mapping)
    await queryRunner.query(`
      ALTER TABLE "router_agent_config"
        ADD COLUMN IF NOT EXISTS "intent_channel_mapping" jsonb;
    `);

    // Update existing rows: if two_stage_enabled is true, set router_mode to 'two_stage_top2'
    await queryRunner.query(`
      UPDATE "router_agent_config"
      SET "router_mode" = 'two_stage_top2'
      WHERE "two_stage_enabled" = true;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "router_agent_config"
        DROP COLUMN IF EXISTS "intent_channel_mapping";
    `);
    await queryRunner.query(`
      ALTER TABLE "router_agent_config"
        DROP COLUMN IF EXISTS "router_mode";
    `);
  }
}

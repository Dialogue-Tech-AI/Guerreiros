import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTwoStageRouterConfig1769700000000 implements MigrationInterface {
  name = 'AddTwoStageRouterConfig1769700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "router_agent_config"
        ADD COLUMN IF NOT EXISTS "two_stage_enabled" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "prompt_stage1" text,
        ADD COLUMN IF NOT EXISTS "model_stage1" varchar(100),
        ADD COLUMN IF NOT EXISTS "temperature_stage1" double precision,
        ADD COLUMN IF NOT EXISTS "prompt_stage2" text,
        ADD COLUMN IF NOT EXISTS "model_stage2" varchar(100),
        ADD COLUMN IF NOT EXISTS "temperature_stage2" double precision;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "router_agent_config"
        DROP COLUMN IF EXISTS "temperature_stage2",
        DROP COLUMN IF EXISTS "model_stage2",
        DROP COLUMN IF EXISTS "prompt_stage2",
        DROP COLUMN IF EXISTS "temperature_stage1",
        DROP COLUMN IF EXISTS "model_stage1",
        DROP COLUMN IF EXISTS "prompt_stage1",
        DROP COLUMN IF EXISTS "two_stage_enabled";
    `);
  }
}


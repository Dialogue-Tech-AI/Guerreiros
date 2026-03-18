import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixOperationalStateEnum1737500000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if column exists
    const columnExists = await queryRunner.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public'
        AND table_name = 'attendances' 
        AND column_name = 'operational_state';
    `);

    if (columnExists.length === 0) {
      // Column doesn't exist, nothing to fix
      return;
    }

    // Get the actual enum type name from the column
    const enumTypeResult = await queryRunner.query(`
      SELECT 
        c.udt_name as enum_name
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'attendances' 
        AND c.column_name = 'operational_state';
    `);

    if (enumTypeResult.length === 0 || !enumTypeResult[0].enum_name) {
      throw new Error('Could not find enum type for operational_state column');
    }

    const enumTypeName = enumTypeResult[0].enum_name;

    // Now update using the correct enum type
    await queryRunner.query(`
      UPDATE attendances 
      SET operational_state = CASE
        WHEN state = 'OPEN' THEN 'TRIAGEM'::` + enumTypeName + `
        WHEN state = 'IN_PROGRESS' THEN 'EM_ATENDIMENTO'::` + enumTypeName + `
        WHEN state = 'FINISHED' THEN 'FECHADO_OPERACIONAL'::` + enumTypeName + `
        ELSE 'TRIAGEM'::` + enumTypeName + `
      END
      WHERE operational_state IS NULL;
    `);

    // Set default if not already set
    try {
      await queryRunner.query(`
        ALTER TABLE attendances 
        ALTER COLUMN operational_state SET DEFAULT 'TRIAGEM'::` + enumTypeName + `;
      `);
    } catch (error: any) {
      // Default might already be set, ignore error
      if (!error.message.includes('already has a default')) {
        throw error;
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Nothing to revert
  }
}

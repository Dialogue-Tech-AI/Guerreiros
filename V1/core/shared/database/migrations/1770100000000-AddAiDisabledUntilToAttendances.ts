import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddAiDisabledUntilToAttendances1770100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'attendances',
      new TableColumn({
        name: 'ai_disabled_until',
        type: 'timestamp',
        isNullable: true,
      })
    );

    // Index para queries rápidas
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_attendances_ai_disabled_until 
      ON attendances(ai_disabled_until) 
      WHERE ai_disabled_until IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_attendances_ai_disabled_until;`);
    await queryRunner.dropColumn('attendances', 'ai_disabled_until');
  }
}

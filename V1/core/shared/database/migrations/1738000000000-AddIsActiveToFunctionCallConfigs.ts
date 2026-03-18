import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddIsActiveToFunctionCallConfigs1738000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'function_call_configs',
      new TableColumn({
        name: 'is_active',
        type: 'boolean',
        default: true,
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('function_call_configs', 'is_active');
  }
}

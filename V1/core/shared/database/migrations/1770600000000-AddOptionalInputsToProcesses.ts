import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddOptionalInputsToProcesses1770600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'processes',
      new TableColumn({
        name: 'optional_inputs',
        type: 'jsonb',
        isNullable: true,
        comment: 'Nomes dos campos opcionais do processo',
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('processes', 'optional_inputs');
  }
}

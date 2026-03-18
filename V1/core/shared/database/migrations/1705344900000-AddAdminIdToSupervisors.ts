import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey } from 'typeorm';

export class AddAdminIdToSupervisors1705344900000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'supervisors',
      new TableColumn({
        name: 'admin_id',
        type: 'uuid',
        isNullable: true,
      })
    );

    await queryRunner.createForeignKey(
      'supervisors',
      new TableForeignKey({
        columnNames: ['admin_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'SET NULL', // If an admin is deleted, set admin_id to null
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('supervisors');
    const foreignKey = table?.foreignKeys.find(
      (fk) => fk.columnNames.indexOf('admin_id') !== -1
    );
    if (foreignKey) {
      await queryRunner.dropForeignKey('supervisors', foreignKey);
    }
    await queryRunner.dropColumn('supervisors', 'admin_id');
  }
}

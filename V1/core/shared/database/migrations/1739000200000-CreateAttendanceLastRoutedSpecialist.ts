import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class CreateAttendanceLastRoutedSpecialist1739000200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'attendance_last_routed_specialist',
        columns: [
          {
            name: 'attendance_id',
            type: 'uuid',
            isPrimary: true,
          },
          {
            name: 'specialist_name',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'now()',
          },
        ],
      }),
      true
    );

    await queryRunner.createForeignKey(
      'attendance_last_routed_specialist',
      new TableForeignKey({
        columnNames: ['attendance_id'],
        referencedTableName: 'attendances',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('attendance_last_routed_specialist');
    if (table?.foreignKeys?.length) {
      await queryRunner.dropForeignKey('attendance_last_routed_specialist', table.foreignKeys[0]);
    }
    await queryRunner.dropTable('attendance_last_routed_specialist');
  }
}

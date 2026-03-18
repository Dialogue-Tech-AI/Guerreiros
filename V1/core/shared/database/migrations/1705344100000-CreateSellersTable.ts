import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class CreateSellersTable1705344100000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'sellers',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
          },
          {
            name: 'supervisor_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'brands',
            type: 'jsonb',
          },
          {
            name: 'round_robin_order',
            type: 'integer',
            default: 0,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true
    );

    // Foreign key to users
    await queryRunner.createForeignKey(
      'sellers',
      new TableForeignKey({
        columnNames: ['id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      })
    );

    // Foreign key to supervisor (also in users)
    await queryRunner.createForeignKey(
      'sellers',
      new TableForeignKey({
        columnNames: ['supervisor_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'SET NULL',
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('sellers');
  }
}

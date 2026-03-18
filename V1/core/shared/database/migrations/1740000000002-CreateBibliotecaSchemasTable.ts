import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class CreateBibliotecaSchemasTable1740000000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'biblioteca_schemas',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'name',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'folder_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'definition',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'schema_type',
            type: 'varchar',
            length: '20',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'now()',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'now()',
            isNullable: false,
          },
        ],
      }),
      true
    );

    await queryRunner.createForeignKey(
      'biblioteca_schemas',
      new TableForeignKey({
        columnNames: ['folder_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'biblioteca_folders',
        onDelete: 'SET NULL',
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('biblioteca_schemas');
  }
}

import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateAffinitiesTable1705344600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'affinities',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'client_phone',
            type: 'varchar',
            length: '20',
          },
          {
            name: 'brand',
            type: 'enum',
            enum: ['FORD', 'GM', 'VW', 'FIAT', 'IMPORTADOS'],
          },
          {
            name: 'seller_id',
            type: 'uuid',
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'last_used_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true
    );

    // Foreign key to sellers
    await queryRunner.createForeignKey(
      'affinities',
      new TableForeignKey({
        columnNames: ['seller_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'sellers',
        onDelete: 'CASCADE',
      })
    );

    // Unique constraint on client_phone + brand
    await queryRunner.createIndex(
      'affinities',
      new TableIndex({
        name: 'IDX_affinities_client_brand',
        columnNames: ['client_phone', 'brand'],
        isUnique: true,
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('affinities');
  }
}

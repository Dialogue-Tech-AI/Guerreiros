import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey } from 'typeorm';

export class AddSellerIdToWhatsAppNumbers1705344700000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if column already exists
    const table = await queryRunner.getTable('whatsapp_numbers');
    const sellerIdColumn = table?.findColumnByName('seller_id');
    
    if (!sellerIdColumn) {
      // Add seller_id column
      await queryRunner.addColumn(
        'whatsapp_numbers',
        new TableColumn({
          name: 'seller_id',
          type: 'uuid',
          isNullable: true,
        })
      );

      // Add foreign key constraint
      await queryRunner.createForeignKey(
        'whatsapp_numbers',
        new TableForeignKey({
          columnNames: ['seller_id'],
          referencedColumnNames: ['id'],
          referencedTableName: 'users',
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE',
        })
      );

      // Add index for better query performance
      await queryRunner.query(
        `CREATE INDEX "IDX_whatsapp_numbers_seller_id" ON "whatsapp_numbers" ("seller_id") WHERE "seller_id" IS NOT NULL`
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign key
    const table = await queryRunner.getTable('whatsapp_numbers');
    const foreignKey = table?.foreignKeys.find((fk) => fk.columnNames.indexOf('seller_id') !== -1);
    if (foreignKey) {
      await queryRunner.dropForeignKey('whatsapp_numbers', foreignKey);
    }

    // Drop index
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_whatsapp_numbers_seller_id"`);

    // Drop column
    const sellerIdColumn = table?.findColumnByName('seller_id');
    if (sellerIdColumn) {
      await queryRunner.dropColumn('whatsapp_numbers', 'seller_id');
    }
  }
}

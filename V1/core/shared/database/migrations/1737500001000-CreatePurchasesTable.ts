import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreatePurchasesTable1737500001000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum types
    await queryRunner.query(`
      CREATE TYPE purchase_status_enum AS ENUM (
        'PENDENTE',
        'PAGO',
        'CANCELADO',
        'ESTORNADO'
      );
    `);

    await queryRunner.query(`
      CREATE TYPE payment_method_enum AS ENUM (
        'PIX',
        'CARTAO',
        'BOLETO'
      );
    `);

    await queryRunner.query(`
      CREATE TYPE delivery_method_enum AS ENUM (
        'RETIRADA',
        'ENTREGA'
      );
    `);

    await queryRunner.createTable(
      new Table({
        name: 'purchases',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'attendance_id',
            type: 'uuid',
          },
          {
            name: 'seller_id',
            type: 'uuid',
          },
          {
            name: 'client_phone',
            type: 'varchar',
            length: '20',
          },
          {
            name: 'vehicle_brand',
            type: 'enum',
            enum: ['FORD', 'GM', 'VW', 'FIAT', 'IMPORTADOS'],
          },
          {
            name: 'vehicle_model',
            type: 'varchar',
            length: '100',
          },
          {
            name: 'vehicle_year',
            type: 'integer',
          },
          {
            name: 'items',
            type: 'jsonb',
          },
          {
            name: 'total_amount',
            type: 'decimal',
            precision: 10,
            scale: 2,
          },
          {
            name: 'payment_method',
            type: 'enum',
            enum: ['PIX', 'CARTAO', 'BOLETO'],
          },
          {
            name: 'delivery_method',
            type: 'enum',
            enum: ['RETIRADA', 'ENTREGA'],
          },
          {
            name: 'payment_link',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['PENDENTE', 'PAGO', 'CANCELADO', 'ESTORNADO'],
            default: "'PENDENTE'",
          },
          {
            name: 'purchase_origin',
            type: 'enum',
            enum: ['WHATSAPP', 'TELEFONE_FIXO', 'ECOMMERCE', 'BALCAO', 'NAO_APLICA'],
          },
          {
            name: 'purchase_date',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true
    );

    // Foreign keys
    await queryRunner.createForeignKey(
      'purchases',
      new TableForeignKey({
        columnNames: ['attendance_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'attendances',
        onDelete: 'CASCADE',
      })
    );

    await queryRunner.createForeignKey(
      'purchases',
      new TableForeignKey({
        columnNames: ['seller_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'RESTRICT',
      })
    );

    // Indexes
    await queryRunner.createIndex(
      'purchases',
      new TableIndex({
        name: 'idx_purchase_attendance',
        columnNames: ['attendance_id'],
      })
    );

    await queryRunner.createIndex(
      'purchases',
      new TableIndex({
        name: 'idx_purchase_seller',
        columnNames: ['seller_id'],
      })
    );

    await queryRunner.createIndex(
      'purchases',
      new TableIndex({
        name: 'idx_purchase_client',
        columnNames: ['client_phone'],
      })
    );

    await queryRunner.createIndex(
      'purchases',
      new TableIndex({
        name: 'idx_purchase_status',
        columnNames: ['status'],
      })
    );

    await queryRunner.createIndex(
      'purchases',
      new TableIndex({
        name: 'idx_purchase_date',
        columnNames: ['purchase_date'],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('purchases');
    await queryRunner.query('DROP TYPE IF EXISTS delivery_method_enum;');
    await queryRunner.query('DROP TYPE IF EXISTS payment_method_enum;');
    await queryRunner.query('DROP TYPE IF EXISTS purchase_status_enum;');
  }
}

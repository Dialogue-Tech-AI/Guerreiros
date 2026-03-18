import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

/**
 * Tabela quote_requests para Pedidos de Orçamento.
 * FC pedidoorcamento cria cards; respostaperguntaorcamento atualiza question_answers.
 */
export class CreateQuoteRequestsTable1738800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'quote_requests',
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
            isNullable: false,
          },
          {
            name: 'seller_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'seller_subdivision',
            type: 'varchar',
            length: '64',
            default: "'pedidos-orcamentos'",
          },
          {
            name: 'client_phone',
            type: 'varchar',
            length: '64',
          },
          {
            name: 'client_name',
            type: 'varchar',
            length: '256',
            isNullable: true,
          },
          {
            name: 'items',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'observations',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'varchar',
            length: '32',
            default: "'pendente'",
          },
          {
            name: 'question_answers',
            type: 'jsonb',
            isNullable: true,
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

    await queryRunner.createForeignKey(
      'quote_requests',
      new TableForeignKey({
        columnNames: ['attendance_id'],
        referencedTableName: 'attendances',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      })
    );

    await queryRunner.createForeignKey(
      'quote_requests',
      new TableForeignKey({
        columnNames: ['seller_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      })
    );

    await queryRunner.createIndex(
      'quote_requests',
      new TableIndex({ name: 'IDX_quote_requests_attendance', columnNames: ['attendance_id'] })
    );
    await queryRunner.createIndex(
      'quote_requests',
      new TableIndex({ name: 'IDX_quote_requests_seller', columnNames: ['seller_id'] })
    );
    await queryRunner.createIndex(
      'quote_requests',
      new TableIndex({ name: 'IDX_quote_requests_seller_subdivision', columnNames: ['seller_id', 'seller_subdivision'] })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('quote_requests', true);
  }
}

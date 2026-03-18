import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Adiciona coluna seller_subdivision para permitir subdivisões dentro de cada vendedor
 * (ex.: pedidos-orcamentos, perguntas-pos-orcamento, confirmacao-pix, etc.)
 */
export class AddSellerSubdivisionToAttendances1738700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'attendances',
      new TableColumn({
        name: 'seller_subdivision',
        type: 'varchar',
        length: '64',
        isNullable: true,
        comment: 'Subdivisão do vendedor (pedidos-orcamentos, perguntas-pos-orcamento, confirmacao-pix, tirar-pedido, informacoes-entrega, encomendas)',
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('attendances', 'seller_subdivision');
  }
}

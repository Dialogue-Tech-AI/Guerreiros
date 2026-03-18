import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddVehicleInfoToQuoteRequests1770500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Adicionar coluna vehicle_info (JSONB) para armazenar dados estruturados do pedido
    await queryRunner.addColumn(
      'quote_requests',
      new TableColumn({
        name: 'vehicle_info',
        type: 'jsonb',
        isNullable: true,
        comment: 'Informações estruturadas do veículo e pedido: marca, modelo, ano, peca, placa, resumo',
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('quote_requests', 'vehicle_info');
  }
}

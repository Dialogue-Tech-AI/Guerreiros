import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Adiciona intervention_type e intervention_data em attendances.
 * Usado para rotear atendimentos a "Demanda telefone fixo" (registrarposvendatelefonefixo)
 * e armazenar dados coletados pela FC.
 */
export class AddInterventionTypeToAttendances1738600000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'attendances',
      new TableColumn({
        name: 'intervention_type',
        type: 'varchar',
        length: '64',
        isNullable: true,
        comment: "Ex.: 'demanda-telefone-fixo' quando roteado por FC registrarposvendatelefonefixo",
      })
    );
    await queryRunner.addColumn(
      'attendances',
      new TableColumn({
        name: 'intervention_data',
        type: 'jsonb',
        isNullable: true,
        comment: 'Dados coletados pela FC (nome, CPF, data compra, resumo, etc.)',
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('attendances', 'intervention_data');
    await queryRunner.dropColumn('attendances', 'intervention_type');
  }
}

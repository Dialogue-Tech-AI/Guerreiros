import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Adiciona balcao_closing_at em attendances.
 * Usado para controlar o timer de fechamento automático de atendimentos de balcão.
 * Quando a FC fechaatendimentobalcao é acionada, esse campo é preenchido com
 * o timestamp de quando o atendimento deve ser fechado automaticamente.
 */
export class AddBalcaoClosingAtToAttendances1739000700000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'attendances',
      new TableColumn({
        name: 'balcao_closing_at',
        type: 'timestamp',
        isNullable: true,
        default: null,
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('attendances', 'balcao_closing_at');
  }
}

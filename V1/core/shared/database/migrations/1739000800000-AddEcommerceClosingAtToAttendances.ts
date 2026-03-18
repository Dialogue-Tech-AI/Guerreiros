import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Adiciona campo ecommerce_closing_at para timer de fechamento automático
 * de atendimentos encaminhados para e-commerce (via function call enviaecommerce).
 */
export class AddEcommerceClosingAtToAttendances1739000800000 implements MigrationInterface {
  name = 'AddEcommerceClosingAtToAttendances1739000800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'attendances',
      new TableColumn({
        name: 'ecommerce_closing_at',
        type: 'timestamp',
        isNullable: true,
        comment: 'Timer de fechamento automático para atendimentos encaminhados ao e-commerce (configurável de 11 min a 1 hora)',
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('attendances', 'ecommerce_closing_at');
  }
}

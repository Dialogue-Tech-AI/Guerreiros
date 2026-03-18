import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Adiciona custom_attributes (JSONB) em function_call_configs para atributos
 * específicos por FC (ex.: ecommerce_whatsapp_number para registrarposvendaecommerce).
 */
export class AddCustomAttributesToFunctionCallConfigs1738500000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'function_call_configs',
      new TableColumn({
        name: 'custom_attributes',
        type: 'jsonb',
        isNullable: true,
        comment:
          'Atributos específicos da FC (ex.: ecommerce_whatsapp_number para setor E-commerce)',
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('function_call_configs', 'custom_attributes');
  }
}

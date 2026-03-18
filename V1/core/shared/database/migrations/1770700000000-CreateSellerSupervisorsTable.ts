import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tabela N:N para vários supervisores verem os mesmos vendedores.
 * Migra dados existentes de sellers.supervisor_id para seller_supervisors.
 */
export class CreateSellerSupervisorsTable1770700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE seller_supervisors (
        seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        supervisor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (seller_id, supervisor_id)
      );
    `);
    await queryRunner.query(`
      CREATE INDEX idx_seller_supervisors_supervisor_id ON seller_supervisors(supervisor_id);
    `);

    // Migrar: quem já tem supervisor_id em sellers vira uma linha em seller_supervisors
    await queryRunner.query(`
      INSERT INTO seller_supervisors (seller_id, supervisor_id)
      SELECT id, supervisor_id FROM sellers WHERE supervisor_id IS NOT NULL
      ON CONFLICT (seller_id, supervisor_id) DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_seller_supervisors_supervisor_id;`);
    await queryRunner.query(`DROP TABLE IF EXISTS seller_supervisors;`);
  }
}

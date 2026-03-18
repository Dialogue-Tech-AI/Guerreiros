import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Unifies biblioteca folders into a single tree by removing folder_type.
 * Prompts and function_calls keep referencing folders by folder_id.
 */
export class UnifyBibliotecaFoldersTree1740000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('biblioteca_folders', 'idx_biblioteca_folders_type');
    await queryRunner.dropColumn('biblioteca_folders', 'folder_type');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "biblioteca_folders" ADD "folder_type" varchar(20) NOT NULL DEFAULT 'prompts'`
    );
    await queryRunner.query(
      `CREATE INDEX "idx_biblioteca_folders_type" ON "biblioteca_folders" ("folder_type")`
    );
  }
}

import { MigrationInterface, QueryRunner, TableForeignKey } from 'typeorm';

/**
 * Altera as FKs folder_id em biblioteca_prompts, biblioteca_function_calls e
 * biblioteca_schemas de ON DELETE SET NULL para ON DELETE CASCADE, para que
 * ao excluir uma pasta os arquivos sejam excluídos em cascata (e não fiquem na raiz).
 */
export class BibliotecaFolderCascadeDelete1740000000003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const tables = [
      'biblioteca_prompts',
      'biblioteca_function_calls',
      'biblioteca_schemas',
    ] as const;

    for (const tableName of tables) {
      const result = await queryRunner.query(
        `SELECT c.conname
         FROM pg_constraint c
         JOIN pg_class t ON c.conrelid = t.oid
         JOIN pg_namespace n ON t.relnamespace = n.oid
         JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey) AND NOT a.attisdropped
         WHERE n.nspname = current_schema()
           AND t.relname = $1
           AND c.contype = 'f'
           AND a.attname = 'folder_id'`,
        [tableName]
      );
      const row = Array.isArray(result) ? result[0] : result?.[0];
      const fkName = row?.conname;
      if (!fkName) continue;
      await queryRunner.dropForeignKey(tableName, fkName);
      await queryRunner.createForeignKey(
        tableName,
        new TableForeignKey({
          name: `fk_${tableName}_folder_id`,
          columnNames: ['folder_id'],
          referencedTableName: 'biblioteca_folders',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        })
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = [
      'biblioteca_prompts',
      'biblioteca_function_calls',
      'biblioteca_schemas',
    ] as const;

    for (const tableName of tables) {
      await queryRunner.dropForeignKey(tableName, `fk_${tableName}_folder_id`);
      await queryRunner.createForeignKey(
        tableName,
        new TableForeignKey({
          columnNames: ['folder_id'],
          referencedTableName: 'biblioteca_folders',
          referencedColumnNames: ['id'],
          onDelete: 'SET NULL',
        })
      );
    }
  }
}

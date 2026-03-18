import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddStatusToMessages1737411000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum type
    await queryRunner.query(`
      CREATE TYPE "message_status_enum" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED');
    `);

    // Add status column with default value SENT for existing messages
    await queryRunner.addColumn(
      'messages',
      new TableColumn({
        name: 'status',
        type: 'message_status_enum',
        default: "'SENT'",
        isNullable: false,
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove status column
    await queryRunner.dropColumn('messages', 'status');

    // Drop enum type
    await queryRunner.query(`DROP TYPE "message_status_enum";`);
  }
}

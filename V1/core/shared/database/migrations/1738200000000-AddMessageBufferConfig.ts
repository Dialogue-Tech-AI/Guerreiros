import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMessageBufferConfig1738200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Insert default message buffer configuration
    await queryRunner.query(`
      INSERT INTO ai_config (key, value, metadata) VALUES
      (
        'message_buffer_config',
        '{"enabled": false, "bufferTimeMs": 5000}',
        '{
          "version": "1.0",
          "description": "Configuração do buffer inteligente de mensagens",
          "schema": {
            "enabled": "boolean - Ativa/desativa o buffer de mensagens",
            "bufferTimeMs": "number - Tempo de buffer em milissegundos (3000-15000)"
          }
        }'
      )
      ON CONFLICT (key) DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove message buffer configuration
    await queryRunner.query(`
      DELETE FROM ai_config WHERE key = 'message_buffer_config';
    `);
  }
}

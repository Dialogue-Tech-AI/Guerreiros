import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateMultiAgentTables1739000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create multi_agent_config table
    await queryRunner.createTable(
      new Table({
        name: 'multi_agent_config',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'is_enabled',
            type: 'boolean',
            default: false,
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
        ],
      }),
      true
    );

    // 2. Create router_agent_config table
    await queryRunner.createTable(
      new Table({
        name: 'router_agent_config',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'prompt',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'model',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'temperature',
            type: 'float',
            default: 0.7,
            isNullable: false,
          },
          {
            name: 'routing_rules',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
        ],
      }),
      true
    );

    // 3. Create specialist_agents table
    await queryRunner.createTable(
      new Table({
        name: 'specialist_agents',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'name',
            type: 'varchar',
            length: '100',
            isUnique: true,
            isNullable: false,
          },
          {
            name: 'prompt',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'model',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'temperature',
            type: 'float',
            default: 0.7,
            isNullable: false,
          },
          {
            name: 'function_call_names',
            type: 'jsonb',
            isNullable: true,
            default: "'[]'",
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
        ],
      }),
      true
    );

    // Create indexes
    await queryRunner.createIndex(
      'specialist_agents',
      new TableIndex({
        name: 'idx_specialist_agents_name',
        columnNames: ['name'],
        isUnique: true,
      })
    );

    await queryRunner.createIndex(
      'specialist_agents',
      new TableIndex({
        name: 'idx_specialist_agents_is_active',
        columnNames: ['is_active'],
      })
    );

    // Insert default values
    await queryRunner.query(`
      INSERT INTO multi_agent_config (is_enabled) VALUES (false)
      ON CONFLICT DO NOTHING;
    `);

    await queryRunner.query(`
      INSERT INTO router_agent_config (prompt, model, temperature, routing_rules) 
      VALUES (
        'Você é um agente roteador. Sua função é analisar mensagens de clientes e classificar a intenção em uma das seguintes categorias:

SAUDACAO - Mensagens de cumprimento simples (Oi, Olá, Bom dia, etc.)
ORCAMENTO_PECA - Pedidos de orçamento, cotação ou busca de peças
ROTEAMENTO - Solicitações para falar com vendedor, balcão ou atendimento humano
POS_VENDA - Questões sobre troca, garantia, devolução, pós-venda
DUVIDA_GERAL - Outras dúvidas ou perguntas gerais

Analise a mensagem do cliente e retorne APENAS a categoria mais adequada. Seja objetivo e preciso.',
        'gpt-4.1',
        0.7,
        NULL
      )
      ON CONFLICT DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('specialist_agents');
    await queryRunner.dropTable('router_agent_config');
    await queryRunner.dropTable('multi_agent_config');
  }
}

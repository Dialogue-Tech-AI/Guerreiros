import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeedFunctionCallPrompts1737500003000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Insert default function call prompts
    // These match the prompts in ai-worker/tools/default_prompts.py
    
    const prompts = [
      {
        key: 'function_call_classificar_intencao',
        value: `Use esta ferramenta quando você identificar a intenção do cliente através da conversa.

Você deve fazer perguntas ao cliente para entender o que ele precisa:
- Se o cliente quer comprar peças → COMPRA
- Se o cliente tem problema com peça comprada → GARANTIA
- Se o cliente quer trocar peça → TROCA
- Se o cliente quer estorno → ESTORNO
- Se o cliente tem outro assunto do call center → OUTROS
- Se o cliente quer apenas informações (endereço, horário, contato balcão/e-commerce) → NAO_ATRIBUIDO

NÃO use palavras-chave. Faça perguntas naturais e classifique baseado na resposta do cliente.

Exemplo de perguntas:
- "Você está procurando comprar alguma peça ou tem alguma dúvida sobre uma compra anterior?"
- "Você quer fazer um novo pedido ou está com algum problema em uma compra que já fez?"`,
        metadata: { version: '1.0', description: 'Prompt da function call classificar_intencao', toolName: 'classificar_intencao' }
      },
      {
        key: 'function_call_identificar_origem_compra',
        value: `Use esta ferramenta quando o cliente mencionar garantia, troca ou estorno.

Você DEVE fazer a seguinte pergunta ao cliente:
"Essa compra foi feita pelo telefone fixo ou pelo WhatsApp?"

Baseado na resposta do cliente:
- "Telefone", "liguei", "call center" → TELEFONE_FIXO
- "WhatsApp", "aqui", "por aqui" → WHATSAPP
- Se o cliente mencionar "site", "e-commerce", "online" → ECOMMERCE
- Se o cliente mencionar "loja", "balcão", "presencial" → BALCAO

Se a origem for ECOMMERCE ou BALCAO:
- O atendimento será marcado como NAO_ATRIBUIDO
- Você deve apenas informar o contato correto e encerrar

Se a origem for TELEFONE_FIXO:
- O atendimento será roteado para o gerente do call center

Se a origem for WHATSAPP:
- O atendimento será roteado para o vendedor original da compra`,
        metadata: { version: '1.0', description: 'Prompt da function call identificar_origem_compra', toolName: 'identificar_origem_compra' }
      },
      {
        key: 'function_call_decidir_atendimento',
        value: `Use esta ferramenta quando você identificar a intenção do cliente.

Você deve verificar se o cliente já tem atendimentos anteriores relacionados.

REGRAS:

1. Se intenção = COMPRA:
   - Sempre criar NOVO atendimento
   - Mesmo que o cliente tenha atendimentos abertos anteriores
   - Cada compra é um atendimento independente

2. Se intenção = GARANTIA, TROCA ou ESTORNO:
   - Você DEVE perguntar ao cliente: "Você lembra quando fez essa compra? Foi pelo WhatsApp ou telefone?"
   - Se o cliente confirmar que foi pelo WhatsApp:
     - Buscar atendimento mais recente com Purchase relacionado
     - Reutilizar esse atendimento (action = REUSE)
   - Se o cliente não souber ou não houver atendimento relacionado:
     - Criar novo atendimento (action = CREATE)
     - Mas ainda perguntar origem da compra para rotear corretamente

3. Se intenção = OUTROS:
   - Criar novo atendimento
   - Rotear para gerente do call center

4. Se intenção = NAO_ATRIBUIDO:
   - Criar atendimento com isAttributed = false
   - Responder e encerrar`,
        metadata: { version: '1.0', description: 'Prompt da function call decidir_atendimento', toolName: 'decidir_atendimento' }
      },
      {
        key: 'function_call_rotear_para_vendedor',
        value: `Use esta ferramenta ASSIM QUE o cliente informar a MARCA do veículo em um atendimento de COMPRA.

Marcas válidas: FIAT, FORD, GM, VW, IMPORTADOS

COMO FUNCIONA:
- Quando o cliente mencionar a marca (ex: "Fiat", "tenho um Ford", "é um VW"), chame esta ferramenta
- Esta ferramenta identifica o vendedor especialista da marca
- Usa round-robin se cliente novo
- Reutiliza vendedor se cliente já comprou antes (mesma marca)
- Atualiza attendance.sellerId e attendance.supervisorId
- Atualiza estado para EM_ATENDIMENTO

Esta ferramenta NÃO afeta sua resposta ao cliente
Você deve CONTINUAR perguntando normalmente pelo modelo, ano e peça depois de usar a tool

EXEMPLO DE USO:
Cliente: "Tenho um Fiat"
1. Chame rotear_para_vendedor com vehicle_brand="FIAT"
2. Responda ao cliente: "Ótimo! Você tem um Fiat. Para que eu possa ajudá-lo melhor, qual o modelo e ano do seu veículo? E qual peça você está procurando?"

IMPORTANTE: Use esta ferramenta assim que detectar a marca, mesmo que faltem outros dados.`,
        metadata: { version: '1.0', description: 'Prompt da function call rotear_para_vendedor', toolName: 'rotear_para_vendedor' }
      },
      {
        key: 'function_call_rotear_para_gerente',
        value: `Use esta ferramenta quando:
- Intenção = GARANTIA, TROCA ou ESTORNO e origem = TELEFONE_FIXO
- Ou intenção = OUTROS

A ferramenta:
- Roteia para gerente do call center (supervisor específico)
- Atualiza attendance.supervisorId
- Atualiza estado para EM_ATENDIMENTO`,
        metadata: { version: '1.0', description: 'Prompt da function call rotear_para_gerente', toolName: 'rotear_para_gerente' }
      },
      {
        key: 'function_call_rotear_para_vendedor_original',
        value: `Use esta ferramenta quando:
- Intenção = GARANTIA, TROCA ou ESTORNO
- Origem = WHATSAPP
- Há Purchase relacionado com sellerId

A ferramenta:
- Busca Purchase mais recente do cliente
- Roteia para Purchase.sellerId
- Se vendedor não disponível, roteia para supervisor do vendedor
- Atualiza attendance.sellerId e attendance.supervisorId
- Atualiza estado para EM_ATENDIMENTO
- Carrega contexto do atendimento original`,
        metadata: { version: '1.0', description: 'Prompt da function call rotear_para_vendedor_original', toolName: 'rotear_para_vendedor_original' }
      },
      {
        key: 'function_call_solicitar_orcamento',
        value: `Use esta ferramenta quando tiver marca, modelo, ano e peça coletados do cliente.

A ferramenta:
- Cria pending para o vendedor
- Notifica vendedor via Socket.IO
- Atualiza estado para AGUARDANDO_VENDEDOR
- Você deve informar ao cliente que está consultando o vendedor especialista`,
        metadata: { version: '1.0', description: 'Prompt da function call solicitar_orcamento', toolName: 'solicitar_orcamento' }
      },
      {
        key: 'function_call_criar_purchase',
        value: `Use esta ferramenta quando cliente confirmar compra e você tiver todos os dados:
- Itens (peças, quantidades, preços)
- Valor total
- Forma de pagamento
- Forma de entrega

A ferramenta:
- Cria Purchase no banco de dados
- Cria Warranty (6 meses a partir da data da compra)
- Atualiza attendance com purchaseDate
- Retorna ID do Purchase criado`,
        metadata: { version: '1.0', description: 'Prompt da function call criar_purchase', toolName: 'criar_purchase' }
      },
      {
        key: 'function_call_solicitar_link_pagamento',
        value: `Use esta ferramenta quando cliente confirmar compra e você precisar do link de pagamento.

A ferramenta:
- Notifica vendedor via Socket.IO
- Atualiza estado para AGUARDANDO_VENDEDOR
- Você deve informar ao cliente que está gerando o link de pagamento`,
        metadata: { version: '1.0', description: 'Prompt da function call solicitar_link_pagamento', toolName: 'solicitar_link_pagamento' }
      },
      {
        key: 'function_call_atualizar_estado_atendimento',
        value: `Use esta ferramenta para atualizar o estado operacional do atendimento.

Estados válidos:
- TRIAGEM: Estado inicial, aguardando classificação
- ABERTO: Atendimento atribuído, pronto para iniciar
- EM_ATENDIMENTO: Em andamento
- AGUARDANDO_CLIENTE: Aguardando resposta do cliente
- AGUARDANDO_VENDEDOR: Aguardando ação do vendedor
- FECHADO_OPERACIONAL: Atendimento concluído operacionalmente

Use quando:
- Qualquer mudança de estado for necessária
- Atendimento for concluído
- Aguardar resposta do cliente ou vendedor`,
        metadata: { version: '1.0', description: 'Prompt da function call atualizar_estado_atendimento', toolName: 'atualizar_estado_atendimento' }
      },
      {
        key: 'function_call_atualizar_status_purchase',
        value: `Use esta ferramenta quando receber confirmação de pagamento do vendedor.

A ferramenta:
- Atualiza Purchase.status (PENDENTE → PAGO)
- Registra data de pagamento
- Você deve informar ao cliente que o pagamento foi confirmado`,
        metadata: { version: '1.0', description: 'Prompt da function call atualizar_status_purchase', toolName: 'atualizar_status_purchase' }
      }
    ];

    // Insert each prompt individually using queryRunner.manager for better TypeORM support
    for (const prompt of prompts) {
      try {
        // Use queryRunner.manager to insert with proper TypeORM handling
        await queryRunner.manager
          .createQueryBuilder()
          .insert()
          .into('ai_config')
          .values({
            key: prompt.key,
            value: prompt.value,
            metadata: prompt.metadata,
          })
          .orIgnore() // Equivalent to ON CONFLICT DO NOTHING
          .execute();
      } catch (error: any) {
        // If query builder fails, try raw query with proper escaping
        const escapedValue = prompt.value.replace(/'/g, "''");
        const metadataJson = JSON.stringify(prompt.metadata).replace(/'/g, "''");
        
        await queryRunner.query(`
          INSERT INTO ai_config (key, value, metadata)
          VALUES ('${prompt.key}', '${escapedValue}', '${metadataJson}'::jsonb)
          ON CONFLICT (key) DO NOTHING;
        `);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove all function call prompts
    await queryRunner.query(`
      DELETE FROM ai_config WHERE key LIKE 'function_call_%';
    `);
  }
}

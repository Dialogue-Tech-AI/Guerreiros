/**
 * Seed opcional: insere processos de exemplo (somente leitura na UI).
 * Executar após a migration CreateProcessesAndLinkToFunctionCallConfigs.
 * Os processos descrevem "a partir do acionamento X com as informações Y o sistema faz Z".
 * Reexecutar o script insere apenas processos cujo nome ainda não existe.
 */
import 'reflect-metadata';
import { loadEnv } from '../../../services/backend/src/config/load-env';

// Carrega sempre o .env unificado com flags DEV/PROD
loadEnv();

import { AppDataSource } from '../../../services/backend/src/shared/infrastructure/database/typeorm/config/database.config';
import { Process } from '../../../services/backend/src/modules/ai/domain/entities/process.entity';

const PROCESSES_TO_SEED: Partial<Process>[] = [
  {
    name: 'pedido-orcamento',
    description: `Objetivo: Criar e encaminhar um pedido de orçamento com base nas informações fornecidas pelo cliente durante o atendimento.

Informações obrigatórias: modelo-do-carro, marca-do-carro, ano-do-carro, peca-desejada, resumo-do-atendimento.
Informação opcional: placa.

Ações ao acionar:
- Movimentação: atendimento sai da Triagem e é encaminhado para o vendedor responsável pela marca informada.
- Card (lado direito): exibir modelo, marca, ano, peça desejada, resumo do atendimento, placa (se informada).
- Demandas → Pedidos de Orçamento: criar novo item.

Integração com Function Call: se houver atributo personalizado "numero" (número de fato), enviar dados do pedido para esse número. Se a FC estiver desativada, o envio não ocorre.`,
    triggerFunctionCallName: 'pedidoorcamento',
    requiredInputs: ['modelo-do-carro', 'marca-do-carro', 'ano-do-carro', 'peca-desejada', 'resumo-do-atendimento'],
    optionalInputs: ['placa'],
  },
];

async function seedProcesses() {
  await AppDataSource.initialize();
  const repo = AppDataSource.getRepository(Process);
  let inserted = 0;
  for (const p of PROCESSES_TO_SEED) {
    const existing = await repo.findOne({ where: { name: p.name! } });
    if (existing) {
      if (p.name === 'pedido-orcamento') {
        await repo.update(
          { name: 'pedido-orcamento' },
          {
            requiredInputs: ['modelo-do-carro', 'marca-do-carro', 'ano-do-carro', 'peca-desejada', 'resumo-do-atendimento'],
            optionalInputs: ['placa'],
          }
        );
        console.log('Processo pedido-orcamento atualizado: obrigatórios e opcionais corrigidos.');
      }
      continue;
    }
    await repo.save(repo.create(p as Process));
    inserted++;
    console.log('Inserido processo:', p.name);
  }
  if (inserted === 0) {
    console.log('Nenhum processo novo para inserir.');
  } else {
    console.log('Seed de processos:', inserted, 'processo(s) inserido(s).');
  }
  await AppDataSource.destroy();
}

seedProcesses().catch((e) => {
  console.error(e);
  process.exit(1);
});

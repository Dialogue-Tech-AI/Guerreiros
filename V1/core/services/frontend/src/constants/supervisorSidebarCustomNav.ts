/**
 * Destinos permitidos para atalhos personalizados na Entrada do supervisor.
 * Cada ID mapeia para um fluxo já implementado em DashboardPage (sem novas filas no backend).
 */

/** MIME usado no drag de conversas na vista supervisor (mesmo valor em DashboardPage). */
export const SUPERVISOR_DRAG_ATTENDANCE_MIME = 'application/x-supervisor-attendance-id';

/** Destinos que `supervisorMoveQueue` aceita via drag a partir de atalhos da sidebar personalizada. */
export type SupervisorNavMoveDropTarget =
  | { kind: 'nao_atribuidos'; bucket: 'triagem' | 'encaminhados-ecommerce' | 'encaminhados-balcao' }
  | { kind: 'intervencao'; interventionType: 'demanda-telefone-fixo' | 'protese-capilar' | 'outros-assuntos' };

const SERVICE_NAV_TARGET_TO_INTERVENTION: Record<
  string,
  'demanda-telefone-fixo' | 'protese-capilar' | 'outros-assuntos'
> = {
  'service-PROTESE_CAPILAR': 'protese-capilar',
  'service-MANUTENCAO': 'demanda-telefone-fixo',
  'service-OUTROS_ASSUNTOS': 'outros-assuntos',
};

export const SUPERVISOR_SIDEBAR_NAV_TARGET_IDS = [
  'abertos',
  'nao-atribuidos-todos',
  'nao-atribuidos-triagem',
  'nao-atribuidos-encaminhados-ecommerce',
  'nao-atribuidos-encaminhados-balcao',
  'intervencao-humana-root',
  'service-PROTESE_CAPILAR',
  'service-MANUTENCAO',
  'service-OUTROS_ASSUNTOS',
  'follow-up-root',
  'follow-up-manual-pending',
  'follow-up-manual-sent',
  'follow-up-inativo-1h',
  'follow-up-inativo-12h',
  'follow-up-inativo-24h',
  'fechados',
  'demandas-all',
  'demanda-pedidos-orcamentos',
  'demanda-perguntas-pos-orcamento',
  'demanda-confirmacao-pix',
  'demanda-tirar-pedido',
  'demanda-informacoes-entrega',
  'demanda-encomendas',
  'demanda-cliente-pediu-humano',
] as const;

export type SupervisorSidebarNavTargetId = (typeof SUPERVISOR_SIDEBAR_NAV_TARGET_IDS)[number];

export const SUPERVISOR_SIDEBAR_NAV_TARGET_ID_SET = new Set<string>(SUPERVISOR_SIDEBAR_NAV_TARGET_IDS);

/**
 * Converte o destino do atalho no payload de mover fila, ou null se o destino não suportar drop (follow-up, demandas sem vendedor, fechados, etc.).
 */
export function supervisorNavTargetIdToMoveDrop(targetId: string): SupervisorNavMoveDropTarget | null {
  if (!SUPERVISOR_SIDEBAR_NAV_TARGET_ID_SET.has(targetId)) return null;

  switch (targetId) {
    case 'abertos':
    case 'nao-atribuidos-todos':
    case 'nao-atribuidos-triagem':
      return { kind: 'nao_atribuidos', bucket: 'triagem' };
    case 'nao-atribuidos-encaminhados-ecommerce':
      return { kind: 'nao_atribuidos', bucket: 'encaminhados-ecommerce' };
    case 'nao-atribuidos-encaminhados-balcao':
      return { kind: 'nao_atribuidos', bucket: 'encaminhados-balcao' };
    case 'intervencao-humana-root':
      return { kind: 'intervencao', interventionType: 'demanda-telefone-fixo' };
    default:
      break;
  }

  const intervention = SERVICE_NAV_TARGET_TO_INTERVENTION[targetId];
  if (intervention) return { kind: 'intervencao', interventionType: intervention };

  return null;
}

/** Agrupamento para o seletor no modal de edição */
export const SUPERVISOR_SIDEBAR_TARGET_GROUPS: { group: string; options: { id: SupervisorSidebarNavTargetId; label: string }[] }[] =
  [
    {
      group: 'Atendimentos',
      options: [
        { id: 'abertos', label: 'Abertos' },
        { id: 'nao-atribuidos-todos', label: 'Não atribuídos — Todos (AI)' },
        { id: 'nao-atribuidos-triagem', label: 'Não atribuídos — Triagem' },
        { id: 'nao-atribuidos-encaminhados-ecommerce', label: 'Não atribuídos — Encaminhados E-commerce' },
        { id: 'nao-atribuidos-encaminhados-balcao', label: 'Não atribuídos — Encaminhados Balcão' },
        { id: 'intervencao-humana-root', label: 'Intervenção humana (visão geral)' },
        { id: 'service-PROTESE_CAPILAR', label: 'Serviço — Prótese capilar' },
        { id: 'service-MANUTENCAO', label: 'Serviço — Manutenção' },
        { id: 'service-OUTROS_ASSUNTOS', label: 'Serviço — Outros assuntos' },
        { id: 'fechados', label: 'Fechados' },
      ],
    },
    {
      group: 'Follow-up manual',
      options: [
        { id: 'follow-up-manual-pending', label: 'Aguardando follow up' },
        { id: 'follow-up-manual-sent', label: 'Follow up enviado' },
        { id: 'follow-up-root', label: 'Follow up (atalho legado → aguardando)' },
        { id: 'follow-up-inativo-1h', label: 'Legado — Aguardando 1º' },
        { id: 'follow-up-inativo-12h', label: 'Legado — Aguardando 2º' },
        { id: 'follow-up-inativo-24h', label: 'Legado — Aguardando' },
      ],
    },
    {
      group: 'Todas as demandas',
      options: [
        { id: 'demandas-all', label: 'Todas as demandas (lista única)' },
        { id: 'demanda-pedidos-orcamentos', label: 'Pedidos de orçamentos' },
        { id: 'demanda-perguntas-pos-orcamento', label: 'Perguntas pós-orçamento' },
        { id: 'demanda-confirmacao-pix', label: 'Confirmação Pix' },
        { id: 'demanda-tirar-pedido', label: 'Tirar pedido' },
        { id: 'demanda-informacoes-entrega', label: 'Informações sobre entrega' },
        { id: 'demanda-encomendas', label: 'Encomendas' },
        { id: 'demanda-cliente-pediu-humano', label: 'Cliente pediu humano' },
      ],
    },
  ];

/** Chave em division_subdivision_ui para aplicar o mesmo estilo activo (se existir personalização) */
export function divisionUiKeyForSupervisorNavTarget(targetId: string): string | undefined {
  const m: Record<string, string> = {
    abertos: 'abertos',
    'nao-atribuidos-todos': 'nao-atribuidos-ai',
    'nao-atribuidos-triagem': 'triagem',
    'nao-atribuidos-encaminhados-ecommerce': 'encaminhados-ecommerce',
    'nao-atribuidos-encaminhados-balcao': 'encaminhados-balcao',
    'intervencao-humana-root': 'intervencao-humana',
    'service-PROTESE_CAPILAR': 'service-PROTESE_CAPILAR',
    'service-MANUTENCAO': 'service-MANUTENCAO',
    'service-OUTROS_ASSUNTOS': 'service-OUTROS_ASSUNTOS',
    'follow-up-root': 'manual-pending',
    'follow-up-manual-pending': 'manual-pending',
    'follow-up-manual-sent': 'manual-sent',
    'follow-up-inativo-1h': 'manual-pending',
    'follow-up-inativo-12h': 'manual-pending',
    'follow-up-inativo-24h': 'manual-pending',
    fechados: 'fechados',
    'demanda-pedidos-orcamentos': 'pedidos-orcamentos',
    'demanda-perguntas-pos-orcamento': 'perguntas-pos-orcamento',
    'demanda-confirmacao-pix': 'confirmacao-pix',
    'demanda-tirar-pedido': 'tirar-pedido',
    'demanda-informacoes-entrega': 'informacoes-entrega',
    'demanda-encomendas': 'encomendas',
    'demanda-cliente-pediu-humano': 'cliente-pediu-humano',
  };
  return m[targetId];
}

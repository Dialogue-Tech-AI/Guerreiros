/**
 * Chaves estáveis para personalização de nome e cores na entrada (supervisor).
 * Devem coincidir com as usadas em Supervisor/DashboardPage.
 */
export interface DivisionUiDefinition {
  key: string;
  defaultLabel: string;
  group: string;
}

export const DIVISION_UI_DEFINITIONS: DivisionUiDefinition[] = [
  { group: 'Atendimentos', key: 'abertos', defaultLabel: 'Abertos' },
  { group: 'Atendimentos', key: 'nao-atribuidos-ai', defaultLabel: 'AI' },
  { group: 'Atendimentos', key: 'intervencao-humana', defaultLabel: 'Intervenção Humana' },
  { group: 'Serviços (Intervenção)', key: 'service-PROTESE_CAPILAR', defaultLabel: 'Prótese capilar' },
  { group: 'Serviços (Intervenção)', key: 'service-MANUTENCAO', defaultLabel: 'Manutenção' },
  { group: 'Serviços (Intervenção)', key: 'service-OUTROS_ASSUNTOS', defaultLabel: 'Outros assuntos' },
  { group: 'Follow-up manual', key: 'manual-pending', defaultLabel: 'Aguardando follow up' },
  { group: 'Follow-up manual', key: 'manual-sent', defaultLabel: 'Follow up enviado' },
  { group: 'Follow-up (legado)', key: 'follow-up', defaultLabel: 'Follow up' },
  { group: 'Follow-up (legado)', key: 'inativo-1h', defaultLabel: 'Aguardando 1º Follow up' },
  { group: 'Follow-up (legado)', key: 'inativo-12h', defaultLabel: 'Aguardando 2º Follow up' },
  { group: 'Follow-up (legado)', key: 'inativo-24h', defaultLabel: 'Aguardando' },
  { group: 'Atendimentos', key: 'fechados', defaultLabel: 'Fechados' },
  { group: 'Subdivisões AI', key: 'triagem', defaultLabel: 'Triagem' },
  { group: 'Subdivisões AI', key: 'encaminhados-ecommerce', defaultLabel: 'Encaminhados E-commerce' },
  { group: 'Subdivisões AI', key: 'encaminhados-balcao', defaultLabel: 'Encaminhados Balcão' },
  { group: 'Demandas / Vendedor (subdivisões)', key: 'pedidos-orcamentos', defaultLabel: 'Pedidos de Orçamentos' },
  { group: 'Demandas / Vendedor (subdivisões)', key: 'perguntas-pos-orcamento', defaultLabel: 'Perguntas Pós Orçamento' },
  { group: 'Demandas / Vendedor (subdivisões)', key: 'confirmacao-pix', defaultLabel: 'Confirmação Pix' },
  { group: 'Demandas / Vendedor (subdivisões)', key: 'tirar-pedido', defaultLabel: 'Tirar Pedido' },
  { group: 'Demandas / Vendedor (subdivisões)', key: 'informacoes-entrega', defaultLabel: 'Informações sobre Entrega' },
  { group: 'Demandas / Vendedor (subdivisões)', key: 'encomendas', defaultLabel: 'Encomendas' },
  { group: 'Demandas / Vendedor (subdivisões)', key: 'cliente-pediu-humano', defaultLabel: 'Cliente pediu Humano' },
];

export function getDivisionUiDefaultLabel(key: string): string {
  return DIVISION_UI_DEFINITIONS.find((d) => d.key === key)?.defaultLabel ?? key;
}

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { aiCostService, type AiCostRow, type AiCostsResponse } from '../../services/ai-cost.service';
import { socketService } from '../../services/socket.service';
import toast from 'react-hot-toast';

const PAGE_SIZE = 30;
const POLL_INTERVAL_MS = 12_000;

function LogSection({
  icon,
  title,
  children,
  defaultOpen = false,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full px-4 py-2.5 flex items-center justify-between text-left text-sm font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50"
      >
        <span className="flex items-center gap-2">
          <span className="material-icons-outlined text-base opacity-70">{icon}</span>
          {title}
        </span>
        <span className="material-icons-outlined text-lg text-slate-400">{open ? 'expand_less' : 'expand_more'}</span>
      </button>
      {open && <div className="px-4 py-3 pt-0 border-t border-slate-100 dark:border-slate-800">{children}</div>}
    </div>
  );
}

function ExecutionLogView({ log }: { log: Record<string, unknown> }) {
  const [showRawToolsAvailable, setShowRawToolsAvailable] = useState(false);
  const [showRawTokens, setShowRawTokens] = useState(false);

  const routing = (log.routing as unknown[]) || [];
  const specialist = log.specialist as Record<string, unknown> | undefined;
  const configuredPrompt = typeof log.configuredPrompt === 'string' ? log.configuredPrompt : '';
  const universalPrompt = typeof log.universalPrompt === 'string' ? log.universalPrompt : '';
  const conversationHistory = typeof log.conversationHistory === 'string' ? log.conversationHistory : '';
  const systemAdditions = log.systemAdditions as Record<string, unknown> | undefined;
  const systemContextText = typeof (log.systemContextText as any) === 'string' ? String(log.systemContextText) : '';
  // systemFinalInstructions removido dos logs - já exibidas no sistema
  const finalPrompt = typeof log.finalPrompt === 'string' ? log.finalPrompt : '';
  const openaiPayload = log.openaiPayload as Record<string, unknown> | undefined;
  const toolsAvailable = (log.toolsAvailable as unknown[]) || [];
  const toolsUsed = (log.toolsUsed as unknown[]) || [];
  const tokens = log.tokens as Record<string, unknown> | undefined;

  const routingSummary = (() => {
    if (!routing || routing.length === 0) return '';
    const r0 = routing[0] as Record<string, unknown>;
    const from = String(r0.name ?? 'Router');
    const to =
      String((r0.agentChosen as string) ?? '').trim() ||
      String((r0.decision as string) ?? '').trim() ||
      '—';
    return `${from} → ${to}`;
  })();

  // Montagem determinística: o que vem do painel é SEMPRE painel.
  // Nada aqui tenta “adivinhar” pelo conteúdo do prompt final.
  // Ordem visual (de cima para baixo) como solicitado:
  // Contexto adicionado pelo sistema → Final adicionado pelo sistema → Prompt Universal → Prompt do Especialista
  // IMPORTANTE: universalPrompt e configuredPrompt vêm do backend já separados (fonte externa)
  const promptParts: Array<{
    text: string;
    origin: 'painel' | 'sistema';
    kind: 'specialist' | 'universal' | 'system_context' | 'system_final';
    label: string;
  }> = [
    { text: systemContextText, origin: 'sistema', kind: 'system_context', label: 'Sistema: Contexto adicionado ao prompt' },
    // systemFinalInstructions removido - já exibidas no sistema
    { text: universalPrompt || '', origin: 'painel', kind: 'universal', label: 'Painel: Prompt Universal' },
    { text: configuredPrompt || '', origin: 'painel', kind: 'specialist', label: 'Painel: Prompt do Especialista' },
  ].filter((p) => (p.text || '').trim().length > 0);

  return (
    <div className="space-y-3">
      {routing.length > 0 && (
        <LogSection icon="push_pin" title="🧭 Roteamento">
          {routingSummary && (
            <div className="mb-3 text-xs">
              <span className="px-2 py-0.5 rounded font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                {routingSummary}
              </span>
            </div>
          )}
          <div className="space-y-3 text-xs">
            {routing.map((r: Record<string, unknown>, i: number) => (
              <div key={i} className="rounded bg-slate-50 dark:bg-slate-800/50 p-3 space-y-1">
                <div><span className="font-semibold text-slate-600 dark:text-slate-400">Router:</span> {String(r.name ?? '—')}</div>
                <div><span className="font-semibold">Mensagem recebida:</span><pre className="mt-1 whitespace-pre-wrap break-words text-slate-700 dark:text-slate-300">{String(r.messageReceived ?? '—')}</pre></div>
                <div><span className="font-semibold">Contexto:</span><pre className="mt-1 whitespace-pre-wrap break-words text-slate-600 dark:text-slate-400 max-h-32 overflow-y-auto">{String(r.contextReceived ?? '—')}</pre></div>
                <div><span className="font-semibold">Decisão:</span> {String(r.decision ?? '—')} · Agente: {String(r.agentChosen ?? '—')} {r.tag ? `· TAG: ${String(r.tag)}` : ''}</div>
              </div>
            ))}
          </div>
        </LogSection>
      )}
      {finalPrompt && (
        <LogSection icon="psychology" title="🧠 Prompt">
          <div className="space-y-3">
            <div className="flex items-center gap-3 mb-3 p-2 rounded bg-slate-50 dark:bg-slate-800/50 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-600 text-white">PAINEL - ESPECIALISTA</span>
                <span className="text-xs text-slate-600 dark:text-slate-400">= Prompt do especialista</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-600 text-white">PAINEL - UNIVERSAL</span>
                <span className="text-xs text-slate-600 dark:text-slate-400">= Prompt universal</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-orange-600 text-white">SISTEMA</span>
                <span className="text-xs text-slate-600 dark:text-slate-400">= Adicionado automaticamente</span>
              </div>
            </div>
            {promptParts.length > 0 ? (
              <div className="space-y-2">
                {promptParts.map((part, idx) => {
                  let borderColor = '#F07000';
                  let bgColor = '#FFF4E6';
                  let badgeColor = 'bg-orange-600';
                  let badgeText = 'SISTEMA';

                  if (part.origin === 'painel' && part.kind === 'specialist') {
                    borderColor = '#3B82F6';
                    bgColor = '#DBEAFE';
                    badgeColor = 'bg-blue-600';
                    badgeText = 'PAINEL - ESPECIALISTA';
                  } else if (part.origin === 'painel' && part.kind === 'universal') {
                    borderColor = '#8B5CF6';
                    bgColor = '#F3E8FF';
                    badgeColor = 'bg-purple-600';
                    badgeText = 'PAINEL - UNIVERSAL';
                  } else if (part.origin === 'sistema') {
                    borderColor = '#F07000';
                    bgColor = '#FFF4E6';
                    badgeColor = 'bg-orange-600';
                    badgeText = 'SISTEMA';
                  }

                  return (
                    <div key={idx} className="rounded-lg border-2 overflow-hidden" style={{ borderColor }}>
                      <div className="px-3 py-1.5 flex items-center justify-between" style={{ backgroundColor: bgColor }}>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${badgeColor} text-white`}>
                            {badgeText}
                          </span>
                          <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{part.label}</span>
                        </div>
                      </div>
                      <pre className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words p-3 bg-white dark:bg-slate-900 max-h-64 overflow-y-auto">
                        {part.text}
                      </pre>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div>
                <div className="mb-2 p-2 rounded bg-slate-50 dark:bg-slate-800/50">
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-600 text-white">PROMPT COMPLETO</span>
                </div>
                <pre className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words max-h-96 overflow-y-auto bg-slate-50 dark:bg-slate-800/50 p-3 rounded">{finalPrompt}</pre>
              </div>
            )}
          </div>
        </LogSection>
      )}
      {conversationHistory && (
        <LogSection icon="history" title="💬 Histórico da Conversa">
          <pre className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words max-h-96 overflow-y-auto bg-slate-50 dark:bg-slate-800/50 p-3 rounded">{conversationHistory}</pre>
        </LogSection>
      )}
      {openaiPayload && (
        <LogSection icon="api" title="🌐 Payload OpenAI (Como foi enviado)">
          <div className="text-xs space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div><span className="font-semibold">Modelo:</span> <span className="font-mono">{String((openaiPayload.model as string) ?? '—')}</span></div>
              <div><span className="font-semibold">Temperatura:</span> <span className="font-mono">{String(openaiPayload.temperature ?? '—')}</span></div>
              {openaiPayload.max_tokens != null && (
                <div><span className="font-semibold">Max Tokens:</span> <span className="font-mono">{String(openaiPayload.max_tokens)}</span></div>
              )}
              {openaiPayload.top_p != null && (
                <div><span className="font-semibold">Top P:</span> <span className="font-mono">{String(openaiPayload.top_p)}</span></div>
              )}
              {openaiPayload.frequency_penalty != null && (
                <div><span className="font-semibold">Frequency Penalty:</span> <span className="font-mono">{String(openaiPayload.frequency_penalty)}</span></div>
              )}
              {openaiPayload.presence_penalty != null && (
                <div><span className="font-semibold">Presence Penalty:</span> <span className="font-mono">{String(openaiPayload.presence_penalty)}</span></div>
              )}
            </div>
            <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
              <div className="font-semibold mb-2">Mensagens:</div>
              {openaiPayload.messages && Array.isArray(openaiPayload.messages) && (
                <div className="space-y-2">
                  {openaiPayload.messages.map((msg: Record<string, unknown>, i: number) => (
                    <div key={i} className="rounded bg-slate-50 dark:bg-slate-800/50 p-2 border-l-4" style={{ borderColor: msg.role === 'system' ? '#F07000' : msg.role === 'user' ? '#3B82F6' : '#10B981' }}>
                      <div className="font-mono font-semibold text-[11px] uppercase mb-1" style={{ color: msg.role === 'system' ? '#F07000' : msg.role === 'user' ? '#3B82F6' : '#10B981' }}>
                        {String(msg.role ?? 'unknown')}
                      </div>
                      <pre className="mt-1 whitespace-pre-wrap break-words text-slate-700 dark:text-slate-300 text-xs">{String(msg.content ?? '')}</pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
              <div className="font-semibold mb-2">Metadados Completos:</div>
              <pre className="text-[11px] bg-slate-50 dark:bg-slate-800/50 p-2 rounded overflow-x-auto">
                {JSON.stringify(openaiPayload, null, 2)}
              </pre>
            </div>
          </div>
        </LogSection>
      )}
      {toolsAvailable.length > 0 && (
        <LogSection icon="build" title="🧰 Tools Disponíveis">
          <div className="flex items-center justify-end mb-2">
            <button
              type="button"
              onClick={() => setShowRawToolsAvailable((v) => !v)}
              className="text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50"
            >
              {showRawToolsAvailable ? 'Ver bonito' : 'Ver RAW'}
            </button>
          </div>

          {showRawToolsAvailable ? (
            <pre className="text-[11px] bg-slate-50 dark:bg-slate-800/50 p-2 rounded overflow-x-auto">
              {JSON.stringify(toolsAvailable, null, 2)}
            </pre>
          ) : (
            <div className="space-y-3">
              {toolsAvailable.map((t: Record<string, unknown>, i: number) => {
                const name = String(t.name ?? '?');
                const desc = String(t.description ?? '');
                const params = (t.parameters as Record<string, unknown>) || {};

                // Formatar descrição da ferramenta em texto legível (não JSON)
                const formatToolDescription = (raw: string): string => {
                  if (!raw) return '';

                  let text = raw;

                  // Nome da função
                  text = text.replace(/<Function name="([^"]+)">/i, (_m, fn) => `Função: ${fn}\n`);

                  // Blocos principais
                  text = text.replace(/<QuandoUsar>\s*([\s\S]*?)\s*<\/QuandoUsar>/i, (_m, p1) => `\nQuando usar:\n${p1.trim()}\n`);
                  text = text.replace(/<Objetivo>\s*([\s\S]*?)\s*<\/Objetivo>/i, (_m, p1) => `\nObjetivo:\n${p1.trim()}\n`);
                  text = text.replace(/<DadosObrigatorios>\s*([\s\S]*?)\s*<\/DadosObrigatorios>/i, (_m, p1) => `\nDados obrigatórios:\n${p1.trim()}\n`);
                  text = text.replace(/<DadosOpcionais>\s*([\s\S]*?)\s*<\/DadosOpcionais>/i, (_m, p1) => `\nDados opcionais:\n${p1.trim()}\n`);
                  text = text.replace(/<MomentoDeExecucao>\s*([\s\S]*?)\s*<\/MomentoDeExecucao>/i, (_m, p1) => `\nMomento de execução:\n${p1.trim()}\n`);
                  text = text.replace(/<InvocacaoDaFerramenta>\s*([\s\S]*?)\s*<\/InvocacaoDaFerramenta>/i, (_m, p1) => `\nComo o agente deve invocar:\n${p1.trim()}\n`);

                  // Remove quaisquer outras tags que possam ter sobrado
                  text = text.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ');

                  return text.trim();
                };

                // Formatar descrição de parâmetro de forma mais legível
                const formatParamDescription = (desc: string): string => {
                  if (!desc) return '';
                  
                  // Remove ou reformata partes confusas
                  let formatted = desc;
                  
                  // Remove completamente referências a arrays vazios e estruturas confusas
                  formatted = formatted.replace(/Objeto JSON com as chaves exatas:\s*\[\]\s*,?\s*\[\]\s*\.?\s*/gi, '');
                  formatted = formatted.replace(/Objeto JSON com as chaves exatas:\s*\[\]\s*\.?\s*/gi, '');
                  formatted = formatted.replace(/chaves exatas:\s*\[\]\s*,?\s*\[\]\s*/gi, '');
                  formatted = formatted.replace(/chaves exatas:\s*\[\]\s*/gi, '');
                  formatted = formatted.replace(/Obrigatórias:\s*\[\]\s*\.?\s*/gi, '');
                  formatted = formatted.replace(/Opcionais:\s*\[\]\s*\.?\s*/gi, '');
                  formatted = formatted.replace(/Obrigatórias:\s*\[\]\s*/gi, '');
                  formatted = formatted.replace(/Opcionais:\s*\[\]\s*/gi, '');
                  
                  // Remove frases vazias ou sem sentido
                  formatted = formatted.replace(/\.\s*\./g, '.');
                  formatted = formatted.replace(/^\s*\.\s*/g, '');
                  
                  // Reformata instruções importantes de forma mais clara e amigável
                  formatted = formatted.replace(/OBRIGATÓRIO\.\s*/gi, '');
                  formatted = formatted.replace(/Acione a FC só quando/gi, 'A ferramenta deve ser acionada apenas quando');
                  formatted = formatted.replace(/Nunca invoque com data vazio/gi, 'Nunca invoque esta ferramenta com dados vazios');
                  formatted = formatted.replace(/Preencha as obrigatórias com dados extraídos da conversa/gi, 'Preencha os campos obrigatórios com informações extraídas da conversa');
                  formatted = formatted.replace(/opcionais se tiver/gi, 'campos opcionais apenas se disponíveis');
                  formatted = formatted.replace(/se tiver/gi, 'se disponível');
                  
                  // Limpa espaços múltiplos e pontuação duplicada
                  formatted = formatted.replace(/\s{2,}/g, ' ').trim();
                  
                  // Remove frases que não fazem sentido sem contexto
                  if (formatted.match(/^\.\s*$/)) {
                    return '';
                  }
                  
                  return formatted;
                };

                // Formatar schema de forma legível e hierárquica
                const formatSchema = (schema: Record<string, unknown>, indent = 0): string => {
                  if (!schema || Object.keys(schema).length === 0) return 'Sem parâmetros';

                  const type = String(schema.type || 'object');
                  const title = String(schema.title || '');
                  const description = String(schema.description || '');
                  const properties = (schema.properties as Record<string, unknown>) || {};
                  const required = (schema.required as string[]) || [];
                  const prefix = indent > 0 ? '  '.repeat(indent) : '';
                  const subPrefix = indent > 0 ? '  '.repeat(indent + 1) : '  ';

                  let result = '';
                  
                  // Título (apenas no nível raiz)
                  if (title && indent === 0) {
                    result += `📋 ${title}\n`;
                  }

                  // Tipo (apenas no nível raiz)
                  if (type && indent === 0) {
                    const readableType = type === 'object' ? 'Objeto (estrutura de dados)' : 
                                       type === 'string' ? 'Texto' :
                                       type === 'number' ? 'Número' :
                                       type === 'boolean' ? 'Sim/Não' :
                                       type === 'array' ? 'Lista' : type;
                    result += `Tipo: ${readableType}\n`;
                  }

                  // Propriedades
                  if (Object.keys(properties).length > 0) {
                    if (indent === 0) {
                      result += '\n📝 Campos que podem ser enviados:\n';
                    }
                    
                    const propEntries = Object.entries(properties);
                    propEntries.forEach(([key, prop], idx) => {
                      const propObj = prop as Record<string, unknown>;
                      const propType = String(propObj.type || 'string');
                      const propDesc = String(propObj.description || '');
                      const propTitle = String(propObj.title || '');
                      const propRequired = (propObj.required as string[]) || [];
                      const propProperties = (propObj.properties as Record<string, unknown>) || {};
                      const isRequired = required.includes(key);
                      
                      // Tipo legível
                      const readableType = propType === 'object' ? 'Objeto' : 
                                         propType === 'string' ? 'Texto' :
                                         propType === 'number' ? 'Número' :
                                         propType === 'boolean' ? 'Sim/Não' :
                                         propType === 'array' ? 'Lista' : propType;
                      
                      // Badge de obrigatório/opcional
                      const badge = isRequired ? '🔴 OBRIGATÓRIO' : '🟢 Opcional';
                      
                      // Símbolo visual para hierarquia
                      const connector = idx === propEntries.length - 1 ? '└─' : '├─';
                      
                      result += `\n${prefix}${connector} ${key}`;
                      result += ` (${readableType})`;
                      result += ` → ${badge}`;
                      
                      // Título do campo se existir
                      if (propTitle) {
                        result += `\n${subPrefix}   📌 ${propTitle}`;
                      }
                      
                      // Descrição formatada
                      if (propDesc) {
                        const cleanPropDesc = formatParamDescription(propDesc);
                        if (cleanPropDesc && cleanPropDesc.length > 0) {
                          // Remove partes redundantes ou vazias
                          if (!cleanPropDesc.match(/^OBJETO JSON/i) && 
                              !cleanPropDesc.match(/^\[\]/) &&
                              cleanPropDesc.length > 5) {
                            // Quebra em linhas para melhor legibilidade
                            const sentences = cleanPropDesc.split(/[.!?]+/).filter(s => s.trim().length > 0);
                            if (sentences.length > 0) {
                              result += `\n${subPrefix}   ℹ️  ${sentences.map(s => s.trim() + '.').join('\n' + subPrefix + '   ℹ️  ')}`;
                            }
                          }
                        }
                      }
                      
                      // Propriedades aninhadas (objetos dentro de objetos)
                      if (propType === 'object' && Object.keys(propProperties).length > 0) {
                        result += `\n${subPrefix}   ┌─ Este objeto contém os seguintes subcampos:`;
                        const nestedSchema = {
                          ...propObj,
                          properties: propProperties,
                          required: propRequired,
                        };
                        const nestedResult = formatSchema(nestedSchema, indent + 2);
                        // Adiciona apenas as linhas relevantes (pula título/tipo se houver)
                        const nestedLines = nestedResult.split('\n').filter(l => 
                          l.includes('├─') || l.includes('└─') || l.includes('📌') || l.includes('ℹ️')
                        );
                        if (nestedLines.length > 0) {
                          result += '\n' + nestedLines.join('\n');
                        }
                      }
                    });
                  } else if (indent === 0) {
                    // Se não há propriedades mas há descrição, mostra instruções
                    if (description) {
                      const cleanDesc = formatParamDescription(description);
                      if (cleanDesc && cleanDesc.length > 0) {
                        result += `\n📌 Instruções de uso:\n${cleanDesc}`;
                      }
                    } else {
                      result += '\n⚠️ Esta ferramenta não requer parâmetros específicos.';
                    }
                  }

                  return result.trim();
                };

                const prettyDesc = formatToolDescription(desc);

                return (
                  <div key={i} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="font-mono font-semibold text-xs text-slate-900 dark:text-slate-100">{name}</div>
                        {prettyDesc && (
                          <pre className="mt-1 text-xs text-slate-600 dark:text-slate-400 whitespace-pre-wrap">
                            {prettyDesc}
                          </pre>
                        )}
                      </div>
                    </div>
                    {params && Object.keys(params).length > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                        <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-2">Schema (parâmetros)</div>
                        <pre className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap bg-slate-50 dark:bg-slate-800/50 p-2 rounded">
                          {formatSchema(params)}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </LogSection>
      )}
      {toolsUsed.length > 0 && (
        <LogSection icon="settings" title="⚙️ Tools Utilizadas">
          <ul className="text-xs space-y-2">
            {toolsUsed.map((u: Record<string, unknown>, i: number) => (
              <li key={i} className="rounded bg-slate-50 dark:bg-slate-800/50 p-2">
                <span className="font-mono font-semibold">{String(u.name ?? '?')}</span>
                {u.arguments && <pre className="mt-1 text-[11px] overflow-x-auto">Args: {JSON.stringify(u.arguments, null, 2)}</pre>}
                {u.result != null && <pre className="mt-1 whitespace-pre-wrap break-words text-slate-600 dark:text-slate-400">Result: {String(u.result)}</pre>}
                <span className={u.success ? 'text-emerald-600' : 'text-red-600'}>{u.success ? '✓ Sucesso' : '✗ Erro'}</span>
              </li>
            ))}
          </ul>
        </LogSection>
      )}
      {tokens && (
        <LogSection icon="analytics" title="📊 Tokens e Custos">
          <div className="flex items-center justify-end mb-2">
            <button
              type="button"
              onClick={() => setShowRawTokens((v) => !v)}
              className="text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50"
            >
              {showRawTokens ? 'Ver bonito' : 'Ver RAW'}
            </button>
          </div>

          {showRawTokens ? (
            <pre className="text-[11px] bg-slate-50 dark:bg-slate-800/50 p-2 rounded overflow-x-auto">
              {JSON.stringify(tokens, null, 2)}
            </pre>
          ) : (
            <div className="text-xs space-y-2">
              <div className="rounded bg-slate-50 dark:bg-slate-800/50 p-3">
                <div className="font-semibold text-slate-700 dark:text-slate-200 mb-2">Resumo Geral</div>
                <div className="space-y-1">
                  <div>Tokens de entrada: <span className="font-mono">{Number(tokens.promptTokens ?? 0).toLocaleString('pt-BR')}</span></div>
                  <div>Tokens de saída: <span className="font-mono">{Number(tokens.completionTokens ?? 0).toLocaleString('pt-BR')}</span></div>
                  <div>Total de tokens: <span className="font-mono font-semibold">{Number(tokens.totalTokens ?? 0).toLocaleString('pt-BR')}</span></div>
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700 mt-2">
                    <div className="text-emerald-600 dark:text-emerald-400">
                      Custo USD: <span className="font-mono">${Number(tokens.usdCost ?? 0).toFixed(6)}</span>
                    </div>
                    <div className="text-emerald-600 dark:text-emerald-400">
                      Custo BRL: <span className="font-mono">R$ {Number(tokens.brlCost ?? 0).toFixed(4)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {(tokens.router || tokens.specialist) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {tokens.router && (() => {
                    const r = tokens.router as Record<string, unknown>;
                    return (
                      <div className="rounded bg-slate-50 dark:bg-slate-800/50 p-3">
                        <div className="font-semibold text-slate-700 dark:text-slate-200 mb-2">Router</div>
                        <div className="space-y-1 text-slate-600 dark:text-slate-400">
                          <div>Tokens entrada: <span className="font-mono">{Number(r.promptTokens ?? 0).toLocaleString('pt-BR')}</span></div>
                          <div>Tokens saída: <span className="font-mono">{Number(r.completionTokens ?? 0).toLocaleString('pt-BR')}</span></div>
                          <div>Total tokens: <span className="font-mono">{Number(r.totalTokens ?? 0).toLocaleString('pt-BR')}</span></div>
                          <div className="pt-1 border-t border-slate-200 dark:border-slate-700 mt-1">
                            <div>USD: <span className="font-mono">${Number(r.usdCost ?? 0).toFixed(6)}</span></div>
                            <div>BRL: <span className="font-mono">R$ {Number(r.brlCost ?? 0).toFixed(4)}</span></div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                  {tokens.specialist && (() => {
                    const s = tokens.specialist as Record<string, unknown>;
                    return (
                      <div className="rounded bg-slate-50 dark:bg-slate-800/50 p-3">
                        <div className="font-semibold text-slate-700 dark:text-slate-200 mb-2">Especialista</div>
                        <div className="space-y-1 text-slate-600 dark:text-slate-400">
                          <div>Tokens entrada: <span className="font-mono">{Number(s.promptTokens ?? 0).toLocaleString('pt-BR')}</span></div>
                          <div>Tokens saída: <span className="font-mono">{Number(s.completionTokens ?? 0).toLocaleString('pt-BR')}</span></div>
                          <div>Total tokens: <span className="font-mono">{Number(s.totalTokens ?? 0).toLocaleString('pt-BR')}</span></div>
                          <div className="pt-1 border-t border-slate-200 dark:border-slate-700 mt-1">
                            <div>USD: <span className="font-mono">${Number(s.usdCost ?? 0).toFixed(6)}</span></div>
                            <div>BRL: <span className="font-mono">R$ {Number(s.brlCost ?? 0).toFixed(4)}</span></div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}
        </LogSection>
      )}
    </div>
  );
}

export const CostsTab: React.FC = () => {
  const [data, setData] = useState<AiCostsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const offsetRef = useRef(offset);
  const dateFromRef = useRef(dateFrom);
  const dateToRef = useRef(dateTo);
  offsetRef.current = offset;
  dateFromRef.current = dateFrom;
  dateToRef.current = dateTo;

  const fetchCosts = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const res = await aiCostService.list({
        limit: PAGE_SIZE,
        offset: offsetRef.current,
        dateFrom: dateFromRef.current || undefined,
        dateTo: dateToRef.current || undefined,
      });
      setData(res);
    } catch (e: any) {
      console.error('Error loading AI costs', e);
      toast.error(e?.response?.data?.error || 'Erro ao carregar custos');
      setData(null);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCosts();
  }, [fetchCosts, offset, dateFrom, dateTo]);

  useEffect(() => {
    socketService.connect();
    const onCostCreated = () => { fetchCosts(false); };
    socketService.on('ai-cost:created', onCostCreated);
    return () => { socketService.off('ai-cost:created', onCostCreated); };
  }, [fetchCosts]);

  useEffect(() => {
    const t = setInterval(() => fetchCosts(false), POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [fetchCosts]);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  };
  const formatUsd = (n: number) => `$${n.toFixed(6)}`;
  const formatBrl = (n: number) => `R$ ${n.toFixed(4)}`;
  const formatTokens = (n: number) => n.toLocaleString('pt-BR');
  const formatBlock = (label: string, tokens: number, usd: number, brl: number, model?: string | null) => {
    // Se o modelo já contém o prefixo (ex: "Router - gpt-4.1-nano"), não adicionar novamente
    const displayModel = model && !model.startsWith(label) ? `${label} - ${model}` : (model || label);
    return (
      <div className="text-right">
        <div className="text-[11px] text-slate-500 dark:text-slate-400">{displayModel}</div>
        <div className="text-xs text-slate-700 dark:text-slate-300">{formatTokens(tokens)} tok</div>
        <div className="text-xs text-emerald-600 dark:text-emerald-400">{formatUsd(usd)}</div>
        <div className="text-xs text-emerald-600 dark:text-emerald-400">{formatBrl(brl)}</div>
      </div>
    );
  };

  const [resetting, setResetting] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [logData, setLogData] = useState<{ executionLog?: Record<string, unknown> | null } | null>(null);
  const [loadingLog, setLoadingLog] = useState(false);

  const toggleLog = async (id: string) => {
    if (expandedLogId === id) {
      setExpandedLogId(null);
      setLogData(null);
      return;
    }
    setLoadingLog(true);
    setExpandedLogId(id);
    setLogData(null);
    try {
      const res = await aiCostService.getById(id);
      setLogData(res.data as { executionLog?: Record<string, unknown> | null });
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      toast.error(err?.response?.data?.error || 'Erro ao carregar log');
      setExpandedLogId(null);
    } finally {
      setLoadingLog(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('Tem certeza que deseja apagar todos os registros de custo? Esta ação não pode ser desfeita.')) return;
    setResetting(true);
    try {
      const { deleted } = await aiCostService.reset();
      toast.success(deleted != null ? `${deleted} registro(s) removido(s).` : 'Contadores resetados.');
      setOffset(0);
      offsetRef.current = 0;
      await fetchCosts(true);
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Erro ao resetar custos');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden" style={{ backgroundColor: '#FFFFFF' }}>
      <div className="p-6 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#E0F2FE' }}>
            <span className="material-icons-outlined text-primary" style={{ color: '#F07000' }}>savings</span>
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white" style={{ color: '#0F172A', fontWeight: 700 }}>
              Custos da IA
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400" style={{ color: '#64748B' }}>
              Tokens, USD e BRL por resposta da IA
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-slate-600 dark:text-slate-400">De</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setOffset(0); }}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
          />
          <label className="text-sm text-slate-600 dark:text-slate-400">Até</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setOffset(0); }}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
          />
          <button
            onClick={() => { setDateFrom(''); setDateTo(''); setOffset(0); }}
            className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm hover:bg-slate-200 dark:hover:bg-slate-700"
          >
            Limpar filtros
          </button>
          <button
            onClick={() => fetchCosts(true)}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-sm hover:bg-primary/20 disabled:opacity-50 flex items-center gap-1.5"
            title="Atualiza a lista (também atualiza em tempo real via socket)"
          >
            <span className="material-icons-outlined text-base">refresh</span>
            Atualizar
          </button>
          <button
            onClick={handleReset}
            disabled={loading || resetting}
            className="px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm hover:bg-red-100 dark:hover:bg-red-900/30 disabled:opacity-50 flex items-center gap-1.5"
            title="Apaga todos os registros de custo"
          >
            <span className="material-icons-outlined text-base">{resetting ? 'hourglass_empty' : 'restart_alt'}</span>
            {resetting ? 'Resetando…' : 'Resetar contadores'}
          </button>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          A lista atualiza em tempo real quando novos custos são registrados (sem precisar recarregar a página).
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <span className="material-icons-outlined text-slate-400 animate-spin">refresh</span>
            <span className="ml-2 text-sm text-slate-500">Carregando...</span>
          </div>
        ) : data ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Tokens (página)</p>
                <p className="text-lg font-bold text-slate-900 dark:text-white mt-1">{formatTokens(data.aggregates.sumTokens)}</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">USD (página)</p>
                <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1">{formatUsd(data.aggregates.sumUsd)}</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">BRL (página)</p>
                <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1">{formatBrl(data.aggregates.sumBrl)}</p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/80">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">Data/Hora</th>
                    <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">Cliente</th>
                    <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">Cenário</th>
                    <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">Agente</th>
                    <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300 text-right">Router</th>
                    <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300 text-right">Especialista</th>
                    <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300 text-right">Total</th>
                    <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300 text-center w-32">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {data.data.rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                        Nenhum registro de custo ainda. Os custos são registrados quando o AI worker processa mensagens.
                      </td>
                    </tr>
                  ) : (
                    data.data.rows.map((r: AiCostRow) => (
                      <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400 whitespace-nowrap">{formatDate(r.createdAt)}</td>
                        <td className="px-4 py-2.5 text-slate-900 dark:text-white font-mono text-xs">{r.clientPhone || '—'}</td>
                        <td className="px-4 py-2.5">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            r.scenario === 'text' ? 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400' :
                            r.scenario === 'audio' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' :
                            'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300'
                          }`}>
                            {r.scenario === 'text' ? 'Texto' : r.scenario === 'audio' ? 'Áudio' : 'Imagem'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">
                          <div className="text-xs font-mono">{r.specialistName || '—'}</div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">{r.specialistModel || r.model}</div>
                        </td>
                        <td className="px-4 py-2.5 align-top">
                          {r.routerTotalTokens > 0 ? (
                            formatBlock('Router', r.routerTotalTokens, r.routerUsdCost || 0, r.routerBrlCost || 0, r.routerModel)
                          ) : (
                            <div className="text-right text-xs text-slate-400 dark:text-slate-500">—</div>
                          )}
                        </td>
                        <td className="px-4 py-2.5 align-top">
                          {r.specialistTotalTokens > 0 ? (
                            formatBlock('Especialista', r.specialistTotalTokens, r.specialistUsdCost || 0, r.specialistBrlCost || 0, r.specialistModel)
                          ) : (
                            <div className="text-right text-xs text-slate-400 dark:text-slate-500">—</div>
                          )}
                        </td>
                        <td className="px-4 py-2.5 align-top">
                          {formatBlock('Total', r.totalTokens, r.usdCost, r.brlCost, r.specialistModel || r.model)}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => toggleLog(r.id)}
                            disabled={loadingLog}
                            className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 flex items-center justify-center gap-1 mx-auto"
                          >
                            <span className="material-icons-outlined text-sm">visibility</span>
                            {expandedLogId === r.id ? 'Fechar log' : 'Ver Log'}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {expandedLogId && (
              <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    <span className="material-icons-outlined text-primary" style={{ color: '#F07000' }}>visibility</span>
                    LOG DA EXECUÇÃO
                  </h3>
                  <button
                    type="button"
                    onClick={() => { setExpandedLogId(null); setLogData(null); }}
                    className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                  >
                    <span className="material-icons-outlined">close</span>
                  </button>
                </div>
                <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
                  {loadingLog ? (
                    <div className="flex items-center justify-center py-8">
                      <span className="material-icons-outlined text-slate-400 animate-spin">refresh</span>
                      <span className="ml-2 text-sm text-slate-500">Carregando log...</span>
                    </div>
                  ) : logData?.executionLog ? (
                    <ExecutionLogView log={logData.executionLog} />
                  ) : (
                    <p className="text-sm text-slate-500 dark:text-slate-400">Nenhum log disponível para esta resposta.</p>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Exibindo {data.data.rows.length} de {data.data.total} registros
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                  disabled={offset === 0}
                  className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-200 dark:hover:bg-slate-700"
                >
                  Anterior
                </button>
                <button
                  onClick={() => setOffset((o) => o + PAGE_SIZE)}
                  disabled={offset + data.data.rows.length >= data.data.total}
                  className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-200 dark:hover:bg-slate-700"
                >
                  Próxima
                </button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
};

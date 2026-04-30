import React from 'react';
import type { FollowUpConfig } from '../../services/ai-config.service';

interface FollowUpConfigTabProps {
  followUpConfig: FollowUpConfig;
  setFollowUpConfig: (value: FollowUpConfig) => void;
  isLoading: boolean;
  isSaving: boolean;
  onSave: () => Promise<void>;
  followUpEnabled: boolean;
  isTogglingFollowUp: boolean;
  onToggleFollowUp: (enabled: boolean) => Promise<void>;
}

export const FollowUpConfigTab: React.FC<FollowUpConfigTabProps> = ({
  followUpConfig,
  setFollowUpConfig,
  isLoading,
  isSaving,
  onSave,
  followUpEnabled,
  isTogglingFollowUp,
  onToggleFollowUp,
}) => {
  const firstOn = followUpConfig.firstFollowUpEnabled !== false;
  const secondOn = followUpConfig.secondFollowUpEnabled !== false && firstOn;
  const autoCloseOn = followUpConfig.autoCloseAfterFollowUpEnabled !== false;

  const patch = (partial: Partial<FollowUpConfig>) => {
    let next: FollowUpConfig = { ...followUpConfig, ...partial };
    if (partial.firstFollowUpEnabled === false) {
      next.secondFollowUpEnabled = false;
    }
    setFollowUpConfig(next);
  };

  const toggleRow = (
    label: string,
    description: string,
    active: boolean,
    disabled: boolean,
    onToggle: () => void
  ) => (
    <div
      className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${
        disabled ? 'opacity-50 border-slate-200 bg-slate-50' : active ? 'border-green-300 bg-green-50/80' : 'border-slate-200 bg-white'
      }`}
      style={{ borderColor: disabled ? '#e2e8f0' : active ? '#86efac' : '#e2e8f0', backgroundColor: disabled ? '#f8fafc' : active ? '#f0fdf4' : '#fff' }}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800" style={{ color: '#0f172a' }}>
          {label}
        </p>
        <p className="text-xs text-slate-500 mt-0.5" style={{ color: '#64748b' }}>
          {description}
        </p>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={onToggle}
        className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ backgroundColor: active ? '#16a34a' : '#94a3b8', minWidth: 72 }}
      >
        {active ? 'Ligado' : 'Desligado'}
      </button>
    </div>
  );

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden" style={{ backgroundColor: '#FFFFFF' }}>
      <div className="p-6 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#FEE4E2' }}>
            <span className="material-icons-outlined text-primary" style={{ color: '#F07000' }}>schedule_send</span>
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white" style={{ color: '#0F172A', fontWeight: 700 }}>
              Follow-up automático (inatividade)
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400" style={{ color: '#64748B' }}>
              Mensagens enviadas pelo sistema quando o cliente fica sem responder. O follow-up manual pelo supervisor continua disponível mesmo com isto desligado.
            </p>
          </div>
        </div>

        {/* Interruptor: apenas envios automáticos */}
        <div
          className={`mt-4 flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
            followUpEnabled
              ? 'border-green-400 bg-green-50'
              : 'border-red-400 bg-red-50'
          }`}
          style={{ borderColor: followUpEnabled ? '#4ade80' : '#f87171', backgroundColor: followUpEnabled ? '#f0fdf4' : '#fff1f2' }}
        >
          <div className="flex items-center gap-3">
            <span
              className="material-icons-outlined text-2xl"
              style={{ color: followUpEnabled ? '#16a34a' : '#dc2626' }}
            >
              {followUpEnabled ? 'notifications_active' : 'notifications_off'}
            </span>
            <div>
              <p className="font-bold text-sm" style={{ color: followUpEnabled ? '#15803d' : '#b91c1c' }}>
                {followUpEnabled ? 'Follow-up automático ATIVADO' : 'Follow-up automático DESATIVADO'}
              </p>
              <p className="text-xs" style={{ color: followUpEnabled ? '#166534' : '#991b1b' }}>
                {followUpEnabled
                  ? 'As mensagens por inatividade são enviadas pelo sistema conforme os tempos abaixo.'
                  : 'Nenhuma mensagem automática por inatividade será enviada. Supervisores podem continuar a usar follow-up manual na área do supervisor.'}
              </p>
            </div>
          </div>
          <button
            onClick={() => onToggleFollowUp(!followUpEnabled)}
            disabled={isTogglingFollowUp}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-sm text-white shadow transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: followUpEnabled ? '#dc2626' : '#16a34a',
              minWidth: 140,
              justifyContent: 'center',
            }}
          >
            {isTogglingFollowUp ? (
              <>
                <span className="material-icons-outlined text-base animate-spin">refresh</span>
                Aguarde...
              </>
            ) : followUpEnabled ? (
              <>
                <span className="material-icons-outlined text-base">power_settings_new</span>
                Desligar automático
              </>
            ) : (
              <>
                <span className="material-icons-outlined text-base">power_settings_new</span>
                Ligar automático
              </>
            )}
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <span className="material-icons-outlined text-slate-400 animate-spin">refresh</span>
            <span className="ml-2 text-sm text-slate-500">Carregando configurações...</span>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300" style={{ color: '#475569' }}>
                Etapas do envio automático
              </h4>
              <p className="text-xs text-slate-500" style={{ color: '#64748b' }}>
                Ligue ou desligue cada etapa quando o interruptor de envio automático estiver ativo.
              </p>
              <div className="space-y-2">
                {toggleRow(
                  '1ª mensagem automática',
                  'Envia a primeira mensagem após o tempo definido sem resposta do cliente.',
                  firstOn,
                  false,
                  () => patch({ firstFollowUpEnabled: !firstOn })
                )}
                {toggleRow(
                  '2ª mensagem automática',
                  'Envia a segunda mensagem após o intervalo a partir do envio da primeira.',
                  secondOn,
                  !firstOn,
                  () => {
                    if (!firstOn) return;
                    patch({ secondFollowUpEnabled: !secondOn });
                  }
                )}
                {toggleRow(
                  'Fechamento automático',
                  'Move o atendimento para Fechados após as regras de tempo configuradas.',
                  autoCloseOn,
                  false,
                  () => patch({ autoCloseAfterFollowUpEnabled: !autoCloseOn })
                )}
              </div>
            </div>

            {/* Tempos */}
            <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4" style={{ backgroundColor: '#F8FAFC' }}>
              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4" style={{ color: '#475569' }}>
                Tempos (em minutos)
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className={!firstOn ? 'opacity-45 pointer-events-none' : ''}>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Tempo até 1ª mensagem
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="1440"
                      disabled={!firstOn}
                      value={followUpConfig.firstDelayMinutes ?? ''}
                      onChange={(e) => {
                        const v = e.target.value === '' ? undefined : Math.min(1440, Math.max(1, parseInt(e.target.value, 10) || 0));
                        patch({ firstDelayMinutes: v ?? 60 });
                      }}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-primary outline-none disabled:opacity-60"
                      style={{ backgroundColor: '#FFFFFF', color: '#0F172A' }}
                    />
                    <span className="text-xs text-slate-500 whitespace-nowrap">min</span>
                  </div>
                </div>
                <div className={!secondOn ? 'opacity-45 pointer-events-none' : ''}>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Tempo até 2ª mensagem
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="10080"
                      disabled={!secondOn}
                      value={followUpConfig.secondDelayMinutes ?? ''}
                      onChange={(e) => {
                        const v = e.target.value === '' ? undefined : Math.min(10080, Math.max(1, parseInt(e.target.value, 10) || 0));
                        patch({ secondDelayMinutes: v ?? 1440 });
                      }}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-primary outline-none disabled:opacity-60"
                      style={{ backgroundColor: '#FFFFFF', color: '#0F172A' }}
                    />
                    <span className="text-xs text-slate-500 whitespace-nowrap">min</span>
                  </div>
                </div>
                <div className={!autoCloseOn ? 'opacity-45 pointer-events-none' : ''}>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Tempo até fechamento automático
                  </label>
                  <p className="text-[11px] text-slate-500 mb-1 leading-snug" style={{ color: '#64748b' }}>
                    Se só a primeira mensagem automática estiver ativa: conta a partir do envio dessa mensagem. Se a segunda também estiver ativa, após o segundo envio o tempo até Fechados vem da aba Movimentação.
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="60"
                      max="43200"
                      disabled={!autoCloseOn}
                      value={followUpConfig.closeDelayMinutes ?? ''}
                      onChange={(e) => {
                        const v = e.target.value === '' ? undefined : Math.min(43200, Math.max(60, parseInt(e.target.value, 10) || 60));
                        patch({ closeDelayMinutes: v ?? 2160 });
                      }}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-primary outline-none disabled:opacity-60"
                      style={{ backgroundColor: '#FFFFFF', color: '#0F172A' }}
                    />
                    <span className="text-xs text-slate-500 whitespace-nowrap">min</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Mensagens */}
            <div className="space-y-4">
              <div className={!firstOn ? 'opacity-45 pointer-events-none' : ''}>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2" style={{ color: '#475569' }}>
                  Texto da primeira mensagem automática
                </label>
                <textarea
                  disabled={!firstOn}
                  value={followUpConfig.firstMessage ?? ''}
                  onChange={(e) => patch({ firstMessage: e.target.value })}
                  rows={4}
                  placeholder="Ex: Olá! Percebi que você não respondeu. Posso ajudar em algo?"
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-primary outline-none resize-y disabled:opacity-60"
                  style={{ backgroundColor: '#F8FAFC', color: '#0F172A' }}
                />
              </div>
              <div className={!secondOn ? 'opacity-45 pointer-events-none' : ''}>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2" style={{ color: '#475569' }}>
                  Texto da segunda mensagem automática
                </label>
                <textarea
                  disabled={!secondOn}
                  value={followUpConfig.secondMessage ?? ''}
                  onChange={(e) => patch({ secondMessage: e.target.value })}
                  rows={4}
                  placeholder="Ex: Ainda estou por aqui caso precise de ajuda. Caso contrário, encerrarei o atendimento."
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-primary outline-none resize-y disabled:opacity-60"
                  style={{ backgroundColor: '#F8FAFC', color: '#0F172A' }}
                />
              </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <span className="material-icons-outlined text-blue-600 dark:text-blue-400 text-lg">info</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-2">Como funciona</p>
                  <ul className="text-xs text-blue-700 dark:text-blue-400 space-y-1.5">
                    <li>• Cada etapa (mensagens e fechamento) pode ficar ligada ou desligada na secção acima.</li>
                    <li>• A primeira mensagem usa o tempo sem resposta do cliente; a segunda conta a partir do envio da primeira.</li>
                    <li>• Qualquer resposta do cliente reinicia os contadores do ciclo.</li>
                    <li>• O supervisor pode enviar follow-up manual em paralelo; isso não depende deste interruptor.</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={onSave}
                disabled={isSaving || isLoading}
                className="px-4 py-2 bg-primary hover:bg-primary/90 disabled:bg-primary/50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold shadow-sm transition-all flex items-center justify-center gap-2"
                style={{ backgroundColor: '#F07000', opacity: (isSaving || isLoading) ? 0.5 : 1 }}
              >
                {isSaving ? (
                  <>
                    <span className="material-icons-outlined text-lg animate-spin">refresh</span>
                    Salvando...
                  </>
                ) : (
                  <>
                    <span className="material-icons-outlined text-lg">save</span>
                    Salvar configuração
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

import React from 'react';

interface AutoReopenTimeoutProps {
  autoReopenTimeoutMinutes: number;
  setAutoReopenTimeoutMinutes: (value: number) => void;
  isLoadingAutoReopen: boolean;
  isSavingAutoReopen: boolean;
  onSaveAutoReopen: () => Promise<void>;
}

export const AutoReopenTimeout: React.FC<AutoReopenTimeoutProps> = ({
  autoReopenTimeoutMinutes,
  setAutoReopenTimeoutMinutes,
  isLoadingAutoReopen,
  isSavingAutoReopen,
  onSaveAutoReopen,
}) => {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden" style={{ backgroundColor: '#FFFFFF' }}>
      <div className="p-6 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#FEE4E2' }}>
            <span className="material-icons-outlined text-primary" style={{ color: '#F07000' }}>restore</span>
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white" style={{ color: '#0F172A', fontWeight: 700 }}>
              Reabertura Automática de Atendimentos
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400" style={{ color: '#64748B' }}>
              Quando um atendimento é fechado e o cliente envia uma nova mensagem dentro do período configurado, o sistema reabre automaticamente o último atendimento fechado.
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2" style={{ color: '#475569' }}>
            Tempo de Reabertura Automática
          </label>
          <div className="flex items-center gap-4">
            <input
              type="number"
              min="1"
              max="480"
              value={autoReopenTimeoutMinutes}
              onChange={(e) => setAutoReopenTimeoutMinutes(Math.min(480, Math.max(1, parseInt(e.target.value, 10) || 60)))}
              disabled={isLoadingAutoReopen}
              className="w-32 px-4 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-primary outline-none disabled:opacity-50"
              style={{ backgroundColor: '#FFFFFF', color: '#0F172A' }}
            />
            <span className="text-sm text-slate-600 dark:text-slate-400" style={{ color: '#64748B' }}>
              minutos (1–480)
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2" style={{ color: '#64748B' }}>
            Período em minutos após o fechamento do atendimento. Se o cliente enviar mensagem dentro deste período, o último atendimento fechado será reaberto automaticamente. Após este período, será criado um novo atendimento.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onSaveAutoReopen}
            disabled={isSavingAutoReopen || isLoadingAutoReopen}
            className="px-4 py-2 bg-primary hover:bg-primary/90 disabled:bg-primary/50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold shadow-sm transition-all flex items-center justify-center gap-2"
            style={{ backgroundColor: isSavingAutoReopen ? '#F07000' : '#F07000', opacity: (isSavingAutoReopen || isLoadingAutoReopen) ? 0.5 : 1 }}
          >
            {isSavingAutoReopen ? (
              <>
                <span className="material-icons-outlined text-lg animate-spin">refresh</span>
                Salvando...
              </>
            ) : (
              <>
                <span className="material-icons-outlined text-lg">save</span>
                Salvar Tempo de Reabertura
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

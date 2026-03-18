import React from 'react';
import toast from 'react-hot-toast';
import { aiConfigService } from '../../services/ai-config.service';

interface TemperatureConfigTabProps {
  temperature: number;
  setTemperature: (value: number) => void;
  isLoadingTemperature: boolean;
  isSavingTemperature: boolean;
  setIsSavingTemperature: (value: boolean) => void;
}

export const TemperatureConfigTab: React.FC<TemperatureConfigTabProps> = ({
  temperature,
  setTemperature,
  isLoadingTemperature,
  isSavingTemperature,
  setIsSavingTemperature,
}) => {
  const handleSaveTemperature = async () => {
    setIsSavingTemperature(true);
    try {
      await aiConfigService.updateAgentTemperature(temperature);
      toast.success('Temperatura do agente atualizada com sucesso!');
    } catch (error: any) {
      console.error('Error updating temperature:', error);
      toast.error(error.response?.data?.error || 'Erro ao atualizar temperatura');
    } finally {
      setIsSavingTemperature(false);
    }
  };

  const label = temperature <= 0.3 ? 'Mais assertivo' : temperature >= 1.5 ? 'Mais criativo / avoado' : 'Equilibrado';

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex-1 flex flex-col min-h-0" style={{ backgroundColor: '#FFFFFF' }}>
      <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
        <div className="flex items-center gap-2 mb-0.5">
          <div className="w-7 h-7 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#FEE4E2' }}>
            <span className="material-icons-outlined text-primary text-sm" style={{ color: '#F07000' }}>thermostat</span>
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white" style={{ color: '#0F172A', fontWeight: 700 }}>
              Temperatura do Agente
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400" style={{ color: '#64748B' }}>
              Ajuste se você quer respostas mais assertivas ou mais criativas e variadas
            </p>
          </div>
        </div>
      </div>

      <div className="p-3 space-y-2 flex-1 flex flex-col min-h-0">
        {isLoadingTemperature ? (
          <div className="flex items-center justify-center py-6">
            <span className="material-icons-outlined text-slate-400 animate-spin">refresh</span>
            <span className="ml-2 text-sm text-slate-500">Carregando...</span>
          </div>
        ) : (
          <>
            <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-2.5 flex-shrink-0" style={{ backgroundColor: '#F8FAFC' }}>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1" style={{ color: '#475569' }}>
                Nível de temperatura
              </label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 w-18" style={{ color: '#64748B' }}>Assertivo</span>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                  style={{ accentColor: '#F07000' }}
                />
                <span className="text-xs text-slate-500 w-20" style={{ color: '#64748B' }}>Criativo / Avoado</span>
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-lg font-bold text-primary" style={{ color: '#F07000' }}>
                  {temperature.toFixed(1)}
                </span>
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400" style={{ color: '#475569' }}>
                  {label}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1" style={{ color: '#64748B' }}>
                Valores menores (0–0.5): respostas mais focadas e previsíveis. Valores maiores (1–2): mais variedade e criatividade.
              </p>
            </div>

            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-2.5 flex-shrink-0">
              <div className="flex items-start gap-1.5">
                <span className="material-icons-outlined text-amber-600 dark:text-amber-400 text-xs flex-shrink-0">info</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-0.5">Como afeta o agente</p>
                  <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-0.5">
                    <li>• <strong>Assertivo (0–0.4):</strong> Respostas mais diretas, repetíveis e alinhadas ao contexto.</li>
                    <li>• <strong>Equilibrado (0.5–1):</strong> Bom equilíbrio entre consistência e variedade.</li>
                    <li>• <strong>Criativo / Avoado (1.1–2):</strong> Respostas mais diversas e criativas; maior chance de variação.</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-1 flex-shrink-0">
              <button
                onClick={handleSaveTemperature}
                disabled={isSavingTemperature}
                className="flex-1 px-3 py-1.5 bg-primary hover:bg-primary/90 disabled:bg-primary/50 disabled:cursor-not-allowed text-white rounded-lg text-xs font-semibold shadow-sm transition-all flex items-center justify-center gap-1"
                style={{ backgroundColor: '#F07000', opacity: isSavingTemperature ? 0.7 : 1 }}
              >
                {isSavingTemperature ? (
                  <>
                    <span className="material-icons-outlined text-xs animate-spin">refresh</span>
                    Salvando...
                  </>
                ) : (
                  <>
                    <span className="material-icons-outlined text-xs">save</span>
                    Salvar Temperatura
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { attendanceService } from '../services/attendance.service';
import toast from 'react-hot-toast';

interface AIStatusControlProps {
  attendanceId: string;
  /** Quando true (humano assumiu), exibe "IA desativada" no painel sem botão Reativar (usa "Devolver para IA" no chat) */
  handledByHuman?: boolean;
  onStatusChange?: () => void;
}

export const AIStatusControl: React.FC<AIStatusControlProps> = ({ attendanceId, handledByHuman = false, onStatusChange }) => {
  const [aiStatus, setAiStatus] = useState<{
    disabled: boolean;
    remainingSeconds: number;
    isUnlimited: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [showDisableMenu, setShowDisableMenu] = useState(false);

  // Fetch AI status
  const fetchStatus = async () => {
    try {
      const status = await attendanceService.getAIStatus(attendanceId);
      setAiStatus({
        disabled: status.aiDisabled,
        remainingSeconds: status.remainingSeconds,
        isUnlimited: status.isUnlimited,
      });
    } catch (error) {
      console.error('Error fetching AI status:', error);
    }
  };

  useEffect(() => {
    fetchStatus();
    // Poll every 10 seconds
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, [attendanceId]);

  // Format time remaining
  const formatTimeRemaining = (seconds: number): string => {
    if (seconds <= 0) return '0s';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  // Enable AI
  const handleEnableAI = async () => {
    try {
      setLoading(true);
      await attendanceService.enableAI(attendanceId);
      toast.success('IA reativada com sucesso!');
      await fetchStatus();
      onStatusChange?.();
    } catch (error: any) {
      console.error('Error enabling AI:', error);
      toast.error(error?.response?.data?.error || 'Erro ao reativar IA');
    } finally {
      setLoading(false);
    }
  };

  // Disable AI
  const handleDisableAI = async (hours?: number) => {
    try {
      setLoading(true);
      await attendanceService.disableAI(attendanceId, hours);
      toast.success(hours ? `IA desligada por ${hours}h` : 'IA desligada indefinidamente');
      setShowDisableMenu(false);
      await fetchStatus();
      onStatusChange?.();
    } catch (error: any) {
      console.error('Error disabling AI:', error);
      toast.error(error?.response?.data?.error || 'Erro ao desligar IA');
    } finally {
      setLoading(false);
    }
  };

  if (!aiStatus) {
    return (
      <div className="p-4 bg-slate-50/80 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-700/50">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-slate-200 dark:border-slate-600 border-t-emerald-500"></div>
        </div>
      </div>
    );
  }

  const effectiveDisabled = aiStatus.disabled || handledByHuman;

  return (
    <div className="w-full space-y-4">
      {/* Header com ícone e título */}
      <div className="flex items-center gap-3 w-full">
        <div className={`rounded-xl flex-shrink-0 w-10 h-10 flex items-center justify-center ${
          effectiveDisabled 
            ? 'bg-amber-50 dark:bg-amber-900/20' 
            : 'bg-emerald-50 dark:bg-emerald-900/20'
        }`}>
          {effectiveDisabled ? (
            <span className="material-icons-round text-xl leading-none text-amber-600 dark:text-amber-400">
              pause_circle
            </span>
          ) : (
            <span className="material-icons-round text-xl leading-none text-emerald-600 dark:text-emerald-400">
              smart_toy
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1 leading-none whitespace-nowrap">
            Controle da IA
          </h4>
          <div className={`text-sm font-medium leading-tight whitespace-nowrap ${
            effectiveDisabled 
              ? 'text-amber-600 dark:text-amber-400' 
              : 'text-emerald-600 dark:text-emerald-400'
          }`}>
            {effectiveDisabled ? '● Desligada' : '● Ativa'}
          </div>
        </div>
      </div>

      {/* Card com informações */}
      <div className="bg-slate-50/80 dark:bg-slate-800/40 rounded-xl p-4 space-y-4 border border-slate-100 dark:border-slate-700/50">
        {handledByHuman && (
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Você está respondendo este atendimento. Use o botão &quot;Devolver para IA&quot; abaixo do chat para reativar a IA.
          </p>
        )}
        {!handledByHuman && aiStatus.disabled && (
          <>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs flex-shrink-0">
                <span className="material-icons-round text-base opacity-80">schedule</span>
                <span className="whitespace-nowrap">
                  {aiStatus.isUnlimited ? 'Tempo:' : 'Reativa em:'}
                </span>
              </div>
              <span className="font-mono font-medium text-slate-700 dark:text-slate-300 text-xs text-right whitespace-nowrap">
                {aiStatus.isUnlimited ? 'Ilimitado' : formatTimeRemaining(aiStatus.remainingSeconds)}
              </span>
            </div>

            <button
              onClick={handleEnableAI}
              disabled={loading}
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <span className="material-icons-round text-base">play_arrow</span>
              <span>{loading ? 'Reativando...' : 'Reativar IA Agora'}</span>
            </button>
          </>
        )}

        {!effectiveDisabled && (
          <div className="relative">
            <button
              onClick={() => setShowDisableMenu(!showDisableMenu)}
              disabled={loading}
              className="w-full border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50 px-4 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <span className="material-icons-round text-base">pause</span>
              <span>Desligar IA</span>
            </button>

            {showDisableMenu && (
              <>
                {/* Overlay para fechar menu */}
                <div 
                  className="fixed inset-0 z-10" 
                  onClick={() => setShowDisableMenu(false)}
                />
                
                <div className="absolute bottom-full left-0 right-0 mb-2 bg-white dark:bg-slate-700 rounded-xl shadow-lg border border-slate-200 dark:border-slate-600 overflow-hidden z-20">
                  <div className="p-3 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-600">
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                      Desligar por quanto tempo?
                    </span>
                  </div>
                  <button
                    onClick={() => handleDisableAI(1)}
                    className="w-full px-4 py-2.5 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors flex items-center justify-between"
                  >
                    <span>1 hora</span>
                    <span className="material-icons-round text-sm text-slate-400">schedule</span>
                  </button>
                  <button
                    onClick={() => handleDisableAI(2)}
                    className="w-full px-4 py-2.5 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors flex items-center justify-between"
                  >
                    <span>2 horas</span>
                    <span className="material-icons-round text-sm text-slate-400">schedule</span>
                  </button>
                  <button
                    onClick={() => handleDisableAI(5)}
                    className="w-full px-4 py-2.5 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors flex items-center justify-between"
                  >
                    <span>5 horas</span>
                    <span className="material-icons-round text-sm text-slate-400">schedule</span>
                  </button>
                  <button
                    onClick={() => handleDisableAI(10)}
                    className="w-full px-4 py-2.5 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors flex items-center justify-between"
                  >
                    <span>10 horas</span>
                    <span className="material-icons-round text-sm text-slate-400">schedule</span>
                  </button>
                  <button
                    onClick={() => handleDisableAI(0)}
                    className="w-full px-4 py-2.5 text-left text-sm hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors border-t border-slate-200 dark:border-slate-600 text-amber-700 dark:text-amber-400 font-medium flex items-center justify-between"
                  >
                    <span>Indefinidamente</span>
                    <span className="material-icons-round text-sm">block</span>
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

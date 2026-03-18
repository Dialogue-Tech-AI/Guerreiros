import React from 'react';
import toast from 'react-hot-toast';
import { aiConfigService } from '../../services/ai-config.service';

interface BufferConfigTabProps {
  bufferEnabled: boolean;
  setBufferEnabled: (value: boolean) => void;
  bufferTimeMs: number;
  setBufferTimeMs: (value: number) => void;
  isLoadingBuffer: boolean;
  isSavingBuffer: boolean;
  setIsSavingBuffer: (value: boolean) => void;
}

export const BufferConfigTab: React.FC<BufferConfigTabProps> = ({
  bufferEnabled,
  setBufferEnabled,
  bufferTimeMs,
  setBufferTimeMs,
  isLoadingBuffer,
  isSavingBuffer,
  setIsSavingBuffer,
}) => {
  const handleSaveBufferConfig = async () => {
    setIsSavingBuffer(true);
    try {
      await aiConfigService.updateBufferConfig({
        enabled: bufferEnabled,
        bufferTimeMs,
      });
      toast.success('Configuração de buffer atualizada com sucesso!');
    } catch (error: any) {
      console.error('Error updating buffer config:', error);
      toast.error(error.response?.data?.error || 'Erro ao atualizar configuração de buffer');
    } finally {
      setIsSavingBuffer(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col" style={{ backgroundColor: '#FFFFFF', height: '100%' }}>
      <div className="p-6 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#FEE4E2' }}>
            <span className="material-icons-outlined text-primary" style={{ color: '#F07000' }}>schedule</span>
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white" style={{ color: '#0F172A', fontWeight: 700 }}>
              Buffer Inteligente de Mensagens
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400" style={{ color: '#64748B' }}>
              Agrupe mensagens sequenciais para conversas mais naturais com a IA
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Loading State */}
        {isLoadingBuffer ? (
          <div className="flex items-center justify-center py-8">
            <span className="material-icons-outlined text-slate-400 animate-spin">refresh</span>
            <span className="ml-2 text-sm text-slate-500">Carregando configurações...</span>
          </div>
        ) : (
          <>
            {/* Enable/Disable Toggle */}
            <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4" style={{ backgroundColor: '#F8FAFC' }}>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1" style={{ color: '#475569' }}>
                    Ativar Buffer de Mensagens
                  </label>
                  <p className="text-xs text-slate-500 dark:text-slate-400" style={{ color: '#64748B' }}>
                    Quando ativado, a IA aguarda um tempo configurável antes de processar mensagens, consolidando múltiplas mensagens em uma única resposta
                  </p>
                </div>
                <div className="ml-4">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bufferEnabled}
                      onChange={(e) => setBufferEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary" style={{ backgroundColor: bufferEnabled ? '#F07000' : '#E2E8F0' }}></div>
                  </label>
                </div>
              </div>
            </div>

            {/* Buffer Time Configuration */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2" style={{ color: '#475569' }}>
                Tempo de Buffer
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="3000"
                  max="15000"
                  step="1000"
                  value={bufferTimeMs}
                  onChange={(e) => setBufferTimeMs(parseInt(e.target.value))}
                  disabled={!bufferEnabled}
                  className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    accentColor: '#F07000',
                  }}
                />
                <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 px-4 py-2 rounded-lg min-w-[120px]" style={{ backgroundColor: '#F1F5F9' }}>
                  <span className="text-2xl font-bold text-primary" style={{ color: '#F07000' }}>
                    {bufferTimeMs / 1000}
                  </span>
                  <span className="text-sm text-slate-600 dark:text-slate-400" style={{ color: '#64748B' }}>
                    segundos
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2" style={{ color: '#64748B' }}>
                Tempo que a IA aguarda antes de processar as mensagens (3-15 segundos). Quanto maior o tempo, mais mensagens podem ser agrupadas.
              </p>
            </div>

            {/* How It Works */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <span className="material-icons-outlined text-blue-600 dark:text-blue-400 text-lg">info</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-2">
                    🎯 Como Funciona
                  </p>
                  <ul className="text-xs text-blue-700 dark:text-blue-400 space-y-1.5">
                    <li className="flex items-start gap-2">
                      <span className="material-icons-outlined text-xs mt-0.5">check_circle</span>
                      <span>Cliente envia a primeira mensagem → Timer inicia</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="material-icons-outlined text-xs mt-0.5">check_circle</span>
                      <span>Cliente envia mais mensagens → Timer reseta para cada nova mensagem</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="material-icons-outlined text-xs mt-0.5">check_circle</span>
                      <span>Cliente para de digitar por {bufferTimeMs / 1000} segundos → IA processa todas as mensagens juntas</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="material-icons-outlined text-xs mt-0.5">check_circle</span>
                      <span>Áudio e imagens são transcritos/descritos e incluídos no buffer com tags especiais</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Benefits */}
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <span className="material-icons-outlined text-green-600 dark:text-green-400 text-lg">thumb_up</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-green-800 dark:text-green-300 mb-2">
                    ✨ Benefícios
                  </p>
                  <ul className="text-xs text-green-700 dark:text-green-400 space-y-1.5">
                    <li className="flex items-start gap-2">
                      <span className="material-icons-outlined text-xs mt-0.5">star</span>
                      <span>Conversas mais naturais - a IA responde quando o cliente termina de falar</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="material-icons-outlined text-xs mt-0.5">star</span>
                      <span>Menos respostas fragmentadas - evita múltiplas respostas para mensagens sequenciais</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="material-icons-outlined text-xs mt-0.5">star</span>
                      <span>Economia de tokens - uma única chamada à LLM ao invés de várias</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="material-icons-outlined text-xs mt-0.5">star</span>
                      <span>Melhor contexto - a IA vê todas as mensagens juntas antes de responder</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Example */}
            <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <span className="material-icons-outlined text-purple-600 dark:text-purple-400 text-lg">code</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-purple-800 dark:text-purple-300 mb-2">
                    📝 Exemplo Prático
                  </p>
                  <div className="space-y-2 text-xs text-purple-700 dark:text-purple-400">
                    <div className="bg-white dark:bg-slate-800 rounded p-2 font-mono" style={{ backgroundColor: '#FFFFFF' }}>
                      <p className="text-slate-600 mb-1">Cliente envia (0s):</p>
                      <p className="text-slate-900">"Olá, bom dia"</p>
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded p-2 font-mono" style={{ backgroundColor: '#FFFFFF' }}>
                      <p className="text-slate-600 mb-1">Cliente envia (1s):</p>
                      <p className="text-slate-900">"Preciso de uma pastilha de freio"</p>
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded p-2 font-mono" style={{ backgroundColor: '#FFFFFF' }}>
                      <p className="text-slate-600 mb-1">Cliente envia (3s):</p>
                      <p className="text-slate-900">"Para um Corolla 2019"</p>
                    </div>
                    <div className="bg-primary/5 rounded p-2 mt-2" style={{ backgroundColor: '#FFF4ED' }}>
                      <p className="text-slate-600 mb-1">IA recebe tudo consolidado após {bufferTimeMs / 1000}s:</p>
                      <p className="text-slate-900 whitespace-pre-wrap font-mono text-xs">
                        Olá, bom dia{'\n'}Preciso de uma pastilha de freio{'\n'}Para um Corolla 2019
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div className="flex gap-3 pt-4">
              <button
                onClick={handleSaveBufferConfig}
                disabled={isSavingBuffer}
                className="flex-1 px-6 py-3 bg-primary hover:bg-primary/90 disabled:bg-primary/50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold shadow-sm transition-all flex items-center justify-center gap-2"
                style={{ backgroundColor: isSavingBuffer ? '#F07000' : '#F07000', opacity: isSavingBuffer ? 0.5 : 1 }}
              >
                {isSavingBuffer ? (
                  <>
                    <span className="material-icons-outlined text-lg animate-spin">refresh</span>
                    Salvando...
                  </>
                ) : (
                  <>
                    <span className="material-icons-outlined text-lg">save</span>
                    Salvar Configurações de Buffer
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

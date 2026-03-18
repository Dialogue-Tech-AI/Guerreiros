import React from 'react';
import toast from 'react-hot-toast';
import { aiConfigService } from '../../services/ai-config.service';

interface ImageDescriptionPromptProps {
  imageDescriptionPrompt: string;
  setImageDescriptionPrompt: (value: string) => void;
  isLoadingImagePrompt: boolean;
  isSavingImagePrompt: boolean;
  setIsSavingImagePrompt: (value: boolean) => void;
}

export const ImageDescriptionPrompt: React.FC<ImageDescriptionPromptProps> = ({
  imageDescriptionPrompt,
  setImageDescriptionPrompt,
  isLoadingImagePrompt,
  isSavingImagePrompt,
  setIsSavingImagePrompt,
}) => {
  const handleSaveImagePrompt = async () => {
    setIsSavingImagePrompt(true);
    try {
      await aiConfigService.updateImageDescriptionPrompt(imageDescriptionPrompt);
      toast.success('Prompt de descrição de imagem atualizado com sucesso!');
    } catch (error: any) {
      console.error('Error updating image description prompt:', error);
      toast.error(error.response?.data?.error || 'Erro ao atualizar prompt de descrição de imagem');
    } finally {
      setIsSavingImagePrompt(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col" style={{ backgroundColor: '#FFFFFF', height: '100%' }}>
      <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#FEE4E2' }}>
            <span className="material-icons-outlined text-primary" style={{ color: '#F07000' }}>image</span>
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white" style={{ color: '#0F172A', fontWeight: 700 }}>
              Prompt de Descrição de Imagem (GPT-4o Vision)
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400" style={{ color: '#64748B' }}>
              Este prompt é usado pelo GPT-4o Vision para analisar e descrever imagens enviadas pelos clientes, incluindo OCR (extração de texto). Usado em todos os métodos.
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 flex flex-col flex-1 min-h-0">
        {isLoadingImagePrompt ? (
          <div className="flex items-center justify-center py-8">
            <span className="material-icons-outlined text-slate-400 animate-spin">refresh</span>
            <span className="ml-2 text-sm text-slate-500">Carregando configurações...</span>
          </div>
        ) : (
          <div className="flex flex-col flex-1 min-h-0">
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 flex-shrink-0" style={{ color: '#475569' }}>
              Prompt de Descrição de Imagem
            </label>
            <textarea
              value={imageDescriptionPrompt}
              onChange={(e) => setImageDescriptionPrompt(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-mono text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-primary outline-none resize-none flex-1"
              style={{ backgroundColor: '#F8FAFC', color: '#0F172A' }}
              placeholder="Cole o prompt para descrição de imagens aqui..."
            />
            <div className="flex items-center justify-between mt-2 flex-shrink-0">
              <p className="text-xs text-slate-500 dark:text-slate-400" style={{ color: '#64748B' }}>
                Este prompt é usado pelo GPT-4o Vision para analisar e descrever imagens enviadas pelos clientes, incluindo OCR (extração de texto)
              </p>
              <button
                onClick={handleSaveImagePrompt}
                disabled={isSavingImagePrompt || isLoadingImagePrompt}
                className="px-6 py-2.5 bg-primary hover:bg-primary/90 disabled:bg-primary/50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold shadow-sm transition-all flex items-center gap-2"
                style={{ backgroundColor: '#F07000', opacity: (isSavingImagePrompt || isLoadingImagePrompt) ? 0.5 : 1 }}
              >
                {isSavingImagePrompt ? (
                  <>
                    <span className="material-icons-outlined text-lg animate-spin">refresh</span>
                    Salvando...
                  </>
                ) : (
                  <>
                    <span className="material-icons-outlined text-lg">save</span>
                    Salvar Prompt de Imagem
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

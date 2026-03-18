import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../../store/auth.store';

interface DocumentViewerProps {
  messageId: string;
  mediaUrl?: string;
  fileName?: string;
  onDownload?: () => void;
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({
  messageId,
  fileName = 'documento.pdf',
  onDownload,
}) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(() =>
    fileName.toLowerCase().endsWith('.pdf')
  );
  const [viewRequested, setViewRequested] = useState(false);
  const [fullscreenPending, setFullscreenPending] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const blobUrlRef = useRef<string | null>(null);
  const loadingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const isPDF = fileName.toLowerCase().endsWith('.pdf');

  // Carrega e exibe só ao clicar em Expandir ou Tela cheia (evita download automático ao abrir conversa).
  useEffect(() => {
    if (!viewRequested || !messageId || loadingRef.current) return;
    loadingRef.current = true;

    const loadDocument = async () => {
      setIsLoading(true);
      setError(null);
      try {
        if (blobUrlRef.current) {
          URL.revokeObjectURL(blobUrlRef.current);
          blobUrlRef.current = null;
        }
        const apiBaseUrl = import.meta.env.VITE_API_URL || '/api';
        const { accessToken } = useAuthStore.getState();
        if (!accessToken) throw new Error('Sem token de autenticação');
        const res = await fetch(`${apiBaseUrl}/media/${messageId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) throw new Error(`Falha ao carregar: ${res.status}`);
        const buf = await res.arrayBuffer();
        const mime =
          res.headers.get('Content-Type') ||
          (isPDF ? 'application/pdf' : 'application/octet-stream');
        const blob = new Blob([buf], { type: mime });
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        setBlobUrl(url);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Erro ao carregar documento';
        console.error('Error loading document:', err);
        setError(msg);
      } finally {
        setIsLoading(false);
        loadingRef.current = false;
      }
    };

    loadDocument();
    return () => {
      loadingRef.current = false;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [viewRequested, messageId, isPDF]);

  // Tela cheia quando o blob estiver pronto (após clicar em Tela cheia antes de carregar)
  useEffect(() => {
    if (!fullscreenPending || !blobUrl) return;
    const el = containerRef.current;
    if (!el?.requestFullscreen) {
      setFullscreenPending(false);
      return;
    }
    el.requestFullscreen()
      .then(() => setFullscreenPending(false))
      .catch(() => setFullscreenPending(false));
  }, [fullscreenPending, blobUrl]);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const handleExpand = () => {
    setViewRequested(true);
    setIsExpanded((v) => !v);
  };

  const handleFullscreen = () => {
    setViewRequested(true);
    if (blobUrl) {
      containerRef.current?.requestFullscreen?.();
    } else {
      setFullscreenPending(true);
    }
  };

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen?.();
    } else {
      handleFullscreen();
    }
  };

  const getFileExtension = (name: string): string => {
    const parts = name.split('.');
    return parts.length > 1 ? parts[parts.length - 1].toUpperCase() : 'DOC';
  };

  const getFileIcon = (name: string): string => {
    const ext = getFileExtension(name).toLowerCase();
    if (ext === 'pdf') return 'picture_as_pdf';
    if (['doc', 'docx'].includes(ext)) return 'description';
    if (['xls', 'xlsx'].includes(ext)) return 'table_chart';
    if (['ppt', 'pptx'].includes(ext)) return 'slideshow';
    return 'insert_drive_file';
  };

  const renderHeader = (shrinkWrap?: boolean) => (
    <div
      className={`flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 ${shrinkWrap ? 'flex-shrink-0' : ''}`}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: '#F07000' }}
        >
          <span className="material-icons-outlined text-white text-lg">
            {getFileIcon(fileName)}
          </span>
        </div>
        <div>
          <p className="text-sm font-medium text-slate-900 dark:text-white truncate max-w-xs">
            {fileName}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {getFileExtension(fileName)}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {isPDF && (
          <>
            <button
              onClick={handleExpand}
              className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              title={isExpanded ? 'Recolher' : 'Expandir'}
            >
              <span className="material-icons-outlined text-slate-600 dark:text-slate-400 text-sm">
                {isExpanded ? 'unfold_less' : 'unfold_more'}
              </span>
            </button>
            <button
              onClick={toggleFullscreen}
              className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              title={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
            >
              <span className="material-icons-outlined text-slate-600 dark:text-slate-400 text-sm">
                {isFullscreen ? 'fullscreen_exit' : 'fullscreen'}
              </span>
            </button>
          </>
        )}

        {onDownload && (
          <button
            onClick={onDownload}
            className="px-3 py-2 rounded-lg text-white font-medium text-sm flex items-center gap-2 transition-colors"
            style={{ backgroundColor: '#F07000' }}
            title="Baixar documento"
          >
            <span className="material-icons-outlined text-sm">download</span>
            Download
          </button>
        )}
      </div>
    </div>
  );

  // Vista inicial: só header + placeholder. Sem fetch, sem embed.
  if (!viewRequested) {
    return (
      <div
        ref={containerRef}
        className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 w-full max-w-2xl overflow-hidden"
      >
        {renderHeader()}
        {isPDF && (
          <div className="flex flex-col items-center justify-center py-12 px-4 bg-slate-100 dark:bg-slate-900">
            <button
              onClick={() => setViewRequested(true)}
              className="flex flex-col items-center gap-3 px-8 py-5 rounded-xl bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-600 shadow-sm hover:shadow-md hover:border-[#F07000] transition-all"
            >
              <span
                className="material-icons-outlined text-5xl"
                style={{ color: '#F07000' }}
              >
                picture_as_pdf
              </span>
              <span className="text-base font-semibold text-slate-700 dark:text-slate-200">
                Ver PDF
              </span>
            </button>
          </div>
        )}
        {!isPDF && (
          <div className="flex flex-col items-center justify-center p-12 bg-slate-50 dark:bg-slate-900">
            <span className="material-icons-outlined text-6xl text-slate-300 dark:text-slate-600 mb-4">
              {getFileIcon(fileName)}
            </span>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              Visualização não disponível. Use o botão Download.
            </p>
            {onDownload && (
              <button
                onClick={onDownload}
                className="px-4 py-2 rounded-lg text-white font-medium text-sm flex items-center gap-2"
                style={{ backgroundColor: '#F07000' }}
              >
                <span className="material-icons-outlined text-sm">download</span>
                Baixar arquivo
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 w-full max-w-2xl overflow-hidden">
        {renderHeader()}
        <div className="flex items-center justify-center py-16 bg-slate-100 dark:bg-slate-900">
          <div className="flex flex-col items-center gap-2">
            <span className="material-icons-outlined animate-spin text-primary">refresh</span>
            <span className="text-sm text-slate-600 dark:text-slate-400">
              Carregando documento...
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (error || !blobUrl) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 w-full max-w-2xl overflow-hidden">
        {renderHeader()}
        <div className="flex flex-col items-center justify-center py-16 bg-red-50 dark:bg-red-900/20">
          <span className="material-icons-outlined text-red-600 mb-2">error</span>
          <p className="text-sm text-red-600 dark:text-red-400 mb-4">
            {error || 'Erro ao carregar documento'}
          </p>
          {onDownload && (
            <button
              onClick={onDownload}
              className="px-4 py-2 rounded-lg text-white text-sm font-medium"
              style={{ backgroundColor: '#F07000' }}
            >
              Baixar arquivo
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 w-full max-w-2xl overflow-hidden ${isFullscreen ? 'flex flex-col !max-w-none h-screen' : ''}`}
    >
      {renderHeader(!!isFullscreen)}

      {isPDF && (
        <div
          className={`transition-all duration-300 bg-slate-100 dark:bg-slate-900 ${isFullscreen ? 'flex-1 min-h-0' : isExpanded ? 'h-[600px]' : 'h-[400px]'}`}
        >
          <embed
            src={blobUrl}
            type="application/pdf"
            className="w-full h-full border-0"
            title={fileName}
          />
        </div>
      )}

      {!isPDF && (
        <div className="flex flex-col items-center justify-center p-12 bg-slate-50 dark:bg-slate-900">
          <span className="material-icons-outlined text-6xl text-slate-300 dark:text-slate-600 mb-4">
            {getFileIcon(fileName)}
          </span>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
            Visualização não disponível. Use o botão Download.
          </p>
          {onDownload && (
            <button
              onClick={onDownload}
              className="px-4 py-2 rounded-lg text-white font-medium text-sm flex items-center gap-2"
              style={{ backgroundColor: '#F07000' }}
            >
              <span className="material-icons-outlined text-sm">download</span>
              Baixar arquivo
            </button>
          )}
        </div>
      )}
    </div>
  );
};

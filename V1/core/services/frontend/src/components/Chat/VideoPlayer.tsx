import React, { useRef, useState, useEffect } from 'react';
import { useAuthStore } from '../../store/auth.store';
import { mediaService } from '../../services/media.service';

interface VideoPlayerProps {
  messageId: string;
  /** Não usado como src; o player busca vídeo via API. Mantido por compatibilidade. */
  mediaUrl?: string;
  onDownload?: () => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ messageId, onDownload }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const blobUrlRef = useRef<string | null>(null);
  const loadingRef = useRef(false);

  // Buscar vídeo via /api/media/:id (stream com auth). Evita MinIO direto e ERR_BLOCKED_BY_CLIENT.
  useEffect(() => {
    if (loadingRef.current) return;
    loadingRef.current = true;

    const loadVideo = async () => {
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
        if (!res.ok) throw new Error(`Falha ao carregar vídeo: ${res.status}`);

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        setVideoSrc(url);
      } catch (err: any) {
        console.error('Error loading video:', err);
        setError(err?.message || 'Erro ao carregar vídeo');
      } finally {
        setIsLoading(false);
        loadingRef.current = false;
      }
    };

    loadVideo();
    return () => {
      loadingRef.current = false;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [messageId]);

  const togglePlay = () => {
    if (!videoRef.current) return;

    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    setCurrentTime(videoRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    setDuration(videoRef.current.duration);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current) return;
    const newTime = parseFloat(e.target.value);
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current) return;
    const newVolume = parseFloat(e.target.value);
    videoRef.current.volume = newVolume;
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const newMuted = !isMuted;
    videoRef.current.muted = newMuted;
    setIsMuted(newMuted);
    if (newMuted) {
      videoRef.current.volume = 0;
      setVolume(0);
    } else {
      videoRef.current.volume = volume || 0.5;
      setVolume(volume || 0.5);
    }
  };

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;

    try {
      if (!document.fullscreenElement) {
        if (containerRef.current.requestFullscreen) {
          await containerRef.current.requestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
      }
    } catch (err) {
      console.error('Error toggling fullscreen:', err);
    }
  };

  // Sincronizar estado com fullscreen (ex.: usuário sai com Esc)
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const formatTime = (seconds: number): string => {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-lg p-5 max-w-[480px]">
        <div className="flex flex-col items-center gap-1">
          <span className="material-icons-outlined animate-spin text-primary text-lg">refresh</span>
          <span className="text-xs text-slate-600 dark:text-slate-400">Carregando...</span>
        </div>
      </div>
    );
  }

  if (error || !videoSrc) {
    return (
      <div className="flex items-center justify-center bg-red-50 dark:bg-red-900/20 rounded-lg p-5 max-w-[480px]">
        <div className="flex flex-col items-center gap-1">
          <span className="material-icons-outlined text-red-600 text-lg">error</span>
          <span className="text-xs text-red-600 dark:text-red-400">{error || 'Erro ao carregar vídeo'}</span>
        </div>
      </div>
    );
  }

  const handleVideoError = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    const target = e.currentTarget;
    const err = target.error;
    const msg = err?.message || (err?.code === 4 ? 'Formato ou origem não suportados' : 'Erro ao reproduzir');
    setError(msg);
  };

  return (
    <div
      ref={containerRef}
      className={`bg-slate-900 rounded-lg overflow-hidden w-full max-w-[480px] ${isFullscreen ? 'flex flex-col !max-w-none h-screen' : ''}`}
    >
      <div
        className={`relative ${isFullscreen ? 'flex-1 min-h-0' : ''}`}
      >
        <video
          ref={videoRef}
          src={videoSrc}
          className={`w-full object-contain ${isFullscreen ? 'h-full max-h-none' : 'h-auto max-h-[360px]'}`}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          onError={handleVideoError}
        />
      </div>

      {/* Controls */}
      <div className={`bg-slate-800 p-2.5 space-y-2 ${isFullscreen ? 'flex-shrink-0' : ''}`}>
        {/* Progress bar */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-slate-300 min-w-[32px]">{formatTime(currentTime)}</span>
          <input
            type="range"
            min="0"
            max={duration || 0}
            value={currentTime}
            onChange={handleSeek}
            className="flex-1 h-0.5 bg-slate-600 rounded appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, #F07000 0%, #F07000 ${(currentTime / duration) * 100}%, #475569 ${(currentTime / duration) * 100}%, #475569 100%)`,
            }}
          />
          <span className="text-[10px] text-slate-300 min-w-[32px]">{formatTime(duration)}</span>
        </div>

        {/* Control buttons */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {/* Play/Pause */}
            <button
              onClick={togglePlay}
              className="p-2 rounded-full bg-primary hover:bg-primary/90 text-white transition-colors"
              style={{ backgroundColor: '#F07000' }}
            >
              <span className="material-icons-outlined text-sm">
                {isPlaying ? 'pause' : 'play_arrow'}
              </span>
            </button>

            {/* Volume */}
            <button
              onClick={toggleMute}
              className="p-1 rounded-full hover:bg-slate-700 text-white transition-colors"
            >
              <span className="material-icons-outlined" style={{ fontSize: '14px' }}>
                {isMuted || volume === 0 ? 'volume_off' : volume < 0.5 ? 'volume_down' : 'volume_up'}
              </span>
            </button>

            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={volume}
              onChange={handleVolumeChange}
              className="w-14 h-0.5 bg-slate-600 rounded appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #F07000 0%, #F07000 ${volume * 100}%, #475569 ${volume * 100}%, #475569 100%)`,
              }}
            />
          </div>

          <div className="flex items-center gap-1">
            {/* Download */}
            {onDownload && (
              <button
                onClick={onDownload}
                className="p-1.5 rounded hover:bg-slate-700 text-white transition-colors"
                title="Baixar vídeo"
              >
                <span className="material-icons-outlined" style={{ fontSize: '14px' }}>download</span>
              </button>
            )}

            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              className="p-1.5 rounded hover:bg-slate-700 text-white transition-colors"
            >
              <span className="material-icons-outlined" style={{ fontSize: '14px' }}>
                {isFullscreen ? 'fullscreen_exit' : 'fullscreen'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

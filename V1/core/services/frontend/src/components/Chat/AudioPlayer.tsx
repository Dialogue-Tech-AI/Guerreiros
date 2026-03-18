import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../../store/auth.store';

interface AudioPlayerProps {
  mediaUrl: string;
  messageId: string;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ mediaUrl, messageId }) => {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  const blobUrlRef = useRef<string | null>(null);
  const loadingRef = useRef<boolean>(false); // Prevent multiple simultaneous loads

  useEffect(() => {
    // Prevent multiple simultaneous loads
    if (loadingRef.current) {
      return;
    }

    const loadAudio = async () => {
      loadingRef.current = true;

      try {
        setLoading(true);
        setError(false);

        // Cleanup previous blob URL if exists
        if (blobUrlRef.current) {
          URL.revokeObjectURL(blobUrlRef.current);
          blobUrlRef.current = null;
        }

        // Fetch audio with authentication header
        const apiBaseUrl = import.meta.env.VITE_API_URL || '/api';
        const { accessToken } = useAuthStore.getState();
        
        if (!accessToken) {
          throw new Error('No access token available');
        }
        
        const response = await fetch(`${apiBaseUrl}/media/${messageId}`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Failed to load audio:', {
            status: response.status,
            statusText: response.statusText,
            error: errorText,
            messageId,
          });
          throw new Error(`Failed to load audio: ${response.status} - ${errorText}`);
        }

        // Create blob URL from response
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        blobUrlRef.current = blobUrl;
        
        setAudioUrl(blobUrl);
      } catch (err) {
        console.error('Error loading audio:', err);
        setError(true);
      } finally {
        setLoading(false);
        loadingRef.current = false;
      }
    };

    loadAudio();

    // Cleanup blob URL on unmount or messageId change
    return () => {
      loadingRef.current = false; // Reset loading flag
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [messageId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [audioUrl]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;

    const time = Number(e.target.value);
    audio.currentTime = time;
    setCurrentTime(time);
  };

  const formatTime = (seconds: number): string => {
    if (isNaN(seconds)) return '0:00';
    
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="flex items-center space-x-3 p-3 bg-slate-100 dark:bg-slate-700 rounded-lg w-72">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
        <span className="text-sm text-slate-500">Carregando áudio...</span>
      </div>
    );
  }

  if (error || !audioUrl) {
    return (
      <div className="flex items-center space-x-3 p-3 bg-slate-100 dark:bg-slate-700 rounded-lg w-72">
        <span className="material-icons-round text-slate-400">volume_off</span>
        <span className="text-sm text-slate-500">Erro ao carregar áudio</span>
      </div>
    );
  }

  return (
    <div className="audio-player bg-slate-100 dark:bg-slate-700 rounded-lg p-3 w-72">
      <audio ref={audioRef} src={audioUrl} preload="metadata" />
      
      <div className="flex items-center space-x-3">
        <button
          onClick={togglePlay}
          className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full bg-blue-500 hover:bg-blue-600 text-white transition-colors"
        >
          <span className="material-icons-round">
            {isPlaying ? 'pause' : 'play_arrow'}
          </span>
        </button>

        <div className="flex-1">
          <input
            type="range"
            min="0"
            max={duration || 0}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-1 bg-slate-300 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${(currentTime / duration) * 100}%, #cbd5e1 ${(currentTime / duration) * 100}%, #cbd5e1 100%)`,
            }}
          />
          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mt-1">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

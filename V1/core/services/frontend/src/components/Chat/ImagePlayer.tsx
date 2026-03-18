import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuthStore } from '../../store/auth.store';

interface ImagePlayerProps {
  mediaUrl: string;
  caption?: string;
  messageId: string;
}

export const ImagePlayer: React.FC<ImagePlayerProps> = ({ mediaUrl, caption, messageId }) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showZoom, setShowZoom] = useState(false);
  const [mounted, setMounted] = useState(false);
  const blobUrlRef = useRef<string | null>(null);
  const loadingRef = useRef<boolean>(false); // Prevent multiple simultaneous loads

  // Ensure component is mounted before using portal
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Handle Escape key and prevent body scroll when modal is open
  useEffect(() => {
    if (showZoom) {
      // Prevent body scroll
      document.body.style.overflow = 'hidden';
      
      // Handle Escape key
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setShowZoom(false);
        }
      };
      
      document.addEventListener('keydown', handleEscape);
      
      return () => {
        document.body.style.overflow = '';
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [showZoom]);

  useEffect(() => {
    // Prevent multiple simultaneous loads
    if (loadingRef.current) {
      return;
    }

    const loadImage = async () => {
      loadingRef.current = true;

      try {
        setLoading(true);
        setError(false);

        // Cleanup previous blob URL if exists
        if (blobUrlRef.current) {
          URL.revokeObjectURL(blobUrlRef.current);
          blobUrlRef.current = null;
        }

        // Fetch image with authentication header
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
          console.error('Failed to load image:', {
            status: response.status,
            statusText: response.statusText,
            error: errorText,
            messageId,
          });
          throw new Error(`Failed to load image: ${response.status} - ${errorText}`);
        }

        // Create blob URL from response
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        blobUrlRef.current = blobUrl;
        
        setImageUrl(blobUrl);
      } catch (err) {
        console.error('Error loading image:', err);
        setError(true);
      } finally {
        setLoading(false);
        loadingRef.current = false;
      }
    };

    loadImage();

    // Cleanup blob URL on unmount or messageId change
    return () => {
      loadingRef.current = false; // Reset loading flag
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [messageId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center w-64 h-48 bg-slate-100 dark:bg-slate-700 rounded-lg">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error || !imageUrl) {
    return (
      <div className="flex flex-col items-center justify-center w-64 h-48 bg-slate-100 dark:bg-slate-700 rounded-lg">
        <span className="material-icons-round text-4xl text-slate-400 mb-2">broken_image</span>
        <p className="text-sm text-slate-500">Erro ao carregar imagem</p>
      </div>
    );
  }

  // Handle download
  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const apiBaseUrl = import.meta.env.VITE_API_URL || '/api';
      const { accessToken } = useAuthStore.getState();
      
      if (!accessToken) {
        throw new Error('No access token available');
      }
      
      // Use the download endpoint
      const response = await fetch(`${apiBaseUrl}/media/${messageId}/download`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to download image');
      }
      
      // Get filename from Content-Disposition header or use default
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `imagem-${messageId}.jpg`;
      
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?(.+)"?/i);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading image:', error);
    }
  };

  // Modal content - rendered via portal to body
  const modalContent = showZoom && mounted ? (
    <div
      className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center p-4 animate-fadeIn"
      style={{ 
        position: 'fixed', 
        top: 0, 
        left: 0, 
        right: 0, 
        bottom: 0,
        margin: 0,
        padding: '1rem',
        zIndex: 99999,
        width: '100vw',
        height: '100vh',
        overflow: 'auto',
        animation: 'fadeIn 0.2s ease-in-out'
      }}
      onClick={() => setShowZoom(false)}
    >
      <div 
        className="relative max-w-4xl max-h-[85vh] animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
        style={{ 
          position: 'relative',
          animation: 'scaleIn 0.2s ease-out',
          maxWidth: '80vw',
          margin: '0 auto'
        }}
      >
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <img
            src={imageUrl || ''}
            alt={caption || 'Imagem'}
            className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            style={{ 
              maxWidth: '100%', 
              maxHeight: '85vh',
              display: 'block',
              width: 'auto',
              height: 'auto'
            }}
            draggable={false}
          />
          
          {/* Action buttons - canto superior direito, alinhados à imagem */}
          <div 
            className="absolute flex flex-row gap-2 z-10"
            style={{ 
              right: '0.5rem',
              top: '0.5rem'
            }}
          >
          <button
            className="text-white bg-black bg-opacity-70 hover:bg-opacity-90 rounded-full p-2.5 transition-all shadow-lg cursor-pointer flex items-center justify-center"
            onClick={handleDownload}
            aria-label="Baixar imagem"
            title="Baixar imagem"
          >
            <span className="material-icons-round text-xl">download</span>
          </button>
          <button
            className="text-white bg-black bg-opacity-70 hover:bg-opacity-90 rounded-full p-2.5 transition-all shadow-lg cursor-pointer flex items-center justify-center"
            onClick={(e) => {
              e.stopPropagation();
              setShowZoom(false);
            }}
            aria-label="Fechar imagem"
            title="Fechar"
          >
            <span className="material-icons-round text-xl">close</span>
          </button>
        </div>
        </div>
        
        {caption && (
          <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-70 text-white px-4 py-2 rounded-lg max-w-md text-center z-10">
            <p className="text-sm">{caption}</p>
          </div>
        )}
      </div>
    </div>
  ) : null;

  return (
    <>
      <div className="image-player">
        <div 
          className="relative cursor-pointer group"
          onClick={() => setShowZoom(true)}
        >
          <img
            src={imageUrl || ''}
            alt={caption || 'Imagem'}
            className="max-w-xs rounded-lg shadow-sm hover:shadow-md transition-shadow"
            style={{ maxHeight: '300px', objectFit: 'cover' }}
          />
          <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-all rounded-lg flex items-center justify-center">
            <span className="material-icons-round text-white opacity-0 group-hover:opacity-100 text-4xl">
              zoom_in
            </span>
          </div>
        </div>
        {caption && (
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">{caption}</p>
        )}
      </div>

      {/* Render modal using portal to body */}
      {mounted && modalContent && createPortal(modalContent, document.body)}
    </>
  );
};

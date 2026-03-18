import React from 'react';
import { ImagePlayer } from './ImagePlayer';
import { VideoPlayer } from './VideoPlayer';
import { AudioPlayer } from './AudioPlayer';
import { DocumentViewer } from './DocumentViewer';
import { mediaService } from '../../services/media.service';

interface MediaPlayerProps {
  mediaUrl: string;
  mediaType: 'image' | 'video' | 'audio' | 'document';
  caption?: string;
  messageId: string;
}

export const MediaPlayer: React.FC<MediaPlayerProps> = ({
  mediaUrl,
  mediaType,
  caption,
  messageId,
}) => {
  const renderPlayer = () => {
    switch (mediaType) {
      case 'image':
        return <ImagePlayer mediaUrl={mediaUrl} caption={caption} messageId={messageId} />;
      
      case 'video':
        return (
          <div>
            <VideoPlayer 
              messageId={messageId} 
              mediaUrl={mediaUrl}
              onDownload={() => mediaService.downloadMedia(messageId, caption || 'video.mp4')}
            />
            {caption && caption !== '[Mídia]' && caption !== '[Enviando mídia...]' && caption !== '[Vídeo]' && (
              <p className="text-sm mt-2 text-slate-700 dark:text-slate-300">{caption}</p>
            )}
          </div>
        );
      
      case 'audio':
        return <AudioPlayer mediaUrl={mediaUrl} messageId={messageId} />;
      
      case 'document':
        return (
          <div>
            <DocumentViewer 
              messageId={messageId}
              mediaUrl={mediaUrl}
              fileName={caption || 'documento.pdf'}
              onDownload={() => mediaService.downloadMedia(messageId, caption || 'documento.pdf')}
            />
          </div>
        );
      
      default:
        return null;
    }
  };

  return <div className="media-player">{renderPlayer()}</div>;
};

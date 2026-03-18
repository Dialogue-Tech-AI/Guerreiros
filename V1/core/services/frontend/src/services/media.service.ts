import api from './api';

class MediaService {
  /**
   * Upload media file
   */
  async uploadMedia(file: File): Promise<{ mediaUrl: string; mediaType: string; mimeType: string }> {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await api.post('/media/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      return {
        mediaUrl: response.data.mediaUrl,
        mediaType: response.data.mediaType,
        mimeType: response.data.mimeType,
      };
    } catch (error) {
      console.error('Error uploading media:', error);
      throw error;
    }
  }

  /**
   * Get signed URL for media
   */
  async getSignedMediaUrl(messageId: string): Promise<string> {
    const response = await api.get<{
      success: boolean;
      url: string;
      mediaType?: string;
      expiresIn: number;
    }>(`/media/${messageId}/url`);
    
    return response.data.url;
  }

  /**
   * Download media file
   */
  async downloadMedia(messageId: string, fileName?: string): Promise<void> {
    try {
      const response = await api.get(`/media/${messageId}/download`, {
        responseType: 'blob',
      });

      // Create blob URL
      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);

      // Create temporary link and trigger download
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName || `arquivo-${messageId}`;
      document.body.appendChild(link);
      link.click();

      // Cleanup
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading media:', error);
      throw error;
    }
  }

  /**
   * Get media stream URL (for direct playback)
   */
  getMediaStreamUrl(messageId: string): string {
    const baseUrl = import.meta.env.VITE_API_URL || '/api';
    return `${baseUrl}/media/${messageId}`;
  }
}

export const mediaService = new MediaService();

import React, { useState, useRef } from 'react';

interface MediaUploadProps {
  onFileSelect: (file: File) => void;
  onCancel: () => void;
  disabled?: boolean;
}

export const MediaUpload: React.FC<MediaUploadProps> = ({ onFileSelect, onCancel, disabled }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'video/mp4',
      'video/mpeg',
      'video/webm',
      'audio/ogg',
      'audio/mpeg',
      'audio/mp4',
      'audio/wav',
    ];

    if (!validTypes.includes(file.type)) {
      alert('Tipo de arquivo não suportado. Use imagens, vídeos ou áudios.');
      return;
    }

    // Validate file size
    const maxSizes: Record<string, number> = {
      image: 5 * 1024 * 1024, // 5MB
      video: 16 * 1024 * 1024, // 16MB
      audio: 10 * 1024 * 1024, // 10MB
    };

    let maxSize = 5 * 1024 * 1024;
    if (file.type.startsWith('image/')) {
      maxSize = maxSizes.image;
    } else if (file.type.startsWith('video/')) {
      maxSize = maxSizes.video;
    } else if (file.type.startsWith('audio/')) {
      maxSize = maxSizes.audio;
    }

    if (file.size > maxSize) {
      alert(`Arquivo muito grande. Tamanho máximo: ${(maxSize / 1024 / 1024).toFixed(0)}MB`);
      return;
    }

    setSelectedFile(file);

    // Generate preview for images and videos
    if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setPreview(null);
    }
  };

  const handleSend = () => {
    if (selectedFile) {
      onFileSelect(selectedFile);
      setSelectedFile(null);
      setPreview(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleCancel = () => {
    setSelectedFile(null);
    setPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onCancel();
  };

  return (
    <div className="media-upload">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*,audio/*"
        onChange={handleFileChange}
        className="hidden"
        disabled={disabled}
      />

      {!selectedFile ? (
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
          title="Anexar mídia"
        >
          <span className="material-icons-round">attach_file</span>
        </button>
      ) : (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-2xl w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
                Enviar Mídia
              </h3>
              <button
                onClick={handleCancel}
                className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                <span className="material-icons-round">close</span>
              </button>
            </div>

            <div className="mb-4">
              {preview && selectedFile.type.startsWith('image/') && (
                <img
                  src={preview}
                  alt="Preview"
                  className="max-w-full max-h-96 rounded-lg mx-auto"
                />
              )}
              {preview && selectedFile.type.startsWith('video/') && (
                <video
                  src={preview}
                  controls
                  className="max-w-full max-h-96 rounded-lg mx-auto"
                />
              )}
              {selectedFile.type.startsWith('audio/') && (
                <div className="flex items-center space-x-3 p-4 bg-slate-100 dark:bg-slate-700 rounded-lg">
                  <span className="material-icons-round text-blue-500 text-4xl">audiotrack</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      {selectedFile.name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {(selectedFile.size / 1024).toFixed(2)} KB
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={handleCancel}
                className="flex-1 px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSend}
                disabled={disabled}
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
              >
                Enviar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

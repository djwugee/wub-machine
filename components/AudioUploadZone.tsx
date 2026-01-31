'use client';

import { useCallback, useState } from 'react';
import { Upload, Music } from 'lucide-react';

interface AudioUploadZoneProps {
  onFileSelect: (file: File) => void;
  isLoading?: boolean;
}

export default function AudioUploadZone({ onFileSelect, isLoading }: AudioUploadZoneProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleDrag = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragActive(false);

      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        const file = e.dataTransfer.files[0];
        if (isValidAudioFile(file)) {
          setSelectedFile(file);
          onFileSelect(file);
        }
      }
    },
    [onFileSelect]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        if (isValidAudioFile(file)) {
          setSelectedFile(file);
          onFileSelect(file);
        }
      }
    },
    [onFileSelect]
  );

  return (
    <div
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      className={`border-2 border-dashed rounded-lg p-8 text-center transition-all cursor-pointer ${
        isDragActive
          ? 'border-purple-400 bg-purple-500/10'
          : 'border-purple-300/30 hover:border-purple-300/50'
      } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <input
        type="file"
        accept="audio/*"
        onChange={handleChange}
        disabled={isLoading}
        className="hidden"
        id="audio-input"
      />
      <label htmlFor="audio-input" className="cursor-pointer block">
        <div className="flex flex-col items-center gap-3">
          {selectedFile ? (
            <>
              <Music className="w-12 h-12 text-purple-400" />
              <div>
                <p className="text-purple-300 font-semibold">{selectedFile.name}</p>
                <p className="text-purple-400/60 text-sm">
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            </>
          ) : (
            <>
              <Upload className="w-12 h-12 text-purple-400" />
              <div>
                <p className="text-purple-300 font-semibold">
                  Drag your audio file here or click to browse
                </p>
                <p className="text-purple-400/60 text-sm">
                  Supports MP3, WAV, M4A, OGG, WebM
                </p>
              </div>
            </>
          )}
        </div>
      </label>
    </div>
  );
}

function isValidAudioFile(file: File): boolean {
  const validTypes = [
    'audio/mpeg',
    'audio/wav',
    'audio/mp4',
    'audio/ogg',
    'audio/webm',
    'audio/flac',
  ];

  return validTypes.some((type) => file.type.includes(type)) ||
    /\.(mp3|wav|m4a|ogg|webm|flac)$/i.test(file.name);
}

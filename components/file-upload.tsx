'use client';

import { useCallback } from 'react';
import { Upload, Music } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
  className?: string;
}

export function FileUpload({ onFileSelect, disabled, className }: FileUploadProps) {
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();

      if (disabled) return;

      const files = Array.from(e.dataTransfer.files);
      const audioFile = files.find(
        (file) =>
          file.type.startsWith('audio/') ||
          file.name.match(/\.(mp3|wav|ogg|m4a|flac|aac)$/i)
      );

      if (audioFile) {
        onFileSelect(audioFile);
      }
    },
    [onFileSelect, disabled]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        onFileSelect(file);
      }
    },
    [onFileSelect]
  );

  const preventDefault = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={preventDefault}
      onDragEnter={preventDefault}
      className={cn(
        'relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed transition-all',
        disabled
          ? 'border-muted bg-muted/20 cursor-not-allowed opacity-50'
          : 'border-primary/50 bg-secondary/50 hover:border-primary hover:bg-secondary cursor-pointer',
        className
      )}
    >
      <input
        type="file"
        accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac,.aac"
        onChange={handleFileInput}
        disabled={disabled}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
      />

      <div className="flex flex-col items-center justify-center gap-4 p-12">
        <div className="rounded-full bg-primary/20 p-6">
          {disabled ? (
            <Music className="h-12 w-12 text-primary animate-pulse" />
          ) : (
            <Upload className="h-12 w-12 text-primary" />
          )}
        </div>

        <div className="text-center space-y-2">
          <p className="text-lg font-semibold">
            {disabled ? 'Processing...' : 'Drop your audio file here'}
          </p>
          <p className="text-sm text-muted-foreground">
            {disabled
              ? 'Please wait while we process your audio'
              : 'or click to browse (MP3, WAV, OGG, M4A, FLAC, AAC)'}
          </p>
        </div>

        {!disabled && (
          <div className="text-xs text-muted-foreground max-w-md text-center leading-relaxed">
            Upload any audio file to transform it into a dubstep or electro-house remix.
            All processing happens in your browser - your files never leave your device.
          </div>
        )}
      </div>
    </div>
  );
}

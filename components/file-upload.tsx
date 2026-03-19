"use client";

import { useCallback, useState } from "react";
import { Upload, Music, FileAudio } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
}

const ALLOWED_EXTENSIONS = [".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac", ".webm"];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export function FileUpload({ onFileSelect, disabled }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateFile = (file: File): string | null => {
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return `Invalid file type. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return "File too large. Maximum size is 50MB.";
    }
    return null;
  };

  const handleFile = useCallback(
    (file: File) => {
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }
      setError(null);
      onFileSelect(file);
    },
    [onFileSelect]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      if (disabled) return;

      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile, disabled]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div className="w-full max-w-2xl mx-auto">
      <label
        className={cn(
          "relative flex flex-col items-center justify-center w-full h-64 rounded-2xl cursor-pointer transition-all duration-300",
          "border-2 border-dashed",
          disabled
            ? "opacity-50 cursor-not-allowed border-[var(--muted)] bg-[var(--muted)]/20"
            : isDragging
            ? "border-[var(--primary)] bg-[var(--primary)]/10 scale-[1.02]"
            : "border-[var(--border)] bg-[var(--card)]/50 hover:border-[var(--primary)] hover:bg-[var(--card)]"
        )}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <input
          type="file"
          className="hidden"
          accept={ALLOWED_EXTENSIONS.join(",")}
          onChange={handleInputChange}
          disabled={disabled}
        />

        <div className="flex flex-col items-center gap-4 p-6">
          <div
            className={cn(
              "p-4 rounded-full transition-all duration-300",
              isDragging
                ? "bg-[var(--primary)]/20 text-[var(--primary)]"
                : "bg-[var(--muted)] text-[var(--muted-foreground)]"
            )}
          >
            {isDragging ? (
              <FileAudio className="w-10 h-10" />
            ) : (
              <Upload className="w-10 h-10" />
            )}
          </div>

          <div className="text-center">
            <p className="text-lg font-medium text-[var(--foreground)]">
              {isDragging ? "Drop your song here" : "Upload a song to create a remix"}
            </p>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              Drag & drop or click to browse
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
            <Music className="w-4 h-4" />
            <span>MP3, WAV, M4A, AAC, OGG, FLAC up to 50MB</span>
          </div>
        </div>

        {isDragging && (
          <div className="absolute inset-0 rounded-2xl bg-[var(--primary)]/5 pointer-events-none" />
        )}
      </label>

      {error && (
        <p className="mt-3 text-sm text-center text-[var(--destructive)]">{error}</p>
      )}
    </div>
  );
}

'use client'

import { useCallback, useRef, useState } from 'react'
import { useRemixStore } from '@/lib/store'
import { startRemix } from '@/lib/api-client'

// Import the startRemix function to trigger remix processing
// This will upload the file and start the processing pipeline

interface UploadZoneProps {
  onFileSelect: (file: File) => void
  selectedFile: File | null
  remixer: 'dubstep' | 'electrohouse'
}

const SUPPORTED_FORMATS = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/flac']
const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100MB

export default function UploadZone({
  onFileSelect,
  selectedFile,
  remixer,
}: UploadZoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const {
    setIsProcessing,
    updateProgress,
    isProcessing,
  } = useRemixStore()

  const validateFile = (file: File): string | null => {
    if (!SUPPORTED_FORMATS.includes(file.type)) {
      return `Unsupported format. Please upload: MP3, WAV, OGG, or FLAC`
    }
    if (file.size > MAX_FILE_SIZE) {
      return `File too large. Maximum size is 100MB`
    }
    return null
  }

  const handleFile = async (file: File) => {
    setError(null)
    const validation = validateFile(file)
    if (validation) {
      setError(validation)
      return
    }

    onFileSelect(file)
  }

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)

    const files = e.dataTransfer.files
    if (files.length > 0) {
      handleFile(files[0])
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files
    if (files && files.length > 0) {
      handleFile(files[0])
    }
  }

  return (
    <div>
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`group relative rounded-xl border-2 border-dashed transition-all duration-300 overflow-hidden ${
          isDragging
            ? 'border-primary bg-primary/15 shadow-lg shadow-primary/20'
            : selectedFile
              ? 'border-primary/60 bg-primary/5'
              : 'border-border/60 bg-muted/20 hover:border-primary/50 hover:bg-primary/5'
        }`}
      >
        {/* Animated background gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isProcessing}
          className="relative w-full px-6 sm:px-8 py-12 sm:py-16 text-center transition-opacity disabled:opacity-50 cursor-pointer"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleFileSelect}
            disabled={isProcessing}
            className="hidden"
            aria-label="Upload audio file"
          />

          {selectedFile ? (
            <div className="flex flex-col items-center gap-3 animate-fade-in">
              <span className="text-5xl sm:text-6xl">🎵</span>
              <div>
                <p className="font-semibold text-foreground text-lg break-all">
                  {selectedFile.name}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                </p>
              </div>
              {!isProcessing && (
                <p className="text-xs text-muted-foreground/70 mt-2">
                  Click to select different file
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <span className="text-5xl sm:text-6xl transition-transform duration-300 group-hover:scale-110 group-hover:drop-shadow-lg">
                📤
              </span>
              <div className="max-w-xs">
                <p className="font-semibold text-lg text-foreground">
                  Drop your audio file here
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  or click to browse your library
                </p>
              </div>
              <p className="text-xs text-muted-foreground/70 mt-1">
                MP3, WAV, OGG, or FLAC • up to 100MB
              </p>
            </div>
          )}
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 animate-slide-in">
          <p className="text-sm text-destructive font-medium">{error}</p>
        </div>
      )}

      {selectedFile && !isProcessing && (
        <button
          onClick={async () => {
            try {
              setIsProcessing(true)
              updateProgress({
                status: 'uploading',
                step: 'upload',
                progress: 0,
                message: 'Uploading your track...',
              })
              await startRemix(selectedFile, remixer)
            } catch (err) {
              setError(
                err instanceof Error ? err.message : 'Failed to process remix'
              )
              setIsProcessing(false)
              updateProgress({
                status: 'error',
                progress: 0,
                message: 'Processing failed',
                error: err instanceof Error ? err.message : 'Unknown error',
              })
            }
          }}
          className="btn-primary mt-6 w-full py-3 sm:py-4 text-base font-semibold animate-slide-in"
        >
          Start Remix
        </button>
      )}
    </div>
  )
}

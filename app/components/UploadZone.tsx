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
        className={`group relative rounded-2xl border-2 border-dashed transition-all duration-300 ${
          isDragging
            ? 'border-primary bg-primary/10'
            : selectedFile
              ? 'border-primary bg-primary/5'
              : 'border-border bg-muted/30 hover:border-primary/50 hover:bg-primary/5'
        }`}
      >
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isProcessing}
          className="w-full px-8 py-12 text-center transition-opacity disabled:opacity-50"
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
            <div className="flex flex-col items-center gap-2">
              <span className="text-3xl">🎵</span>
              <div>
                <p className="font-semibold text-foreground">
                  {selectedFile.name}
                </p>
                <p className="text-sm text-muted-foreground">
                  {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                </p>
              </div>
              {!isProcessing && (
                <p className="text-xs text-muted-foreground">
                  Click to change file
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <span className="text-4xl transition-transform group-hover:scale-110">
                📤
              </span>
              <div>
                <p className="font-semibold text-foreground">
                  Drop your audio file here
                </p>
                <p className="text-sm text-muted-foreground">
                  or click to browse
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                MP3, WAV, OGG, or FLAC up to 100MB
              </p>
            </div>
          )}
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
          <p className="text-sm text-destructive">{error}</p>
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
          className="mt-4 w-full rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground transition-all hover:bg-primary/90 active:scale-95"
        >
          Start Remix
        </button>
      )}
    </div>
  )
}

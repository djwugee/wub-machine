"use client"

import { useCallback, useState } from "react"
import { Upload, Music, Loader2 } from "lucide-react"

interface AudioUploadZoneProps {
  onFileSelect: (file: File) => void
  isLoading?: boolean
  fileName?: string | null
  fileSize?: number | null
}

export default function AudioUploadZone({ onFileSelect, isLoading, fileName, fileSize }: AudioUploadZoneProps) {
  const [isDragActive, setIsDragActive] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFile = useCallback(
    (file: File) => {
      if (!isValidAudioFile(file)) {
        setError("Unsupported file. Use MP3, WAV, M4A, OGG, FLAC or WebM.")
        return
      }
      setError(null)
      onFileSelect(file)
    },
    [onFileSelect],
  )

  const handleDrag = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") setIsDragActive(true)
    else if (e.type === "dragleave") setIsDragActive(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragActive(false)
      const file = e.dataTransfer.files?.[0]
      if (file) handleFile(file)
    },
    [handleFile],
  )

  return (
    <div>
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={`relative rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          isDragActive ? "border-primary bg-primary/10" : "border-border hover:border-primary/60"
        } ${isLoading ? "opacity-70" : ""}`}
      >
        <input
          type="file"
          accept="audio/*"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          disabled={isLoading}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label="Upload an audio file"
          id="audio-input"
        />
        <div className="flex flex-col items-center gap-3">
          <div
            className={`flex h-14 w-14 items-center justify-center rounded-full ${
              fileName ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
            }`}
          >
            {isLoading ? (
              <Loader2 className="h-7 w-7 animate-spin" />
            ) : fileName ? (
              <Music className="h-7 w-7" />
            ) : (
              <Upload className="h-7 w-7" />
            )}
          </div>

          {fileName ? (
            <div>
              <p className="font-medium text-foreground">{fileName}</p>
              <p className="text-sm text-muted-foreground">
                {fileSize ? `${(fileSize / 1024 / 1024).toFixed(2)} MB · ` : ""}
                {isLoading ? "Analyzing…" : "Click or drop to replace"}
              </p>
            </div>
          ) : (
            <div>
              <p className="font-medium text-foreground text-pretty">Drop a track here or click to browse</p>
              <p className="text-sm text-muted-foreground">MP3, WAV, M4A, OGG, FLAC, WebM</p>
            </div>
          )}
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  )
}

function isValidAudioFile(file: File): boolean {
  const validTypes = ["audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp4", "audio/ogg", "audio/webm", "audio/flac"]
  return validTypes.some((t) => file.type.includes(t)) || /\.(mp3|wav|m4a|ogg|webm|flac|aac)$/i.test(file.name)
}

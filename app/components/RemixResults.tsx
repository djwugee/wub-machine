'use client'

import { useRemixStore } from '@/lib/store'
import AudioPlayer from './AudioPlayer'

interface RemixResultsProps {
  onReset: () => void
}

export default function RemixResults({ onReset }: RemixResultsProps) {
  const { results } = useRemixStore()

  if (!results) {
    return null
  }

  const handleDownload = async () => {
    try {
      const response = await fetch(results.downloadUrl)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `wub-machine-${results.remixer}-remix.wav`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Download failed:', error)
    }
  }

  const remixerLabel =
    results.remixer === 'dubstep' ? 'Dubstep' : 'Electro House'

  return (
    <div className="space-y-8">
      {/* Success Banner */}
      <div className="rounded-2xl border border-green-500/30 bg-green-500/10 px-8 py-6 text-center">
        <div className="mb-2 text-5xl">🎉</div>
        <h2 className="text-2xl font-bold text-foreground">Remix Created!</h2>
        <p className="mt-2 text-muted-foreground">
          Your {remixerLabel} remix is ready to download
        </p>
      </div>

      {/* Audio Player */}
      <AudioPlayer
        audioUrl={results.downloadUrl}
        title={`${remixerLabel} Remix - ${results.originalFile}`}
      />

      {/* Metadata */}
      {results.metadata && (
        <div className="grid gap-4 sm:grid-cols-3 rounded-2xl border border-border bg-card p-6">
          {results.metadata.detectedBPM && (
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Detected BPM</p>
              <p className="mt-1 text-2xl font-bold text-primary">
                {results.metadata.detectedBPM}
              </p>
            </div>
          )}
          {results.metadata.detectedKey && (
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Detected Key</p>
              <p className="mt-1 text-2xl font-bold text-secondary">
                {results.metadata.detectedKey}
              </p>
            </div>
          )}
          {results.metadata.processingTime && (
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Processing Time</p>
              <p className="mt-1 text-2xl font-bold text-accent">
                {results.metadata.processingTime}s
              </p>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          onClick={handleDownload}
          className="flex-1 rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground transition-all hover:bg-primary/90 active:scale-95"
        >
          ⬇ Download Remix
        </button>
        <button
          onClick={onReset}
          className="flex-1 rounded-lg border border-border bg-card px-6 py-3 font-semibold text-foreground transition-all hover:bg-muted active:scale-95"
        >
          Create Another
        </button>
      </div>

      {/* Tips */}
      <div className="rounded-lg border border-border/50 bg-muted/30 px-6 py-4">
        <h4 className="font-semibold text-foreground">Tips for Best Results</h4>
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
          <li>• Upload tracks with clear beat patterns for better detection</li>
          <li>• Avoid heavily compressed or lo-fi audio for optimal remixing</li>
          <li>• Dubstep works best with 80-160 BPM original tracks</li>
          <li>
            • Electro House works best with 100-140 BPM original tracks
          </li>
        </ul>
      </div>
    </div>
  )
}

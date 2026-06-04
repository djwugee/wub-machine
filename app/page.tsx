"use client"

import { useCallback, useRef, useState } from "react"
import { Sparkles, Download, Save, AudioWaveform, AlertCircle } from "lucide-react"
import AudioUploadZone from "@/components/AudioUploadZone"
import RemixStyleSelector from "@/components/RemixStyleSelector"
import ParameterControls from "@/components/ParameterControls"
import ProgressTracker from "@/components/ProgressTracker"
import AudioPlayer from "@/components/AudioPlayer"
import WaveformVisualizer from "@/components/WaveformVisualizer"
import LibraryList from "@/components/LibraryList"
import { usePreferences } from "@/lib/usePreferences"
import { useLibrary } from "@/lib/useLibrary"
import { getDB } from "@/lib/db"
import {
  analyzeBuffer,
  audioBufferToWav,
  decodeAudioFile,
  getAudioContext,
  hashFile,
  renderRemix,
  type AnalysisResult,
} from "@/lib/audio/engine"
import type { RemixProject } from "@/lib/db"

interface SourceState {
  file: File
  buffer: AudioBuffer
  analysis: AnalysisResult
}

interface RemixState {
  buffer: AudioBuffer
  peaks: number[]
  wav: Blob
  saved: boolean
}

export default function Home() {
  const { prefs, setStyle, setVolume, updateParams } = usePreferences()
  const { projects, loading, storage, saveRemix, deleteProject, refresh } = useLibrary()

  const [source, setSource] = useState<SourceState | null>(null)
  const [remix, setRemix] = useState<RemixState | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isRendering, setIsRendering] = useState(false)
  const [progress, setProgress] = useState(0)
  const [stageLabel, setStageLabel] = useState("")
  const [error, setError] = useState<string | null>(null)

  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const accent = prefs.style === "dubstep" ? "primary" : "secondary"

  const handleFileSelect = useCallback(
    async (file: File) => {
      setError(null)
      setRemix(null)
      setIsAnalyzing(true)
      setSource(null)
      try {
        const buffer = await decodeAudioFile(file)

        // Use cached analysis when available
        const hash = await hashFile(file)
        const db = await getDB()
        const cached = await db.getAnalysisCache(hash)

        let analysis: AnalysisResult
        if (cached) {
          analysis = {
            tempo: cached.tempo,
            beats: cached.beats,
            duration: cached.duration,
            sampleRate: buffer.sampleRate,
            peaks: [],
          }
          // peaks aren't cached (UI-only); recompute quickly via analyze if empty
          analysis = { ...analyzeBuffer(buffer), tempo: cached.tempo, beats: cached.beats }
        } else {
          analysis = analyzeBuffer(buffer)
          await db.cacheAnalysis(hash, {
            tempo: analysis.tempo,
            beats: analysis.beats,
            bars: [],
            chromagrams: [],
            loudness: [],
            sections: [],
            duration: analysis.duration,
          })
        }

        setSource({ file, buffer, analysis })
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to decode audio file")
      } finally {
        setIsAnalyzing(false)
      }
    },
    [],
  )

  const runProgress = useCallback(() => {
    setProgress(0)
    const stages = [
      { at: 10, label: "Preparing offline render" },
      { at: 35, label: "Synthesizing beats & bass" },
      { at: 65, label: "Applying effects chain" },
      { at: 90, label: "Mixing & limiting" },
    ]
    let p = 0
    if (progressTimer.current) clearInterval(progressTimer.current)
    progressTimer.current = setInterval(() => {
      p = Math.min(95, p + Math.random() * 12)
      setProgress(p)
      const stage = [...stages].reverse().find((s) => p >= s.at)
      if (stage) setStageLabel(stage.label)
    }, 120)
  }, [])

  const stopProgress = useCallback(() => {
    if (progressTimer.current) clearInterval(progressTimer.current)
    progressTimer.current = null
    setProgress(100)
  }, [])

  const handleRender = useCallback(async () => {
    if (!source) return
    setError(null)
    setIsRendering(true)
    setRemix(null)
    setStageLabel("Preparing offline render")
    runProgress()
    try {
      // Ensure audio context is unlocked by this user gesture
      const ctx = getAudioContext()
      if (ctx.state === "suspended") await ctx.resume()

      const rendered = await renderRemix(source.buffer, source.analysis, prefs.style, prefs.params)
      const peaks = computePeaksFromBuffer(rendered, 1200)
      const wav = audioBufferToWav(rendered)
      stopProgress()
      setRemix({ buffer: rendered, peaks, wav, saved: false })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remix rendering failed")
    } finally {
      setIsRendering(false)
      setTimeout(() => setProgress(0), 600)
    }
  }, [source, prefs.style, prefs.params, runProgress, stopProgress])

  const handleDownload = useCallback(() => {
    if (!remix || !source) return
    const url = URL.createObjectURL(remix.wav)
    const a = document.createElement("a")
    a.href = url
    a.download = `${source.file.name.replace(/\.[^/.]+$/, "")}-${prefs.style}.wav`
    a.click()
    URL.revokeObjectURL(url)
  }, [remix, source, prefs.style])

  const handleSave = useCallback(async () => {
    if (!remix || !source) return
    try {
      await saveRemix({
        originalFileName: source.file.name,
        originalFileSize: source.file.size,
        style: prefs.style,
        wavBlob: remix.wav,
        tempo: source.analysis.tempo,
        beats: source.analysis.beats,
        duration: remix.buffer.duration,
      })
      setRemix((r) => (r ? { ...r, saved: true } : r))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save remix")
    }
  }, [remix, source, prefs.style, saveRemix])

  const handlePlaySaved = useCallback(
    async (project: RemixProject) => {
      const entry = project.remixes[0]
      if (!entry) return
      try {
        const ctx = getAudioContext()
        const buffer = await ctx.decodeAudioData(entry.audioData.slice(0))
        const peaks = computePeaksFromBuffer(buffer, 1200)
        const wav = new Blob([entry.audioData], { type: "audio/wav" })
        setSource(null)
        setRemix({ buffer, peaks, wav, saved: true })
        setStyle(entry.style)
      } catch {
        setError("Could not load saved remix")
      }
    },
    [setStyle],
  )

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <AudioWaveform className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">Wub Machine</h1>
            <p className="text-sm text-muted-foreground">Browser-native Dubstep & ElectroHouse remixer</p>
          </div>
          <span className="ml-auto hidden rounded-full border border-border px-3 py-1 text-xs text-muted-foreground sm:inline">
            100% client-side · no uploads
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          {/* Left column: source + controls */}
          <div className="space-y-6">
            <section className="rounded-2xl border border-border bg-card p-5">
              <h2 className="mb-4 font-semibold text-foreground">1 · Load a track</h2>
              <AudioUploadZone
                onFileSelect={handleFileSelect}
                isLoading={isAnalyzing}
                fileName={source?.file.name ?? null}
                fileSize={source?.file.size ?? null}
              />
              {source && (
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <Stat label="Tempo" value={`${Math.round(source.analysis.tempo)} BPM`} />
                  <Stat label="Beats" value={`${source.analysis.beats.length}`} />
                  <Stat label="Duration" value={formatTime(source.analysis.duration)} />
                </div>
              )}
              {source && (
                <div className="mt-4">
                  <WaveformVisualizer peaks={source.analysis.peaks} accent={accent} height={64} />
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-border bg-card p-5">
              <h2 className="mb-4 font-semibold text-foreground">2 · Pick a style</h2>
              <RemixStyleSelector
                selectedStyle={prefs.style}
                onStyleChange={setStyle}
                disabled={isRendering}
              />
            </section>

            <section className="rounded-2xl border border-border bg-card p-5">
              <h2 className="mb-4 font-semibold text-foreground">3 · Shape the sound</h2>
              <ParameterControls
                style={prefs.style}
                params={prefs.params}
                onChange={updateParams}
                disabled={isRendering}
              />
            </section>
          </div>

          {/* Right column: render + output + library */}
          <div className="space-y-6">
            <section className="rounded-2xl border border-border bg-card p-5">
              <h2 className="mb-4 font-semibold text-foreground">4 · Render & preview</h2>

              <button
                type="button"
                onClick={handleRender}
                disabled={!source || isRendering || isAnalyzing}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Sparkles className="h-5 w-5" />
                {isRendering ? "Rendering…" : "Generate Remix"}
              </button>

              {isRendering && (
                <div className="mt-4">
                  <ProgressTracker progress={progress} stageLabel={stageLabel} style={prefs.style} />
                </div>
              )}

              {error && (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}

              {remix && (
                <div className="mt-5 space-y-4">
                  <AudioPlayer
                    buffer={remix.buffer}
                    peaks={remix.peaks}
                    accent={accent}
                    volume={prefs.volume}
                    onVolumeChange={setVolume}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={handleDownload}
                      className="flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 font-medium text-foreground transition-colors hover:bg-muted"
                    >
                      <Download className="h-4 w-4" />
                      Download WAV
                    </button>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={remix.saved}
                      className="flex items-center justify-center gap-2 rounded-lg bg-secondary px-4 py-2.5 font-medium text-secondary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      <Save className="h-4 w-4" />
                      {remix.saved ? "Saved" : "Save"}
                    </button>
                  </div>
                </div>
              )}

              {!remix && !isRendering && (
                <p className="mt-4 text-sm text-muted-foreground text-pretty">
                  {source
                    ? "Adjust the parameters and generate your remix. Everything renders locally."
                    : "Load a track to get started."}
                </p>
              )}
            </section>

            <section className="rounded-2xl border border-border bg-card p-5">
              <LibraryList
                projects={projects}
                loading={loading}
                storage={storage}
                onPlay={handlePlaySaved}
                onDelete={async (id) => {
                  await deleteProject(id)
                  await refresh()
                }}
              />
            </section>
          </div>
        </div>
      </div>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-5xl px-4 py-6 text-center text-xs text-muted-foreground">
          Audio is decoded, analyzed, remixed and stored entirely in your browser. No files ever leave your device.
        </div>
      </footer>
    </main>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3 text-center">
      <p className="font-mono text-lg font-semibold text-foreground tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

function computePeaksFromBuffer(buffer: AudioBuffer, buckets: number): number[] {
  const channels = buffer.numberOfChannels
  const length = buffer.length
  const out = new Array<number>(buckets).fill(0)
  const bucketSize = Math.floor(length / buckets) || 1
  let max = 0
  const data: Float32Array[] = []
  for (let c = 0; c < channels; c++) data.push(buffer.getChannelData(c))

  for (let b = 0; b < buckets; b++) {
    let peak = 0
    const start = b * bucketSize
    for (let i = 0; i < bucketSize; i++) {
      let sample = 0
      for (let c = 0; c < channels; c++) sample += Math.abs(data[c][start + i] || 0)
      sample /= channels
      if (sample > peak) peak = sample
    }
    out[b] = peak
    if (peak > max) max = peak
  }
  if (max > 0) for (let b = 0; b < buckets; b++) out[b] /= max
  return out
}

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

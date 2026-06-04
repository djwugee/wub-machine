"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause, Volume2, Volume1, VolumeX } from "lucide-react"
import { getAudioContext } from "@/lib/audio/engine"
import WaveformVisualizer from "./WaveformVisualizer"

interface AudioPlayerProps {
  buffer: AudioBuffer
  peaks: number[]
  accent?: "primary" | "secondary"
  volume: number
  onVolumeChange: (v: number) => void
}

export default function AudioPlayer({ buffer, peaks, accent = "primary", volume, onVolumeChange }: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)

  const sourceRef = useRef<AudioBufferSourceNode | null>(null)
  const gainRef = useRef<GainNode | null>(null)
  const startTimeRef = useRef(0)
  const startOffsetRef = useRef(0)
  const rafRef = useRef<number | null>(null)

  const duration = buffer.duration

  const stopInternal = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.onended = null
      try {
        sourceRef.current.stop()
      } catch {
        /* already stopped */
      }
      sourceRef.current.disconnect()
      sourceRef.current = null
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
  }, [])

  // Stop playback when the buffer changes (new remix rendered)
  useEffect(() => {
    stopInternal()
    setIsPlaying(false)
    setCurrentTime(0)
    startOffsetRef.current = 0
  }, [buffer, stopInternal])

  useEffect(() => {
    return () => stopInternal()
  }, [stopInternal])

  // Keep gain in sync with volume
  useEffect(() => {
    if (gainRef.current) gainRef.current.gain.value = volume
  }, [volume])

  const tick = useCallback(() => {
    const ctx = getAudioContext()
    const elapsed = ctx.currentTime - startTimeRef.current + startOffsetRef.current
    if (elapsed >= duration) {
      stopInternal()
      setIsPlaying(false)
      setCurrentTime(0)
      startOffsetRef.current = 0
      return
    }
    setCurrentTime(elapsed)
    rafRef.current = requestAnimationFrame(tick)
  }, [duration, stopInternal])

  const playFrom = useCallback(
    (offset: number) => {
      const ctx = getAudioContext()
      if (ctx.state === "suspended") void ctx.resume()
      stopInternal()

      const source = ctx.createBufferSource()
      source.buffer = buffer
      const gain = ctx.createGain()
      gain.gain.value = volume
      source.connect(gain)
      gain.connect(ctx.destination)

      source.onended = () => {
        if (sourceRef.current === source) {
          setIsPlaying(false)
        }
      }

      source.start(0, offset)
      sourceRef.current = source
      gainRef.current = gain
      startTimeRef.current = ctx.currentTime
      startOffsetRef.current = offset
      setIsPlaying(true)
      rafRef.current = requestAnimationFrame(tick)
    },
    [buffer, volume, stopInternal, tick],
  )

  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      const ctx = getAudioContext()
      const elapsed = ctx.currentTime - startTimeRef.current + startOffsetRef.current
      startOffsetRef.current = Math.min(elapsed, duration)
      stopInternal()
      setIsPlaying(false)
    } else {
      playFrom(startOffsetRef.current >= duration ? 0 : startOffsetRef.current)
    }
  }, [isPlaying, duration, playFrom, stopInternal])

  const handleSeek = useCallback(
    (fraction: number) => {
      const offset = fraction * duration
      setCurrentTime(offset)
      if (isPlaying) playFrom(offset)
      else startOffsetRef.current = offset
    },
    [duration, isPlaying, playFrom],
  )

  const VolumeIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2

  return (
    <div className="space-y-4">
      <WaveformVisualizer
        peaks={peaks}
        progress={duration > 0 ? currentTime / duration : 0}
        accent={accent}
        onSeek={handleSeek}
      />

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={handlePlayPause}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-105"
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
        </button>

        <span className="font-mono text-sm text-muted-foreground tabular-nums">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <VolumeIcon className="h-4 w-4 text-muted-foreground" />
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => onVolumeChange(Number.parseFloat(e.target.value))}
            className="w-24"
            aria-label="Volume"
          />
        </div>
      </div>
    </div>
  )
}

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

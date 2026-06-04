"use client"

import { useEffect, useRef } from "react"

interface WaveformVisualizerProps {
  peaks: number[]
  progress?: number // 0..1
  accent?: "primary" | "secondary"
  height?: number
  onSeek?: (fraction: number) => void
}

export default function WaveformVisualizer({
  peaks,
  progress = 0,
  accent = "primary",
  height = 96,
  onSeek,
}: WaveformVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const cssWidth = canvas.clientWidth
    const cssHeight = height
    canvas.width = Math.floor(cssWidth * dpr)
    canvas.height = Math.floor(cssHeight * dpr)
    ctx.scale(dpr, dpr)

    const styles = getComputedStyle(document.documentElement)
    const accentColor = styles.getPropertyValue(accent === "primary" ? "--primary" : "--secondary").trim()
    const mutedColor = styles.getPropertyValue("--muted-foreground").trim()

    ctx.clearRect(0, 0, cssWidth, cssHeight)

    const mid = cssHeight / 2
    const count = peaks.length
    if (count === 0) return
    const barWidth = cssWidth / count
    const playedX = progress * cssWidth

    for (let i = 0; i < count; i++) {
      const x = i * barWidth
      const amp = Math.max(0.02, peaks[i]) * (cssHeight / 2) * 0.92
      ctx.fillStyle = x <= playedX ? `oklch(${accentColor})` : `oklch(${mutedColor})`
      ctx.globalAlpha = x <= playedX ? 1 : 0.4
      const w = Math.max(1, barWidth - 0.5)
      ctx.fillRect(x, mid - amp, w, amp * 2)
    }
    ctx.globalAlpha = 1
  }, [peaks, progress, accent, height])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height }}
      className={onSeek ? "cursor-pointer rounded-lg" : "rounded-lg"}
      onClick={(e) => {
        if (!onSeek) return
        const rect = e.currentTarget.getBoundingClientRect()
        onSeek(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)))
      }}
      role="img"
      aria-label="Audio waveform"
    />
  )
}

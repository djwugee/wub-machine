"use client"

import type { RemixParams, RemixStyle } from "@/lib/audio/engine"

interface ParameterControlsProps {
  style: RemixStyle
  params: RemixParams
  onChange: <S extends RemixStyle>(style: S, patch: Partial<RemixParams[S]>) => void
  disabled?: boolean
}

interface SliderDef {
  key: string
  label: string
  min: number
  max: number
  step: number
  format: (v: number) => string
}

function pct(v: number) {
  return `${Math.round(v * 100)}%`
}

const SLIDERS: Record<RemixStyle, SliderDef[]> = {
  dubstep: [
    { key: "wobbleRate", label: "Wobble Rate", min: 0.25, max: 4, step: 0.25, format: (v) => `${v.toFixed(2)}×/beat` },
    { key: "bassBoost", label: "Bass Boost", min: 0, max: 1, step: 0.01, format: pct },
    { key: "grit", label: "Grit / Drive", min: 0, max: 1, step: 0.01, format: pct },
    { key: "wetMix", label: "Wet Mix", min: 0, max: 1, step: 0.01, format: pct },
  ],
  electrohouse: [
    { key: "pump", label: "Sidechain Pump", min: 0, max: 1, step: 0.01, format: pct },
    { key: "kickLevel", label: "Kick Level", min: 0, max: 1, step: 0.01, format: pct },
    { key: "hatLevel", label: "Hat Level", min: 0, max: 1, step: 0.01, format: pct },
    { key: "wetMix", label: "Wet Mix", min: 0, max: 1, step: 0.01, format: pct },
  ],
  boombap: [
    { key: "swing", label: "Swing", min: 0, max: 1, step: 0.01, format: pct },
    { key: "vinyl", label: "Vinyl Crackle", min: 0, max: 1, step: 0.01, format: pct },
    { key: "kickLevel", label: "Kick Level", min: 0, max: 1, step: 0.01, format: pct },
    { key: "snareLevel", label: "Snare Level", min: 0, max: 1, step: 0.01, format: pct },
    { key: "wetMix", label: "Wet Mix", min: 0, max: 1, step: 0.01, format: pct },
  ],
  trap: [
    { key: "sub808", label: "808 Sub", min: 0, max: 1, step: 0.01, format: pct },
    { key: "hatRolls", label: "Hat Rolls", min: 0, max: 1, step: 0.01, format: pct },
    { key: "kickLevel", label: "Kick Level", min: 0, max: 1, step: 0.01, format: pct },
    { key: "wetMix", label: "Wet Mix", min: 0, max: 1, step: 0.01, format: pct },
  ],
  lofi: [
    { key: "slowdown", label: "Slowdown", min: 0, max: 1, step: 0.01, format: (v) => `${(1 - v * 0.25).toFixed(2)}×` },
    { key: "warmth", label: "Warmth", min: 0, max: 1, step: 0.01, format: pct },
    { key: "vinyl", label: "Vinyl Crackle", min: 0, max: 1, step: 0.01, format: pct },
    { key: "wetMix", label: "Wet Mix", min: 0, max: 1, step: 0.01, format: pct },
  ],
  dnb: [
    { key: "breakIntensity", label: "Break Intensity", min: 0, max: 1, step: 0.01, format: pct },
    { key: "reese", label: "Reese Bass", min: 0, max: 1, step: 0.01, format: pct },
    { key: "kickLevel", label: "Kick Level", min: 0, max: 1, step: 0.01, format: pct },
    { key: "wetMix", label: "Wet Mix", min: 0, max: 1, step: 0.01, format: pct },
  ],
  futurebass: [
    { key: "pump", label: "Sidechain Pump", min: 0, max: 1, step: 0.01, format: pct },
    { key: "width", label: "Stereo Width", min: 0, max: 1, step: 0.01, format: pct },
    { key: "shimmer", label: "Octave Shimmer", min: 0, max: 1, step: 0.01, format: pct },
    { key: "wetMix", label: "Wet Mix", min: 0, max: 1, step: 0.01, format: pct },
  ],
}

export default function ParameterControls({ style, params, onChange, disabled }: ParameterControlsProps) {
  const sliders = SLIDERS[style]
  const current = params[style] as unknown as Record<string, number>

  return (
    <div className="space-y-4">
      {sliders.map((s) => {
        const value = current[s.key]
        return (
          <div key={s.key}>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor={`param-${s.key}`} className="text-sm font-medium text-foreground">
                {s.label}
              </label>
              <span className="font-mono text-xs text-muted-foreground tabular-nums">{s.format(value)}</span>
            </div>
            <input
              id={`param-${s.key}`}
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={value}
              disabled={disabled}
              onChange={(e) => {
                const v = Number.parseFloat(e.target.value)
                onChange(style, { [s.key]: v } as Partial<RemixParams[typeof style]>)
              }}
              className="w-full disabled:opacity-50"
              aria-valuetext={s.format(value)}
            />
          </div>
        )
      })}
    </div>
  )
}

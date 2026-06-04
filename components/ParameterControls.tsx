"use client"

import type { DubstepParams, ElectroHouseParams, RemixParams, RemixStyle } from "@/lib/audio/engine"

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

const DUBSTEP_SLIDERS: SliderDef[] = [
  { key: "wobbleRate", label: "Wobble Rate", min: 0.25, max: 4, step: 0.25, format: (v) => `${v.toFixed(2)}×/beat` },
  { key: "bassBoost", label: "Bass Boost", min: 0, max: 1, step: 0.01, format: pct },
  { key: "grit", label: "Grit / Drive", min: 0, max: 1, step: 0.01, format: pct },
  { key: "wetMix", label: "Wet Mix", min: 0, max: 1, step: 0.01, format: pct },
]

const ELECTRO_SLIDERS: SliderDef[] = [
  { key: "pump", label: "Sidechain Pump", min: 0, max: 1, step: 0.01, format: pct },
  { key: "kickLevel", label: "Kick Level", min: 0, max: 1, step: 0.01, format: pct },
  { key: "hatLevel", label: "Hat Level", min: 0, max: 1, step: 0.01, format: pct },
  { key: "wetMix", label: "Wet Mix", min: 0, max: 1, step: 0.01, format: pct },
]

function pct(v: number) {
  return `${Math.round(v * 100)}%`
}

export default function ParameterControls({ style, params, onChange, disabled }: ParameterControlsProps) {
  const sliders = style === "dubstep" ? DUBSTEP_SLIDERS : ELECTRO_SLIDERS
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
                if (style === "dubstep") {
                  onChange("dubstep", { [s.key]: v } as Partial<DubstepParams>)
                } else {
                  onChange("electrohouse", { [s.key]: v } as Partial<ElectroHouseParams>)
                }
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

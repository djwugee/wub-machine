"use client"

import { Waves, Zap, Disc3, Drum, Radio, Activity, Sparkles } from "lucide-react"
import { STYLE_META, STYLE_ORDER, type RemixStyle } from "@/lib/audio/engine"

interface RemixStyleSelectorProps {
  selectedStyle: RemixStyle
  onStyleChange: (style: RemixStyle) => void
  disabled?: boolean
}

const ICONS: Record<RemixStyle, typeof Waves> = {
  dubstep: Waves,
  electrohouse: Zap,
  boombap: Drum,
  trap: Activity,
  lofi: Disc3,
  dnb: Radio,
  futurebass: Sparkles,
}

export default function RemixStyleSelector({ selectedStyle, onStyleChange, disabled }: RemixStyleSelectorProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Remix style">
      {STYLE_ORDER.map((id) => {
        const style = STYLE_META[id]
        const isSelected = selectedStyle === id
        const Icon = ICONS[id]
        const isPrimary = style.accent === "primary"
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={disabled}
            onClick={() => onStyleChange(id)}
            className={`flex flex-col gap-3 rounded-xl border p-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
              isSelected
                ? isPrimary
                  ? "border-primary bg-primary/10 ring-1 ring-primary"
                  : "border-secondary bg-secondary/10 ring-1 ring-secondary"
                : "border-border bg-card hover:border-muted-foreground/40"
            }`}
          >
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                isPrimary
                  ? isSelected
                    ? "bg-primary text-primary-foreground"
                    : "bg-primary/15 text-primary"
                  : isSelected
                    ? "bg-secondary text-secondary-foreground"
                    : "bg-secondary/15 text-secondary"
              }`}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-foreground">{style.label}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground text-pretty">{style.description}</p>
            </div>
          </button>
        )
      })}
    </div>
  )
}

"use client"

import { Waves, Zap } from "lucide-react"
import type { RemixStyle } from "@/lib/audio/engine"

interface RemixStyleSelectorProps {
  selectedStyle: RemixStyle
  onStyleChange: (style: RemixStyle) => void
  disabled?: boolean
}

const STYLES: Array<{
  id: RemixStyle
  name: string
  description: string
  icon: typeof Waves
  accent: "primary" | "secondary"
}> = [
  {
    id: "dubstep",
    name: "Dubstep",
    description: "Half-time wobble bass, gritty sub & heavy sidechain",
    icon: Waves,
    accent: "primary",
  },
  {
    id: "electrohouse",
    name: "ElectroHouse",
    description: "Four-on-the-floor kick, off-beat hats & pumping mix",
    icon: Zap,
    accent: "secondary",
  },
]

export default function RemixStyleSelector({ selectedStyle, onStyleChange, disabled }: RemixStyleSelectorProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Remix style">
      {STYLES.map((style) => {
        const isSelected = selectedStyle === style.id
        const Icon = style.icon
        const isPrimary = style.accent === "primary"
        return (
          <button
            key={style.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={disabled}
            onClick={() => onStyleChange(style.id)}
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
              <p className="font-semibold text-foreground">{style.name}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground text-pretty">{style.description}</p>
            </div>
          </button>
        )
      })}
    </div>
  )
}

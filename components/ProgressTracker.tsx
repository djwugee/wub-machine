"use client"

import { Loader2 } from "lucide-react"
import type { Accent } from "@/lib/audio/engine"

interface ProgressTrackerProps {
  progress: number
  stageLabel: string
  accent: Accent
  styleLabel: string
}

export default function ProgressTracker({ progress, stageLabel, accent, styleLabel }: ProgressTrackerProps) {
  const pct = Math.round(progress)
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Loader2 className={`h-4 w-4 animate-spin ${accent === "primary" ? "text-primary" : "text-secondary"}`} />
          <p className="font-medium text-foreground">{stageLabel}</p>
        </div>
        <p className="font-mono text-sm text-muted-foreground tabular-nums">{pct}%</p>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all duration-300 ease-out ${
            accent === "primary" ? "bg-primary" : "bg-secondary"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{styleLabel} remix · processed locally in your browser</p>
    </div>
  )
}

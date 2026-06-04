"use client"

import { Download, Trash2, Waves, Zap, HardDrive } from "lucide-react"
import type { RemixProject } from "@/lib/db"

interface LibraryListProps {
  projects: RemixProject[]
  loading: boolean
  storage: { used: number; quota: number }
  onPlay: (project: RemixProject) => void
  onDelete: (id: string) => void
}

export default function LibraryList({ projects, loading, storage, onPlay, onDelete }: LibraryListProps) {
  return (
    <section aria-labelledby="library-heading">
      <div className="mb-4 flex items-center justify-between">
        <h2 id="library-heading" className="text-lg font-semibold text-foreground">
          Saved Remixes
        </h2>
        {storage.quota > 0 && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <HardDrive className="h-3.5 w-3.5" />
            {formatBytes(storage.used)} used
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading library…</p>
      ) : projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground text-pretty">
            No saved remixes yet. Render a track and hit Save to keep it here — stored locally on this device.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {projects.map((project) => {
            const remix = project.remixes[0]
            const isDubstep = remix?.style === "dubstep"
            return (
              <li
                key={project.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${
                    isDubstep ? "bg-primary/15 text-primary" : "bg-secondary/15 text-secondary"
                  }`}
                >
                  {isDubstep ? <Waves className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
                </div>
                <button
                  type="button"
                  onClick={() => onPlay(project)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate font-medium text-foreground">{project.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {remix ? `${Math.round(remix.tempo)} BPM · ${formatTime(remix.duration)}` : ""} ·{" "}
                    {new Date(project.createdAt).toLocaleDateString()}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => downloadProject(project)}
                  className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label={`Download ${project.name}`}
                >
                  <Download className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(project.id)}
                  className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
                  aria-label={`Delete ${project.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function downloadProject(project: RemixProject) {
  const remix = project.remixes[0]
  if (!remix) return
  const blob = new Blob([remix.audioData], { type: "audio/wav" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${project.name}.wav`
  a.click()
  URL.revokeObjectURL(url)
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

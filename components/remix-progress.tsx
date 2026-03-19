"use client";

import { cn } from "@/lib/utils";
import type { RemixProgress } from "@/lib/audio-engine";
import { Loader2, Music, Waves, Download, AlertCircle } from "lucide-react";


interface RemixProgressDisplayProps {
  progress: RemixProgress;
  fileName?: string;
}

const STATUS_ICONS = {
  analyzing: Waves,
  remixing: Music,
  encoding: Download,
  complete: Music,
  error: AlertCircle,
};

const STATUS_COLORS = {
  analyzing: "var(--primary)",
  remixing: "var(--secondary)",
  encoding: "var(--accent)",
  complete: "#22c55e",
  error: "var(--destructive)",
};

export function RemixProgressDisplay({ progress, fileName }: RemixProgressDisplayProps) {
  const Icon = STATUS_ICONS[progress.status];
  const color = STATUS_COLORS[progress.status];
  const percentage = Math.round(progress.progress * 100);

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="bg-[var(--card)] rounded-2xl p-8 border border-[var(--border)]">
        {/* File name */}
        {fileName && (
          <p className="text-sm text-[var(--muted-foreground)] text-center mb-6 truncate">
            {fileName}
          </p>
        )}

        {/* Icon and status */}
        <div className="flex flex-col items-center gap-4 mb-8">
          <div
            className={cn(
              "relative p-4 rounded-full",
              progress.status === "error"
                ? "bg-[var(--destructive)]/10"
                : "bg-[var(--muted)]"
            )}
          >
            {progress.status !== "complete" && progress.status !== "error" ? (
              <Loader2
                className="w-10 h-10 animate-spin"
                style={{ color }}
              />
            ) : (
              <Icon className="w-10 h-10" style={{ color }} />
            )}
          </div>

          <div className="text-center">
            <p className="text-lg font-medium text-[var(--foreground)]">
              {progress.text}
            </p>
            {progress.status !== "complete" && progress.status !== "error" && (
              <p className="text-3xl font-bold mt-2" style={{ color }}>
                {percentage}%
              </p>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {progress.status !== "complete" && progress.status !== "error" && (
          <div className="w-full h-3 bg-[var(--muted)] rounded-full overflow-hidden">
            <div
              className="h-full progress-bar rounded-full transition-all duration-300 ease-out"
              style={{ width: `${percentage}%` }}
            />
          </div>
        )}

        {/* Status steps */}
        <div className="flex justify-between mt-6 text-xs text-[var(--muted-foreground)]">
          <span
            className={cn(
              "transition-colors",
              ["analyzing", "remixing", "encoding", "complete"].includes(progress.status) &&
                "text-[var(--foreground)]"
            )}
          >
            Analyzing
          </span>
          <span
            className={cn(
              "transition-colors",
              ["remixing", "encoding", "complete"].includes(progress.status) &&
                "text-[var(--foreground)]"
            )}
          >
            Remixing
          </span>
          <span
            className={cn(
              "transition-colors",
              ["encoding", "complete"].includes(progress.status) &&
                "text-[var(--foreground)]"
            )}
          >
            Encoding
          </span>
          <span
            className={cn(
              "transition-colors",
              progress.status === "complete" && "text-[var(--foreground)]"
            )}
          >
            Complete
          </span>
        </div>
      </div>
    </div>
  );
}

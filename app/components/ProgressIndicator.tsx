'use client'

import { useEffect, useState } from 'react'
import { RemixProgress } from '@/lib/store'

const STEP_LABELS: Record<string, string> = {
  upload: 'Uploading',
  beat_detection: 'Detecting Beats',
  key_detection: 'Detecting Key',
  sample_placement: 'Placing Samples',
  synthesis: 'Synthesizing',
  mixing: 'Mixing Audio',
  export: 'Exporting',
}

const STEP_ORDER = [
  'upload',
  'beat_detection',
  'key_detection',
  'sample_placement',
  'synthesis',
  'mixing',
  'export',
]

interface ProgressIndicatorProps {
  progress: RemixProgress
}

export default function ProgressIndicator({
  progress,
}: ProgressIndicatorProps) {
  const [animationKey, setAnimationKey] = useState(0)

  useEffect(() => {
    setAnimationKey((k) => k + 1)
  }, [progress.step])

  const currentStepIndex = STEP_ORDER.indexOf(progress.step as string)
  const completedSteps = currentStepIndex

  return (
    <div className="space-y-7 card rounded-xl p-6 sm:p-8 animate-fade-in">
      {/* Status Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h3 className="text-lg sm:text-xl font-bold text-foreground">
            {progress.status === 'complete'
              ? 'Remix Complete!'
              : progress.status === 'error'
                ? 'Processing Failed'
                : 'Processing Your Remix'}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            {progress.message}
          </p>
        </div>
        {progress.status === 'complete' && (
          <div className="text-4xl sm:text-5xl animate-bounce">✨</div>
        )}
        {progress.status === 'error' && (
          <div className="text-4xl sm:text-5xl">⚠️</div>
        )}
      </div>

      {/* Overall Progress Bar */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-muted-foreground">Overall Progress</span>
          <span className="font-bold text-foreground text-lg">
            {Math.round(progress.progress * 100)}%
          </span>
        </div>
        <div className="relative h-2 sm:h-3 overflow-hidden rounded-full bg-muted/50 ring-1 ring-border/50">
          <div
            className={`h-full transition-all duration-500 ease-out ${
              progress.status === 'error'
                ? 'bg-destructive shadow-lg shadow-destructive/30'
                : progress.status === 'complete'
                  ? 'bg-gradient-to-r from-accent via-primary to-secondary shadow-lg shadow-primary/30'
                  : 'bg-gradient-to-r from-primary via-secondary to-primary shadow-lg shadow-primary/20'
            }`}
            style={{ width: `${Math.max(progress.progress * 100, 2)}%` }}
          />
        </div>
      </div>

      {/* Step Timeline */}
      <div className="space-y-2">
        {STEP_ORDER.map((step, index) => {
          const isCompleted = index < completedSteps
          const isCurrent = index === currentStepIndex
          const isPending = index > currentStepIndex

          return (
            <div
              key={step}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors duration-200 ${
                isCurrent ? 'bg-primary/10' : isCompleted ? 'bg-muted/20' : ''
              }`}
            >
              {/* Step Indicator */}
              <div className="flex-shrink-0">
                {isCompleted ? (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-accent to-primary text-white text-sm font-bold shadow-lg shadow-primary/20">
                    ✓
                  </div>
                ) : isCurrent ? (
                  <div
                    key={animationKey}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white text-sm font-bold shadow-lg shadow-primary/30 relative"
                  >
                    <div className="absolute inset-0 rounded-full border-2 border-primary/30 animate-pulse" />
                    <div className="h-2 w-2 rounded-full bg-white animate-pulse" />
                  </div>
                ) : (
                  <div className="h-7 w-7 rounded-full border-2 border-muted/60 bg-muted/20" />
                )}
              </div>

              {/* Step Label */}
              <span
                className={`flex-1 text-sm font-medium transition-colors duration-200 ${
                  isCurrent
                    ? 'text-primary font-semibold'
                    : isCompleted
                      ? 'text-muted-foreground'
                      : 'text-muted-foreground/60'
                }`}
              >
                {STEP_LABELS[step] || step}
              </span>

              {/* Step Progress */}
              {isCurrent && progress.progress > 0 && (
                <span className="text-xs font-semibold text-primary">
                  {Math.round(progress.progress * 100)}%
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Error Message */}
      {progress.error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 animate-slide-in">
          <p className="text-sm text-destructive font-medium">{progress.error}</p>
        </div>
      )}
    </div>
  )
}

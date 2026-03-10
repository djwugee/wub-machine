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
    <div className="space-y-6 rounded-2xl border border-border bg-card p-8 shadow-sm">
      {/* Status Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">
            {progress.status === 'complete'
              ? 'Remix Complete!'
              : progress.status === 'error'
                ? 'Processing Failed'
                : 'Processing Your Remix'}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {progress.message}
          </p>
        </div>
        {progress.status === 'complete' && (
          <div className="text-3xl">✨</div>
        )}
        {progress.status === 'error' && (
          <div className="text-3xl">❌</div>
        )}
      </div>

      {/* Overall Progress Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Overall Progress</span>
          <span className="font-semibold text-foreground">
            {Math.round(progress.progress * 100)}%
          </span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full transition-all duration-500 ease-out ${
              progress.status === 'error'
                ? 'bg-destructive'
                : progress.status === 'complete'
                  ? 'bg-green-500'
                  : 'bg-gradient-to-r from-primary to-secondary'
            }`}
            style={{ width: `${Math.max(progress.progress * 100, 5)}%` }}
          />
        </div>
      </div>

      {/* Step Timeline */}
      <div className="space-y-3">
        {STEP_ORDER.map((step, index) => {
          const isCompleted = index < completedSteps
          const isCurrent = index === currentStepIndex
          const isPending = index > currentStepIndex

          return (
            <div key={step} className="flex items-center gap-3">
              {/* Step Indicator */}
              <div className="flex-shrink-0">
                {isCompleted ? (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500 text-white text-sm font-bold">
                    ✓
                  </div>
                ) : isCurrent ? (
                  <div
                    key={animationKey}
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white text-sm"
                  >
                    <div className="h-2 w-2 animate-pulse rounded-full bg-white" />
                  </div>
                ) : (
                  <div className="h-6 w-6 rounded-full border-2 border-muted bg-background" />
                )}
              </div>

              {/* Step Label */}
              <span
                className={`flex-1 text-sm font-medium ${
                  isCurrent
                    ? 'text-primary'
                    : isCompleted
                      ? 'text-muted-foreground line-through'
                      : 'text-muted-foreground'
                }`}
              >
                {STEP_LABELS[step] || step}
              </span>

              {/* Step Progress */}
              {isCurrent && progress.progress > 0 && (
                <span className="text-xs text-muted-foreground">
                  {Math.round(progress.progress * 100)}%
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Error Message */}
      {progress.error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
          <p className="text-sm text-destructive">{progress.error}</p>
        </div>
      )}
    </div>
  )
}

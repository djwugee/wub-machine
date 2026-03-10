'use client'

import { useState } from 'react'
import RemixerCard from '@/app/components/RemixerCard'
import UploadZone from '@/app/components/UploadZone'
import RemixResults from '@/app/components/RemixResults'
import ProgressIndicator from '@/app/components/ProgressIndicator'
import { useRemixStore } from '@/lib/store'

export default function HomePage() {
  const {
    selectedRemixer,
    setSelectedRemixer,
    uploadedFile,
    setUploadedFile,
    isProcessing,
    progress,
    results,
    resetState,
  } = useRemixStore()

  const handleRemixerSelect = (remixer: 'dubstep' | 'electrohouse') => {
    setSelectedRemixer(remixer)
  }

  const handleFileUpload = async (file: File) => {
    setUploadedFile(file)
  }

  const handleReset = () => {
    resetState()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-secondary/5">
      {/* Hero Section */}
      <section className="relative overflow-hidden px-4 py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-4xl">
          <div className="text-center">
            <h1 className="text-balance text-5xl font-bold tracking-tight text-foreground sm:text-6xl lg:text-7xl">
              Wub Machine
            </h1>
            <p className="mt-4 text-balance text-lg text-muted-foreground sm:text-xl">
              Transform your music into electronic remixes with AI-powered beat
              detection and synthesis.
            </p>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <div className="mx-auto max-w-5xl px-4 py-8">
        {!results ? (
          <>
            {/* Remixer Selection */}
            <section className="mb-12">
              <h2 className="mb-6 text-2xl font-semibold text-foreground">
                Choose Your Remix Style
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <RemixerCard
                  title="Dubstep"
                  description="140 BPM wobble bass remix with pulsing wubs and aggressive breakdowns"
                  bpm={140}
                  icon="🔊"
                  selected={selectedRemixer === 'dubstep'}
                  onClick={() => handleRemixerSelect('dubstep')}
                />
                <RemixerCard
                  title="Electro House"
                  description="128 BPM driving bassline with melodic synths and energetic hi-hats"
                  bpm={128}
                  icon="⚡"
                  selected={selectedRemixer === 'electrohouse'}
                  onClick={() => handleRemixerSelect('electrohouse')}
                />
              </div>
            </section>

            {/* Upload Zone */}
            {selectedRemixer && (
              <section className="mb-12">
                <h2 className="mb-6 text-2xl font-semibold text-foreground">
                  Upload Your Track
                </h2>
                <UploadZone
                  onFileSelect={handleFileUpload}
                  selectedFile={uploadedFile}
                  remixer={selectedRemixer}
                />
              </section>
            )}

            {/* Progress Indicator */}
            {isProcessing && (
              <section className="mb-12">
                <ProgressIndicator progress={progress} />
              </section>
            )}

            {/* Empty State */}
            {!selectedRemixer && (
              <div className="rounded-lg border border-dashed border-border bg-muted/30 px-8 py-12 text-center">
                <p className="text-muted-foreground">
                  Select a remix style to get started
                </p>
              </div>
            )}
          </>
        ) : (
          <RemixResults onReset={handleReset} />
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-border bg-muted/30 py-8">
        <div className="mx-auto max-w-5xl px-4 text-center text-sm text-muted-foreground">
          <p>
            Wub Machine © 2024 | Built with Next.js and Web Audio API | Original
            by{' '}
            <a
              href="https://github.com/psobot/wub-machine"
              className="text-primary hover:underline"
            >
              Peter Sobot
            </a>
          </p>
        </div>
      </footer>
    </div>
  )
}

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
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative overflow-hidden px-4 py-16 sm:py-20 lg:py-28">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-primary/10 via-transparent to-transparent opacity-30" />
        <div className="mx-auto max-w-4xl">
          <div className="text-center animate-fade-in">
            <h1 className="text-balance bg-clip-text text-foreground">
              Wub Machine
            </h1>
            <p className="mt-6 text-balance text-lg text-muted-foreground sm:text-xl leading-relaxed">
              Transform your music into electronic remixes with real-time beat
              detection and professional-grade audio synthesis.
            </p>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <div className="mx-auto max-w-5xl px-4 py-12 animate-slide-in">
        {!results ? (
          <>
            {/* Remixer Selection */}
            <section className="mb-16">
              <h2 className="mb-8 text-3xl font-bold text-foreground">
                Choose Your Remix Style
              </h2>
              <div className="grid gap-6 sm:grid-cols-2">
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
              <section className="mb-16 animate-slide-in">
                <h2 className="mb-8 text-3xl font-bold text-foreground">
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
              <section className="mb-16 animate-slide-in">
                <ProgressIndicator progress={progress} />
              </section>
            )}

            {/* Empty State */}
            {!selectedRemixer && (
              <div className="card flex flex-col items-center justify-center rounded-xl px-8 py-16 text-center">
                <div className="mb-4 text-5xl opacity-50">🎵</div>
                <p className="text-lg text-muted-foreground">
                  Select a remix style to get started
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="animate-fade-in">
            <RemixResults onReset={handleReset} />
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-border/50 bg-muted/20 py-12 mt-20">
        <div className="mx-auto max-w-5xl px-4 text-center text-sm text-muted-foreground">
          <p className="flex items-center justify-center gap-2">
            <span>Wub Machine © 2024</span>
            <span className="w-1 h-1 rounded-full bg-muted-foreground/50" />
            <span>Built with Next.js and Web Audio API</span>
            <span className="w-1 h-1 rounded-full bg-muted-foreground/50" />
            <span>
              Original by{' '}
              <a
                href="https://github.com/psobot/wub-machine"
                className="text-primary hover:text-primary/80 hover:underline transition-colors"
              >
                Peter Sobot
              </a>
            </span>
          </p>
        </div>
      </footer>
    </div>
  )
}

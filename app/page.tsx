'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { FileUpload } from '@/components/file-upload';
import { RemixControls, RemixSettings } from '@/components/remix-controls';
import { WaveformVisualizer } from '@/components/waveform-visualizer';
import { AudioPlayer } from '@/components/audio-player';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AudioEngine, AudioAnalysisData } from '@/lib/audio/audio-engine';
import { DubstepRemixer } from '@/lib/audio/dubstep-remixer';
import { ElectroHouseRemixer } from '@/lib/audio/electrohouse-remixer';
import { RemixProgress } from '@/lib/audio/remix-base';
import { Music, Sparkles, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function HomePage() {
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [originalBuffer, setOriginalBuffer] = useState<AudioBuffer | null>(null);
  const [remixedBuffer, setRemixedBuffer] = useState<AudioBuffer | null>(null);
  const [analysisData, setAnalysisData] = useState<AudioAnalysisData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<RemixProgress | null>(null);
  const [currentPlaybackTime, setCurrentPlaybackTime] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const audioEngineRef = useRef<AudioEngine | null>(null);

  const [remixSettings, setRemixSettings] = useState<RemixSettings>({
    style: 'dubstep',
    intensity: 0.7,
    preserveVocals: true,
    additionalEffects: true,
  });

  // Initialize audio engine
  useEffect(() => {
    audioEngineRef.current = new AudioEngine();
    return () => {
      audioEngineRef.current?.dispose();
    };
  }, []);

  const handleFileSelect = useCallback(async (file: File) => {
    console.log('[v0] File selected:', file.name);
    setError(null);
    setOriginalFile(file);
    setRemixedBuffer(null);
    setIsProcessing(true);
    setProgress({ stage: 'Loading', progress: 0.1, message: 'Loading audio file...' });

    try {
      const engine = audioEngineRef.current;
      if (!engine) throw new Error('Audio engine not initialized');

      // Load audio file
      const buffer = await engine.loadAudioFile(file);
      console.log('[v0] Audio loaded:', buffer.duration, 'seconds');
      setOriginalBuffer(buffer);
      setProgress({ stage: 'Analyzing', progress: 0.5, message: 'Analyzing audio...' });

      // Analyze audio
      const analysis = await engine.analyzeAudio(buffer);
      console.log('[v0] Analysis complete:', analysis);
      setAnalysisData(analysis);

      setProgress(null);
      setIsProcessing(false);
    } catch (err) {
      console.error('[v0] Error loading audio:', err);
      setError(err instanceof Error ? err.message : 'Failed to load audio file');
      setIsProcessing(false);
      setProgress(null);
    }
  }, []);

  const handleRemix = useCallback(async () => {
    if (!originalBuffer || !analysisData) return;

    console.log('[v0] Starting remix:', remixSettings);
    setError(null);
    setIsProcessing(true);
    setRemixedBuffer(null);

    try {
      const engine = audioEngineRef.current;
      if (!engine) throw new Error('Audio engine not initialized');

      const audioContext = engine.getContext();
      if (!audioContext) throw new Error('Audio context not available');

      // Progress callback
      const progressCallback = (p: RemixProgress) => {
        console.log('[v0] Remix progress:', p);
        setProgress(p);
      };

      // Create remixer based on style
      let remixed: AudioBuffer;

      if (remixSettings.style === 'dubstep') {
        const remixer = new DubstepRemixer(
          audioContext,
          originalBuffer,
          analysisData,
          {
            intensity: remixSettings.intensity,
            preserveVocals: remixSettings.preserveVocals,
            additionalEffects: remixSettings.additionalEffects,
          },
          progressCallback
        );
        remixed = await remixer.remix();
      } else {
        const remixer = new ElectroHouseRemixer(
          audioContext,
          originalBuffer,
          analysisData,
          {
            intensity: remixSettings.intensity,
            preserveVocals: remixSettings.preserveVocals,
            additionalEffects: remixSettings.additionalEffects,
          },
          progressCallback
        );
        remixed = await remixer.remix();
      }

      console.log('[v0] Remix complete:', remixed.duration, 'seconds');
      setRemixedBuffer(remixed);
      setProgress(null);
      setIsProcessing(false);
    } catch (err) {
      console.error('[v0] Error during remix:', err);
      setError(err instanceof Error ? err.message : 'Failed to create remix');
      setIsProcessing(false);
      setProgress(null);
    }
  }, [originalBuffer, analysisData, remixSettings]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 backdrop-blur-sm bg-background/80 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Music className="h-8 w-8 text-primary" />
                <Sparkles className="h-4 w-4 text-accent absolute -top-1 -right-1" />
              </div>
              <div>
                <h1 className="text-2xl font-bold gradient-text">Wub Machine</h1>
                <p className="text-xs text-muted-foreground">
                  Client-Side Audio Remix Engine
                </p>
              </div>
            </div>
            {analysisData && (
              <div className="hidden md:flex items-center gap-3">
                <Badge variant="outline" className="gap-1.5">
                  <span className="text-xs text-muted-foreground">Tempo:</span>
                  <span className="font-mono">{analysisData.tempo} BPM</span>
                </Badge>
                <Badge variant="outline" className="gap-1.5">
                  <span className="text-xs text-muted-foreground">Key:</span>
                  <span className="font-mono">{analysisData.key}</span>
                </Badge>
                <Badge variant="outline" className="gap-1.5">
                  <span className="text-xs text-muted-foreground">Duration:</span>
                  <span className="font-mono">{analysisData.duration.toFixed(1)}s</span>
                </Badge>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-[1fr,400px] gap-6">
          {/* Left Column - Upload and Visualization */}
          <div className="space-y-6">
            {/* Info Alert */}
            {!originalBuffer && (
              <Alert className="border-primary/50 bg-primary/5">
                <Info className="h-4 w-4" />
                <AlertDescription className="text-sm leading-relaxed">
                  <strong>Privacy First:</strong> All audio processing happens directly in your browser.
                  Your files never leave your device and are not uploaded to any server.
                </AlertDescription>
              </Alert>
            )}

            {/* File Upload */}
            {!originalBuffer && (
              <FileUpload
                onFileSelect={handleFileSelect}
                disabled={isProcessing}
                className="min-h-[400px]"
              />
            )}

            {/* Processing Progress */}
            {isProcessing && progress && (
              <Card className="glass-card">
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="font-semibold">{progress.stage}</p>
                      <p className="text-sm text-muted-foreground">{progress.message}</p>
                    </div>
                    <div className="text-2xl font-mono text-primary">
                      {Math.round(progress.progress * 100)}%
                    </div>
                  </div>
                  <Progress value={progress.progress * 100} className="h-2" />
                </CardContent>
              </Card>
            )}

            {/* Error Display */}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Original Audio Visualization */}
            {originalBuffer && !remixedBuffer && (
              <Card className="glass-card">
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold">Original Audio</h3>
                      <p className="text-sm text-muted-foreground">
                        {originalFile?.name}
                      </p>
                    </div>
                    <Badge className="bg-secondary text-secondary-foreground">
                      Original
                    </Badge>
                  </div>
                  <div className="h-32 rounded-lg bg-background/50">
                    <WaveformVisualizer
                      audioBuffer={originalBuffer}
                      currentTime={currentPlaybackTime}
                      beats={analysisData?.beats}
                    />
                  </div>
                  <AudioPlayer
                    audioBuffer={originalBuffer}
                    audioEngine={audioEngineRef.current}
                    filename={originalFile?.name.replace(/\.[^/.]+$/, '') || 'original'}
                    onTimeUpdate={setCurrentPlaybackTime}
                  />
                </CardContent>
              </Card>
            )}

            {/* Remixed Audio Visualization */}
            {remixedBuffer && (
              <Card className="glass-card border-primary/50">
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        Remixed Audio
                      </h3>
                      <p className="text-sm text-muted-foreground capitalize">
                        {remixSettings.style} Style
                      </p>
                    </div>
                    <Badge className="bg-primary text-primary-foreground">
                      Remix Complete
                    </Badge>
                  </div>
                  <div className="h-48 rounded-lg bg-background/50">
                    <WaveformVisualizer
                      audioBuffer={remixedBuffer}
                      currentTime={currentPlaybackTime}
                      beats={analysisData?.beats}
                    />
                  </div>
                  <AudioPlayer
                    audioBuffer={remixedBuffer}
                    audioEngine={audioEngineRef.current}
                    filename={`${originalFile?.name.replace(/\.[^/.]+$/, '')}_${remixSettings.style}_remix` || 'remix'}
                    onTimeUpdate={setCurrentPlaybackTime}
                  />
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column - Controls */}
          <div className="space-y-6">
            <RemixControls
              settings={remixSettings}
              onChange={setRemixSettings}
              onRemix={handleRemix}
              disabled={!originalBuffer || isProcessing}
              isProcessing={isProcessing && progress !== null && progress.stage !== 'Loading'}
            />

            {/* Analysis Info */}
            {analysisData && (
              <Card className="glass-card">
                <CardContent className="p-6 space-y-4">
                  <h3 className="font-semibold">Audio Analysis</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Tempo</span>
                      <span className="font-mono font-semibold">{analysisData.tempo} BPM</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Key</span>
                      <span className="font-mono font-semibold">{analysisData.key}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Duration</span>
                      <span className="font-mono font-semibold">
                        {analysisData.duration.toFixed(2)}s
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Beats Detected</span>
                      <span className="font-mono font-semibold">{analysisData.beats.length}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Channels</span>
                      <span className="font-mono font-semibold">{analysisData.channels}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Sample Rate</span>
                      <span className="font-mono font-semibold">
                        {(analysisData.sampleRate / 1000).toFixed(1)} kHz
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 mt-16">
        <div className="container mx-auto px-4 py-6">
          <p className="text-center text-sm text-muted-foreground">
            Powered by Web Audio API - All processing happens locally in your browser
          </p>
        </div>
      </footer>
    </div>
  );
}

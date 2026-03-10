# Wub Machine: Python to Next.js Migration Strategy

## Executive Summary

This document outlines a comprehensive migration strategy to transform the Wub Machine from a Python-based Tornado/Tornadio web application into a modern, production-ready Next.js GUI. The strategy includes porting 2 core remixers (Dubstep, ElectroHouse), integrating audio processing pipelines using Web Audio API and audio libraries, and building a scalable, maintainable architecture.

---

## Current Architecture Analysis

### Existing Application Stack
- **Backend**: Python (Tornado web framework, Tornadio for WebSocket)
- **Audio Processing**: Librosa (audio analysis), NumPy (DSP), SoundFile (audio I/O)
- **Remixers**: Dubstep (140 BPM), ElectroHouse (128 BPM)
- **Assets**: 50+ WAV sample files (drums, synths, effects)
- **Database**: MySQL with SQLAlchemy
- **Frontend**: Vanilla JavaScript, HTML/CSS, Socket.IO for real-time updates

### Key Components to Migrate
1. **Remixer Engine**: Audio analysis and synthesis logic (Python → JavaScript/WASM)
2. **Sample Assets**: 50+ WAV files for Dubstep and ElectroHouse
3. **Web Interface**: Tornado templates → Next.js React components
4. **Audio Processing**: NumPy/Librosa operations → Web Audio API + alternatives
5. **Real-time Communication**: Tornadio → WebSockets in Next.js

---

## Phase 1: Foundation & Setup (Weeks 1-2)

### 1.1 Initialize Next.js Project Structure
```
wub-machine-next/
├── app/
│   ├── layout.tsx              # Root layout
│   ├── page.tsx                # Home page
│   ├── remixers/               # Remix routes
│   │   └── [remixerId]/page.tsx
│   ├── api/
│   │   ├── remix/              # Remix processing endpoints
│   │   │   └── route.ts
│   │   ├── upload/             # Audio upload handling
│   │   │   └── route.ts
│   │   └── progress/           # Real-time progress updates
│   │       └── route.ts
│   └── admin/                  # Monitoring dashboard
│       └── monitor/page.tsx
├── lib/
│   ├── remixers/               # Ported remixer logic
│   │   ├── base-remixer.ts
│   │   ├── dubstep.ts
│   │   └── electrohouse.ts
│   ├── audio/
│   │   ├── processor.ts        # Core audio processing
│   │   ├── analysis.ts         # Beat/tempo detection
│   │   └── synthesis.ts        # Sample playback
│   ├── samples.ts              # Sample loading utilities
│   └── config.ts               # Configuration
├── public/
│   ├── samples/
│   │   ├── dubstep/
│   │   └── electrohouse/
│   └── audio/                  # Temporary processing files
├── components/
│   ├── upload-section/
│   ├── remix-player/
│   ├── progress-monitor/
│   └── remix-controls/
├── types/
│   ├── remixer.ts
│   ├── audio.ts
│   └── sample.ts
├── styles/
│   ├── globals.css
│   └── components/
├── scripts/
│   ├── migrate-samples.sh      # Copy samples from Python app
│   └── setup-wasm.sh           # WASM compilation
├── package.json
├── tsconfig.json
├── next.config.js
└── tailwind.config.js
```

### 1.2 Install Core Dependencies
```json
{
  "dependencies": {
    "next": "^16.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "typescript": "^5.3.0",
    "librosa.ts": "^1.0.0",      // TypeScript port of librosa features
    "wav-encoder": "^1.3.0",      // WAV encoding
    "tone.js": "^14.0.0",         // Audio synthesis
    "zustand": "^4.4.0",          // State management
    "react-hot-toast": "^2.4.1"   // Notifications
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^18.2.0",
    "tailwindcss": "^3.3.0",
    "postcss": "^8.4.0"
  }
}
```

### 1.3 Copy Audio Assets
**Action Items**:
- Create `/public/samples/dubstep/` directory structure
- Create `/public/samples/electrohouse/` directory structure
- Copy all 50+ WAV files from Python project
- Generate MD5 checksums for integrity verification

**Script** (`scripts/migrate-samples.sh`):
```bash
#!/bin/bash
# Copy samples from original wub-machine repository
cp -r ../wub-machine/samples/dubstep/* ./public/samples/dubstep/
cp -r ../wub-machine/samples/electrohouse/* ./public/samples/electrohouse/
# Verify copies
find ./public/samples -name "*.wav" | wc -l
```

### 1.4 Configuration Management
**File**: `/lib/config.ts`
```typescript
export const config = {
  app_name: 'Wub Machine Next',
  remixers: {
    Dubstep: {
      tempo: 140,
      enabled: true,
    },
    ElectroHouse: {
      tempo: 128,
      enabled: true,
    },
  },
  limits: {
    maximum_concurrent_remixes: 4,
    maximum_waiting_remixes: 20,
    hourly_remix_limit: 100,
    remix_timeout: 600, // seconds
    max_file_size: 50 * 1024 * 1024, // 50MB
  },
  allowed_file_extensions: ['.mp3', '.m4a', '.mp4', '.wav'],
  audio: {
    sample_rate: 44100,
    channels: 2,
  },
};
```

---

## Phase 2: Core Audio Processing Infrastructure (Weeks 3-4)

### 2.1 Audio Analysis Layer
**Purpose**: Replace Echo Nest + Librosa with Web Audio API + librosa.ts

**File**: `/lib/audio/analysis.ts`
```typescript
import * as librosa from 'librosa.ts';

export interface AudioAnalysis {
  tempo: number;
  beats: number[];
  bars: Array<[number, number]>;
  sections: Array<[number, number]>;
  chromagram: number[][];
  loudness: number[];
  sr: number;
}

export async function analyzeAudio(
  audioBuffer: AudioBuffer,
  sr: number = 44100
): Promise<AudioAnalysis> {
  const y = audioBuffer.getChannelData(0); // Mono analysis
  
  // Beat tracking
  const { bpm, beats } = librosa.beatTrack({ y, sr });
  
  // Chromatic features
  const chromagram = librosa.featureChromaStft({ y, sr });
  
  // Loudness analysis
  const loudness = librosa.featureRms({ y });
  
  // Estimate bars (4 beats per bar)
  const bars = estimateBars(beats, bpm);
  
  // Estimate sections (groups of 8 bars)
  const sections = estimateSections(bars);
  
  return {
    tempo: bpm,
    beats,
    bars,
    sections,
    chromagram,
    loudness,
    sr,
  };
}

function estimateBars(beats: number[], bpm: number): Array<[number, number]> {
  const beatsPerBar = 4;
  const bars: Array<[number, number]> = [];
  
  for (let i = 0; i < beats.length; i += beatsPerBar) {
    const barStart = beats[i];
    const barEnd = beats[i + beatsPerBar] ?? beats[beats.length - 1] + (60 / bpm);
    bars.push([barStart, barEnd]);
  }
  
  return bars;
}

function estimateSections(bars: Array<[number, number]>): Array<[number, number]> {
  const barsPerSection = 8;
  const sections: Array<[number, number]> = [];
  
  for (let i = 0; i < bars.length; i += barsPerSection) {
    const sectionStart = bars[i][0];
    const sectionEnd = bars[Math.min(i + barsPerSection, bars.length) - 1][1];
    sections.push([sectionStart, sectionEnd]);
  }
  
  return sections;
}
```

### 2.2 Sample Management System
**File**: `/lib/samples.ts`
```typescript
export interface Sample {
  id: string;
  name: string;
  path: string;
  remixer: 'Dubstep' | 'ElectroHouse';
  category: string; // 'wubs', 'breaks', 'splashes', etc.
  duration: number; // in seconds
}

// Pre-defined sample manifest
export const SAMPLE_MANIFEST: Record<string, Sample[]> = {
  Dubstep: [
    // Wubs
    { id: 'wubs-c', name: 'Wub C', path: '/samples/dubstep/wubs/c.wav', remixer: 'Dubstep', category: 'wubs', duration: 0.5 },
    // ... more samples
  ],
  ElectroHouse: [
    { id: 'body-c', name: 'Body C', path: '/samples/electrohouse/body/c.wav', remixer: 'ElectroHouse', category: 'body', duration: 0.5 },
    // ... more samples
  ],
};

// Audio buffer cache for performance
const sampleCache = new Map<string, AudioBuffer>();

export async function loadSample(sampleId: string, audioContext: AudioContext): Promise<AudioBuffer> {
  if (sampleCache.has(sampleId)) {
    return sampleCache.get(sampleId)!;
  }
  
  const sample = findSampleById(sampleId);
  if (!sample) throw new Error(`Sample ${sampleId} not found`);
  
  const response = await fetch(sample.path);
  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  
  sampleCache.set(sampleId, audioBuffer);
  return audioBuffer;
}

function findSampleById(id: string): Sample | undefined {
  for (const samples of Object.values(SAMPLE_MANIFEST)) {
    const found = samples.find(s => s.id === id);
    if (found) return found;
  }
  return undefined;
}
```

### 2.3 Base Remixer Class
**File**: `/lib/remixers/base-remixer.ts`
```typescript
import { AudioAnalysis } from '@/lib/audio/analysis';

export interface RemixProgress {
  status: -1 | 0 | 1; // -1: error, 0: waiting, 1: processing
  text: string;
  progress: number; // 0-1
  uid: string;
  time: number;
  tag?: Record<string, unknown>;
}

export abstract class BaseRemixer {
  protected uid: string;
  protected infile: File;
  protected audioContext: AudioContext;
  protected analysis: AudioAnalysis | null = null;
  protected progress: number = 0;
  protected step: string = 'Initializing...';
  
  constructor(uid: string, infile: File, audioContext: AudioContext) {
    this.uid = uid;
    this.infile = infile;
    this.audioContext = audioContext;
  }
  
  abstract remix(): Promise<AudioBuffer>;
  
  protected updateProgress(text: string, increment: number): void {
    this.step = text;
    this.progress = Math.min(this.progress + increment, 1);
    this.notifyProgress();
  }
  
  protected notifyProgress(): void {
    // Will be overridden by subclasses or implement callback mechanism
  }
  
  protected log(message: string): void {
    console.log(`[${this.uid}] ${message}`);
  }
}
```

---

## Phase 3: Dubstep Remixer Port (Weeks 5-6)

### 3.1 Dubstep Remixer Implementation
**File**: `/lib/remixers/dubstep.ts`
```typescript
import { BaseRemixer, RemixProgress } from './base-remixer';
import { AudioAnalysis, analyzeAudio } from '@/lib/audio/analysis';
import { loadSample } from '@/lib/samples';

export class DubstepRemixer extends BaseRemixer {
  private template = {
    tempo: 140,
    intro: 'intro-eight.wav',
    hats: 'hats.wav',
    wubs: [
      'wubs/c.wav',
      'wubs/c-sharp.wav',
      'wubs/d.wav',
      // ... all 12 chromatic wubs
    ],
    wub_breaks: [
      'break-ends/c.wav',
      // ... all breaks
    ],
    splashes: [
      'splashes/splash_01.wav',
      // ... all splashes
    ],
    splash_ends: [
      'splash-ends/1.wav',
      // ... all splash ends
    ],
    mixpoint: 18,
    target: 'beats' as const,
  };
  
  async remix(): Promise<AudioBuffer> {
    try {
      // Load and analyze input audio
      this.updateProgress('Loading and analyzing audio...', 0.05);
      const inputBuffer = await this.loadInputAudio();
      this.analysis = await analyzeAudio(inputBuffer, this.audioContext.sampleRate);
      
      // Compile remix sections
      this.updateProgress('Compiling intro...', 0.1);
      const intro = await this.compileIntro();
      
      this.updateProgress('Building remix body...', 0.3);
      const body = await this.compileBody();
      
      this.updateProgress('Finalizing remix...', 0.2);
      const remixed = this.concatenateAudio([intro, body]);
      
      // Encode to WAV
      this.updateProgress('Encoding output...', 0.15);
      
      return remixed;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }
  
  private async loadInputAudio(): Promise<AudioBuffer> {
    const arrayBuffer = await this.infile.arrayBuffer();
    return this.audioContext.decodeAudioData(arrayBuffer);
  }
  
  private async compileIntro(): Promise<AudioBuffer> {
    // Implementation: Create 4-bar intro from samples + input audio segments
    // Uses searchSamples() to find beat-matched segments
    const introAudioBuffer = this.audioContext.createBuffer(
      2,
      this.audioContext.sampleRate * 13.71,
      this.audioContext.sampleRate
    );
    
    // Fill with synthesized intro
    // ... complex logic
    
    return introAudioBuffer;
  }
  
  private async compileBody(): Promise<AudioBuffer> {
    // Implementation: Create remix body with wubs, samples, and input audio
    // ... complex logic
    
    return this.audioContext.createBuffer(2, 44100, 44100);
  }
  
  private concatenateAudio(buffers: AudioBuffer[]): AudioBuffer {
    let totalFrames = 0;
    for (const buffer of buffers) {
      totalFrames += buffer.length;
    }
    
    const combined = this.audioContext.createBuffer(2, totalFrames, this.audioContext.sampleRate);
    const combinedLeft = combined.getChannelData(0);
    const combinedRight = combined.getChannelData(1);
    
    let offset = 0;
    for (const buffer of buffers) {
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);
      
      combinedLeft.set(left, offset);
      combinedRight.set(right, offset);
      
      offset += buffer.length;
    }
    
    return combined;
  }
  
  private handleError(error: unknown): void {
    this.step = error instanceof Error ? error.message : 'Unknown error';
    this.notifyProgress();
  }
}
```

### 3.2 Audio Helper Functions
**File**: `/lib/audio/processor.ts`
```typescript
export function mixAudio(
  buffer1: AudioBuffer,
  buffer2: AudioBuffer,
  mix: number = 0.5
): AudioBuffer {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const length = Math.min(buffer1.length, buffer2.length);
  const mixed = audioContext.createBuffer(2, length, audioContext.sampleRate);
  
  const src1L = buffer1.getChannelData(0);
  const src1R = buffer1.getChannelData(1);
  const src2L = buffer2.getChannelData(0);
  const src2R = buffer2.getChannelData(1);
  
  const outL = mixed.getChannelData(0);
  const outR = mixed.getChannelData(1);
  
  for (let i = 0; i < length; i++) {
    outL[i] = src1L[i] * mix + src2L[i] * (1 - mix);
    outR[i] = src1R[i] * mix + src2R[i] * (1 - mix);
  }
  
  return mixed;
}

export function pitchShift(
  buffer: AudioBuffer,
  semitones: number
): AudioBuffer {
  // Use Web Audio API rate reduction or implement pitch shifting algorithm
  // For production: use a library like tone.js or implement granular synthesis
  return buffer;
}

export function tempoStretch(
  buffer: AudioBuffer,
  factor: number
): AudioBuffer {
  // Time-stretch without pitch change
  // Use librosa.effects.time_stretch equivalent
  return buffer;
}

export async function encodeToWav(buffer: AudioBuffer): Promise<Blob> {
  const numberOfChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numberOfChannels * bytesPerSample;
  
  const channels: Float32Array[] = [];
  for (let i = 0; i < numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }
  
  const interleaved = interleaveChannels(channels);
  const dataLength = interleaved.length * bytesPerSample;
  const buffer_array = encodeWAVHeader(
    numberOfChannels,
    sampleRate,
    bitDepth,
    dataLength
  );
  
  return new Blob([buffer_array, pcmEncode(interleaved, bitDepth)], { type: 'audio/wav' });
}

function interleaveChannels(channels: Float32Array[]): Float32Array {
  const length = channels[0].length;
  const result = new Float32Array(length * channels.length);
  
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < channels.length; ch++) {
      result[i * channels.length + ch] = channels[ch][i];
    }
  }
  
  return result;
}

// ... WAV encoding helpers
```

---

## Phase 4: ElectroHouse Remixer Port (Weeks 7-8)

### 4.1 ElectroHouse Implementation
Similar structure to DubstepRemixer but with:
- Pattern-based synthesis (reading from pattern files)
- Note sequencing system
- Tempo-based rhythm generation
- Body synthesis from chromatic samples

**File**: `/lib/remixers/electrohouse.ts`
```typescript
import { BaseRemixer } from './base-remixer';

export class ElectroHouseRemixer extends BaseRemixer {
  private template = {
    tempo: 128,
    beat: ['beat_0.wav', 'beat_1.wav', 'beat_2.wav', 'beat_3.wav'],
    intro: 'intro_16.wav',
    splash: 'splash.wav',
    build: 'build.wav',
    body: [
      'body/c.wav',
      // ... all 12 chromatic notes
    ],
    splash_ends: [
      'splash-ends/1.wav',
      // ... all splash ends
    ],
    mixpoint: 18,
    target: 'beats' as const,
  };
  
  async remix(): Promise<AudioBuffer> {
    // Similar to Dubstep but with pattern-based synthesis
    // ... implementation
    return this.audioContext.createBuffer(2, 44100, 44100);
  }
}
```

---

## Phase 5: API & Backend Integration (Weeks 9-10)

### 5.1 File Upload API
**File**: `/app/api/upload/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const remixerId = formData.get('remixer') as string;
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }
    
    // Validate file type
    const extension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!config.allowed_file_extensions.includes(extension)) {
      return NextResponse.json(
        { error: 'File type not allowed' },
        { status: 400 }
      );
    }
    
    // Validate file size
    if (file.size > config.limits.max_file_size) {
      return NextResponse.json(
        { error: 'File too large' },
        { status: 413 }
      );
    }
    
    // Generate unique ID
    const uid = uuidv4().replace(/-/g, '').slice(0, 32);
    
    // Store file (implementation depends on storage solution)
    // Option 1: Vercel Blob
    // Option 2: AWS S3
    // Option 3: Local file system (not recommended for production)
    
    return NextResponse.json({
      uid,
      remixer: remixerId,
      filename: file.name,
      size: file.size,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Upload failed' },
      { status: 500 }
    );
  }
}
```

### 5.2 Remix Processing API
**File**: `/app/api/remix/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { DubstepRemixer } from '@/lib/remixers/dubstep';
import { ElectroHouseRemixer } from '@/lib/remixers/electrohouse';

const REMIX_QUEUE: Map<string, any> = new Map();

export async function POST(request: NextRequest) {
  const { uid, remixer, audioData } = await request.json();
  
  try {
    // Validate queue
    if (REMIX_QUEUE.size >= 4) {
      return NextResponse.json(
        { error: 'Queue full' },
        { status: 429 }
      );
    }
    
    // Create remixer instance
    const RemixerClass = remixer === 'dubstep' ? DubstepRemixer : ElectroHouseRemixer;
    const remixerInstance = new RemixerClass(uid, audioData);
    
    // Start processing
    REMIX_QUEUE.set(uid, remixerInstance);
    
    // Run remix asynchronously
    remixerInstance.remix().then(result => {
      // Store result
      // ... implementation
    });
    
    return NextResponse.json({
      status: 'started',
      uid,
      remixer,
    });
  } catch (error) {
    REMIX_QUEUE.delete(uid);
    return NextResponse.json(
      { error: 'Remix failed' },
      { status: 500 }
    );
  }
}
```

### 5.3 Real-time Progress with WebSockets
**File**: `/lib/websocket-client.ts`
```typescript
export class RemixProgressClient {
  private ws: WebSocket | null = null;
  private url: string;
  private listeners: Map<string, (data: any) => void> = new Map();
  
  constructor(baseUrl: string = '') {
    this.url = `${baseUrl}/api/progress`;
  }
  
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
        
        this.ws.onopen = () => resolve();
        this.ws.onmessage = (event) => {
          const data = JSON.parse(event.data);
          const uid = data.uid;
          if (this.listeners.has(uid)) {
            this.listeners.get(uid)!(data);
          }
        };
        this.ws.onerror = reject;
      } catch (error) {
        reject(error);
      }
    });
  }
  
  subscribe(uid: string, callback: (data: any) => void): void {
    this.listeners.set(uid, callback);
    this.ws?.send(JSON.stringify({ action: 'subscribe', uid }));
  }
  
  unsubscribe(uid: string): void {
    this.listeners.delete(uid);
    this.ws?.send(JSON.stringify({ action: 'unsubscribe', uid }));
  }
  
  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }
}
```

---

## Phase 6: Frontend Components (Weeks 11-12)

### 6.1 Upload Component
**File**: `/components/upload-section.tsx`
```typescript
'use client';

import React, { useRef, useState } from 'react';
import { config } from '@/lib/config';

export function UploadSection() {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedRemixer, setSelectedRemixer] = useState('Dubstep');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      await handleFileUpload(files[0]);
    }
  };
  
  const handleFileUpload = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('remixer', selectedRemixer.toLowerCase());
    
    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      
      const data = await response.json();
      // Trigger remix with returned UID
      console.log('Upload successful:', data);
    } catch (error) {
      console.error('Upload failed:', error);
    }
  };
  
  return (
    <div
      className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition ${
        isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
    >
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) {
            handleFileUpload(e.target.files[0]);
          }
        }}
        accept={config.allowed_file_extensions.join(',')}
      />
      <p className="text-lg font-semibold">Drop a song here to remix!</p>
      <p className="text-sm text-gray-500">or click to select a file</p>
      
      <div className="mt-6 flex gap-4 justify-center">
        {Object.entries(config.remixers).map(([name, settings]) => (
          <button
            key={name}
            className={`px-4 py-2 rounded transition ${
              selectedRemixer === name
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
            }`}
            onClick={() => setSelectedRemixer(name)}
            disabled={!settings.enabled}
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  );
}
```

### 6.2 Progress Monitor Component
**File**: `/components/progress-monitor.tsx`
```typescript
'use client';

import React, { useEffect, useState } from 'react';
import { RemixProgressClient } from '@/lib/websocket-client';

interface ProgressState {
  status: -1 | 0 | 1;
  text: string;
  progress: number;
  uid: string;
}

export function ProgressMonitor({ uid }: { uid: string }) {
  const [state, setState] = useState<ProgressState | null>(null);
  const [client] = useState(() => new RemixProgressClient());
  
  useEffect(() => {
    let mounted = true;
    
    (async () => {
      await client.connect();
      
      if (mounted) {
        client.subscribe(uid, (data) => {
          if (mounted) setState(data);
        });
      }
    })();
    
    return () => {
      mounted = false;
      client.unsubscribe(uid);
      client.disconnect();
    };
  }, [uid, client]);
  
  if (!state) return <div>Waiting for remix to start...</div>;
  
  return (
    <div className="space-y-4">
      <div className="text-sm font-semibold">{state.text}</div>
      <div className="w-full bg-gray-200 rounded-full h-2.5">
        <div
          className={`h-2.5 rounded-full transition-all ${
            state.status === -1 ? 'bg-red-500' : 'bg-green-500'
          }`}
          style={{ width: `${state.progress * 100}%` }}
        />
      </div>
      <div className="text-xs text-gray-500">
        {Math.round(state.progress * 100)}% complete
      </div>
    </div>
  );
}
```

### 6.3 Player Component
**File**: `/components/remix-player.tsx`
```typescript
'use client';

import React, { useRef, useState } from 'react';

export function RemixPlayer({ audioUrl }: { audioUrl: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  return (
    <div className="flex items-center gap-4">
      <button
        onClick={() => {
          if (audioRef.current) {
            if (isPlaying) {
              audioRef.current.pause();
            } else {
              audioRef.current.play();
            }
            setIsPlaying(!isPlaying);
          }
        }}
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        {isPlaying ? 'Pause' : 'Play'}
      </button>
      
      <audio
        ref={audioRef}
        src={audioUrl}
        onEnded={() => setIsPlaying(false)}
      />
    </div>
  );
}
```

---

## Phase 7: Testing & Optimization (Weeks 13-14)

### 7.1 Unit Tests
**File**: `/lib/remixers/__tests__/dubstep.test.ts`
```typescript
import { DubstepRemixer } from '../dubstep';
import { describe, it, expect, beforeEach } from 'vitest';

describe('DubstepRemixer', () => {
  let remixer: DubstepRemixer;
  let audioContext: AudioContext;
  
  beforeEach(() => {
    audioContext = new (window as any).AudioContext();
  });
  
  it('should initialize with correct tempo', () => {
    expect(remixer.template.tempo).toBe(140);
  });
  
  it('should load and analyze audio', async () => {
    // Test implementation
  });
  
  it('should compile intro section', async () => {
    // Test implementation
  });
});
```

### 7.2 Performance Optimization
- Implement AudioWorklet for real-time processing
- Use Web Workers for analysis tasks
- Optimize sample caching strategies
- Profile with Chrome DevTools

### 7.3 Browser Compatibility
- Test on Chrome, Firefox, Safari, Edge
- Provide fallbacks for older Web Audio API versions
- Test on mobile devices

---

## Phase 8: Deployment & DevOps (Weeks 15-16)

### 8.1 Environment Configuration
**File**: `.env.local`
```
NEXT_PUBLIC_REMIX_TIMEOUT=600
NEXT_PUBLIC_MAX_CONCURRENT=4
NEXT_PUBLIC_MAX_FILE_SIZE=52428800
```

### 8.2 Vercel Deployment
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel deploy --prod
```

### 8.3 Docker Configuration
**File**: `Dockerfile`
```dockerfile
FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
```

### 8.4 Monitoring & Logging
- Implement error tracking (Sentry)
- Add performance monitoring (Web Vitals)
- Set up analytics (Vercel Analytics)

---

## Migration Checklist

### Phase 1: Foundation
- [ ] Initialize Next.js project
- [ ] Set up TypeScript configuration
- [ ] Copy audio samples
- [ ] Create configuration system
- [ ] Set up Tailwind CSS

### Phase 2: Audio Infrastructure
- [ ] Implement audio analysis layer
- [ ] Create sample management system
- [ ] Build audio processor utilities
- [ ] Set up audio encoding

### Phase 3: Dubstep Remixer
- [ ] Port Dubstep class to TypeScript
- [ ] Implement sample search algorithm
- [ ] Create intro compilation logic
- [ ] Implement body compilation
- [ ] Add remix algorithm

### Phase 4: ElectroHouse Remixer
- [ ] Port ElectroHouse class
- [ ] Implement pattern reading
- [ ] Create note sequencing
- [ ] Add synthesis logic

### Phase 5: APIs
- [ ] Build upload API
- [ ] Create remix processing API
- [ ] Implement WebSocket progress system
- [ ] Add download endpoints

### Phase 6: Components
- [ ] Build upload interface
- [ ] Create progress monitor
- [ ] Implement audio player
- [ ] Build admin dashboard

### Phase 7: Testing
- [ ] Write unit tests
- [ ] Integration testing
- [ ] Performance profiling
- [ ] Cross-browser testing

### Phase 8: Deployment
- [ ] Set up CI/CD pipeline
- [ ] Configure production environment
- [ ] Set up monitoring
- [ ] Plan rollout strategy

---

## Known Challenges & Solutions

### Challenge 1: Audio Processing Performance
**Problem**: Web Audio API is limited compared to Python libraries
**Solution**:
- Use librosa.ts for analysis
- Implement audio processing in Web Workers
- Consider using Emscripten-compiled WASM for heavy lifting
- Cache analysis results aggressively

### Challenge 2: Large File Handling
**Problem**: Browser memory limitations with large audio files
**Solution**:
- Implement streaming upload
- Use chunked processing
- Store temporary files server-side
- Implement garbage collection

### Challenge 3: Sample Rate Consistency
**Problem**: Different sample rates across browsers
**Solution**:
- Always resample to 44.1kHz
- Use librosa's resampling functions
- Test on multiple sample rates

### Challenge 4: Browser Compatibility
**Problem**: Web Audio API differences
**Solution**:
- Use feature detection
- Provide polyfills where needed
- Test extensively across browsers
- Document minimum browser versions

---

## Post-Migration Maintenance

### Ongoing Tasks
1. **Version Updates**: Keep Next.js, React, and dependencies current
2. **Performance Monitoring**: Track metrics with Web Vitals
3. **User Feedback**: Gather feedback on remix quality
4. **Feature Additions**: Plan ElectroHouse improvements, new remixers
5. **Security Updates**: Monitor dependencies for vulnerabilities

### Potential Enhancements
- Add SoundCloud sharing integration
- Implement user accounts and saved remixes
- Add more remix styles (Trap, Glitch Hop, etc.)
- Build mobile app (React Native)
- Add real-time collaboration
- Implement ML-based remix optimization

---

## Conclusion

This migration transforms the Wub Machine from a monolithic Python application into a modern, scalable Next.js application while preserving the core remix engine. The phased approach allows for incremental validation and risk mitigation. With proper execution, the resulting application will be faster, more maintainable, and positioned for future growth.

**Estimated Timeline**: 16 weeks for complete migration and deployment
**Team Size**: 2-3 experienced full-stack developers
**Risk Level**: Medium (complex audio processing, but well-defined requirements)

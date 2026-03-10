# Wub Machine Next.js: Advanced Implementation Guide

## Overview

This document provides detailed technical guidance for implementing the Wub Machine Next.js migration, including architecture decisions, code patterns, and best practices for production deployment.

---

## Architecture Decision Records (ADRs)

### ADR-1: Audio Processing Strategy

**Decision**: Use Web Audio API + Librosa.ts for analysis, with Web Workers for heavy lifting

**Rationale**:
- Web Audio API is standardized and widely supported
- Librosa.ts provides familiar audio analysis patterns
- Web Workers prevent blocking the main thread during analysis
- AudioWorklet API for real-time synthesis

**Implementation**:
```typescript
// /lib/audio/worker.ts
const ctx = self as any;

ctx.onmessage = async (event: MessageEvent) => {
  const { type, payload } = event.data;
  
  if (type === 'analyze') {
    const analysis = performAnalysis(payload);
    ctx.postMessage({ type: 'analysis-complete', data: analysis });
  }
};

function performAnalysis(audioBuffer: ArrayBuffer) {
  // Heavy lifting happens here without blocking main thread
  const y = new Float32Array(audioBuffer);
  // ... analysis logic
  return { /* results */ };
}
```

---

### ADR-2: State Management

**Decision**: Use Zustand for remix queue state, React Context for UI state

**Rationale**:
- Zustand is lightweight and has minimal boilerplate
- React Context suitable for UI state
- Redux overkill for this application scope

**Implementation**:
```typescript
// /lib/store.ts
import { create } from 'zustand';

interface RemixJob {
  uid: string;
  filename: string;
  remixer: 'Dubstep' | 'ElectroHouse';
  progress: number;
  status: 'queued' | 'processing' | 'complete' | 'error';
  error?: string;
  outputUrl?: string;
}

export const useRemixStore = create<{
  jobs: RemixJob[];
  addJob: (job: RemixJob) => void;
  updateJob: (uid: string, updates: Partial<RemixJob>) => void;
  removeJob: (uid: string) => void;
}>(
  (set) => ({
    jobs: [],
    addJob: (job) => set((state) => ({ jobs: [...state.jobs, job] })),
    updateJob: (uid, updates) =>
      set((state) => ({
        jobs: state.jobs.map((job) =>
          job.uid === uid ? { ...job, ...updates } : job
        ),
      })),
    removeJob: (uid) =>
      set((state) => ({
        jobs: state.jobs.filter((job) => job.uid !== uid),
      })),
  })
);
```

---

### ADR-3: File Storage

**Decision**: Use Vercel Blob for production, local storage for development

**Rationale**:
- Vercel Blob integrates seamlessly with Vercel deployments
- Serverless, no infrastructure management
- Automatic cleanup capabilities
- Cost-effective at scale

**Implementation**:
```typescript
// /lib/storage.ts
import { put, del } from '@vercel/blob';

export async function storeAudioFile(file: File, uid: string): Promise<string> {
  const blob = await put(`audio/${uid}/${file.name}`, file, {
    access: 'private',
  });
  return blob.url;
}

export async function deleteAudioFile(url: string): Promise<void> {
  await del(url);
}
```

---

## Advanced Code Patterns

### Pattern 1: Audio Processing Pipeline

```typescript
// /lib/audio/pipeline.ts
export class AudioProcessingPipeline {
  private audioContext: AudioContext;
  private sourceBuffer: AudioBuffer;
  private workletNode: AudioWorkletNode | null = null;
  
  constructor(audioContext: AudioContext, sourceBuffer: AudioBuffer) {
    this.audioContext = audioContext;
    this.sourceBuffer = sourceBuffer;
  }
  
  async setupWorklet(workletPath: string): Promise<void> {
    await this.audioContext.audioWorklet.addModule(workletPath);
    this.workletNode = new AudioWorkletNode(
      this.audioContext,
      'audio-processor'
    );
  }
  
  async process(stage1: AudioBuffer): Promise<AudioBuffer> {
    // Stage 1: Analysis
    const analysis = await this.analyzeAudio(stage1);
    
    // Stage 2: Synthesis
    const synthesized = this.synthesizeRemix(analysis);
    
    // Stage 3: Mixing
    const mixed = this.mixLayers(this.sourceBuffer, synthesized);
    
    // Stage 4: Post-processing
    const final = this.applyEffects(mixed);
    
    return final;
  }
  
  private analyzeAudio(buffer: AudioBuffer): Promise<Analysis> {
    return new Promise((resolve) => {
      const worker = new Worker(
        new URL('./analysis.worker.ts', import.meta.url)
      );
      
      const pcmData = buffer.getChannelData(0);
      worker.postMessage({
        type: 'analyze',
        pcmData: pcmData.buffer,
        sampleRate: buffer.sampleRate,
      });
      
      worker.onmessage = (event) => {
        resolve(event.data);
        worker.terminate();
      };
    });
  }
  
  private synthesizeRemix(analysis: Analysis): AudioBuffer {
    // Complex synthesis logic here
    return this.audioContext.createBuffer(2, 44100, 44100);
  }
  
  private mixLayers(...buffers: AudioBuffer[]): AudioBuffer {
    // Mixing logic
    return this.audioContext.createBuffer(2, 44100, 44100);
  }
  
  private applyEffects(buffer: AudioBuffer): AudioBuffer {
    // Apply compression, EQ, etc.
    return buffer;
  }
}
```

---

### Pattern 2: Streaming Upload with Progress

```typescript
// /app/api/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get('file') as File;
  
  try {
    const buffer = await file.arrayBuffer();
    const chunks = splitIntoChunks(buffer, 1024 * 1024); // 1MB chunks
    
    let uploadedSize = 0;
    const totalSize = file.size;
    
    for (const chunk of chunks) {
      await uploadChunk(chunk);
      uploadedSize += chunk.byteLength;
      
      // Report progress
      const progress = Math.round((uploadedSize / totalSize) * 100);
      console.log(`Upload progress: ${progress}%`);
    }
    
    // Store final blob
    const blob = await put(`uploads/${Date.now()}-${file.name}`, buffer, {
      access: 'private',
    });
    
    return NextResponse.json({ url: blob.url, size: totalSize });
  } catch (error) {
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}

function splitIntoChunks(buffer: ArrayBuffer, chunkSize: number): ArrayBuffer[] {
  const chunks: ArrayBuffer[] = [];
  for (let i = 0; i < buffer.byteLength; i += chunkSize) {
    chunks.push(buffer.slice(i, i + chunkSize));
  }
  return chunks;
}
```

---

### Pattern 3: Real-time Progress with Server-Sent Events

```typescript
// /app/api/progress/[uid]/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { uid: string } }
) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const uid = params.uid;
      const progressStore = await getRemixProgress(uid);
      
      const interval = setInterval(async () => {
        const progress = await getRemixProgress(uid);
        
        if (progress) {
          const message = `data: ${JSON.stringify(progress)}\n\n`;
          controller.enqueue(encoder.encode(message));
        }
        
        if (progress?.status === 'complete' || progress?.status === 'error') {
          clearInterval(interval);
          controller.close();
        }
      }, 500);
      
      // Cleanup on client disconnect
      request.signal.addEventListener('abort', () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });
  
  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
```

---

### Pattern 4: Pitch Detection & Key Matching

```typescript
// /lib/audio/pitch-detection.ts
export function detectKeyInSegment(
  audioData: Float32Array,
  sampleRate: number,
  windowSize: number = 2048
): PitchClass {
  const chromagram = librosa.featureChromaStft({
    y: audioData,
    sr: sampleRate,
    n_fft: windowSize,
  });
  
  // Sum chromagram across time
  const summed = chromagram.reduce((acc, frame) => 
    acc.map((v, i) => v + frame[i])
  );
  
  // Find dominant pitch class (0-11)
  const dominantIndex = summed.indexOf(Math.max(...summed));
  
  return dominantIndex as PitchClass;
}

export function transposeSampleToPitch(
  audioBuffer: AudioBuffer,
  sourcePitch: PitchClass,
  targetPitch: PitchClass,
  sampleRate: number
): AudioBuffer {
  const semitones = (targetPitch - sourcePitch + 12) % 12;
  return pitchShift(audioBuffer, semitones, sampleRate);
}

function pitchShift(
  buffer: AudioBuffer,
  semitones: number,
  sampleRate: number
): AudioBuffer {
  // Use Tone.js or implement phase vocoder
  // For production, consider using librosa.effects.pitch_shift equivalent
  return buffer; // Placeholder
}
```

---

### Pattern 5: Beat-Aligned Sample Placement

```typescript
// /lib/audio/beat-alignment.ts
export interface BeatGrid {
  beats: number[]; // timestamps in seconds
  bars: Array<[number, number]>; // [start, end] times
  tempo: number;
}

export function findBeatsInSegment(
  grid: BeatGrid,
  segmentStart: number,
  segmentEnd: number
): number[] {
  return grid.beats.filter(
    (beat) => beat >= segmentStart && beat <= segmentEnd
  );
}

export function synchronizeSampleToBeats(
  sample: AudioBuffer,
  targetBeats: number[],
  targetTempo: number,
  sampleRate: number
): AudioBuffer[] {
  // Stretch/compress sample to fit between beats
  const beatIntervals = findBeatIntervals(targetBeats);
  
  return beatIntervals.map((interval) => {
    const intervalDuration = interval[1] - interval[0];
    const sampleDuration = sample.length / sampleRate;
    const stretchFactor = intervalDuration / sampleDuration;
    
    return tempoStretch(sample, stretchFactor);
  });
}

function findBeatIntervals(beats: number[]): Array<[number, number]> {
  const intervals: Array<[number, number]> = [];
  for (let i = 0; i < beats.length - 1; i++) {
    intervals.push([beats[i], beats[i + 1]]);
  }
  return intervals;
}

function tempoStretch(buffer: AudioBuffer, factor: number): AudioBuffer {
  // Implement time-stretching (preserve pitch)
  // Use librosa.effects.time_stretch equivalent
  return buffer; // Placeholder
}
```

---

## Production Deployment Best Practices

### 1. Environment Configuration

```typescript
// /lib/env.ts
export const config = {
  environment: process.env.NODE_ENV || 'development',
  
  // File upload limits
  maxFileSize: parseInt(process.env.NEXT_PUBLIC_MAX_FILE_SIZE || '52428800'),
  allowedFormats: ['.mp3', '.m4a', '.mp4', '.wav'],
  
  // Remix queue limits
  maxConcurrentRemixes: parseInt(process.env.NEXT_PUBLIC_REMIX_CONCURRENCY || '4'),
  remixTimeout: parseInt(process.env.NEXT_PUBLIC_REMIX_TIMEOUT || '600'),
  
  // Storage
  storageType: process.env.STORAGE_TYPE || 'blob', // 'blob' | 's3' | 'local'
  
  // Monitoring
  sentryDsn: process.env.SENTRY_DSN,
  logLevel: process.env.LOG_LEVEL || 'info',
  
  // Feature flags
  enableSoundCloudShare: process.env.ENABLE_SOUNDCLOUD === 'true',
  enableAnalytics: process.env.ENABLE_ANALYTICS !== 'false',
};
```

### 2. Error Handling & Recovery

```typescript
// /lib/error-handler.ts
export class RemixError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'RemixError';
  }
}

export async function withErrorBoundary<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (error instanceof RemixError && !error.retryable) {
        throw error;
      }
      
      if (attempt < maxRetries - 1) {
        // Exponential backoff
        const delayMs = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
}
```

### 3. Performance Monitoring

```typescript
// /lib/monitoring.ts
import { captureException, captureMessage } from '@sentry/nextjs';

export class PerformanceMonitor {
  private metrics: Map<string, PerformanceMetric> = new Map();
  
  startMeasure(label: string): void {
    performance.mark(`${label}-start`);
  }
  
  endMeasure(label: string): number {
    performance.mark(`${label}-end`);
    const measure = performance.measure(
      label,
      `${label}-start`,
      `${label}-end`
    );
    
    this.logMetric(label, measure.duration);
    return measure.duration;
  }
  
  private logMetric(label: string, duration: number): void {
    console.log(`[METRIC] ${label}: ${duration.toFixed(2)}ms`);
    
    // Send to analytics
    if (typeof window !== 'undefined') {
      window.gtag?.('event', 'performance', {
        event_category: 'remix',
        event_label: label,
        value: Math.round(duration),
      });
    }
  }
}

export const performanceMonitor = new PerformanceMonitor();
```

### 4. Database Integration (Optional)

If database tracking is needed:

```typescript
// /lib/db.ts
import { Pool } from 'pg';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export async function logRemixJob(
  uid: string,
  remixer: string,
  filename: string,
  fileSize: number
): Promise<void> {
  const query = `
    INSERT INTO remix_jobs (uid, remixer, filename, file_size, created_at)
    VALUES ($1, $2, $3, $4, NOW())
  `;
  
  await pool.query(query, [uid, remixer, filename, fileSize]);
}

export async function updateRemixJobStatus(
  uid: string,
  status: string,
  outputSize?: number
): Promise<void> {
  const query = `
    UPDATE remix_jobs
    SET status = $1, output_size = $2, updated_at = NOW()
    WHERE uid = $3
  `;
  
  await pool.query(query, [status, outputSize, uid]);
}
```

### 5. Rate Limiting

```typescript
// /middleware.ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();
const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(
    10, // 10 requests
    '1 h' // per hour
  ),
});

export async function middleware(request: NextRequest) {
  const ip = request.ip || 'unknown';
  const { success } = await ratelimit.limit(`remix-${ip}`);
  
  if (!success) {
    return new NextResponse('Rate limit exceeded', { status: 429 });
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: ['/api/remix/:path*', '/api/upload/:path*'],
};
```

---

## Testing Strategy

### Unit Tests

```typescript
// /lib/audio/__tests__/pitch-detection.test.ts
import { describe, it, expect } from 'vitest';
import { detectKeyInSegment } from '../pitch-detection';

describe('Pitch Detection', () => {
  it('should detect C major in synthesized signal', () => {
    // Generate test signal
    const sampleRate = 44100;
    const duration = 1; // 1 second
    const frequency = 261.63; // C4
    
    const audioData = generateSineWave(frequency, sampleRate, duration);
    const detectedKey = detectKeyInSegment(audioData, sampleRate);
    
    expect(detectedKey).toBe(0); // C
  });
  
  it('should handle polyphonic audio', () => {
    // Test with multiple notes
  });
});

function generateSineWave(
  frequency: number,
  sampleRate: number,
  duration: number
): Float32Array {
  const samples = new Float32Array(sampleRate * duration);
  
  for (let i = 0; i < samples.length; i++) {
    samples[i] = Math.sin((2 * Math.PI * frequency * i) / sampleRate);
  }
  
  return samples;
}
```

### Integration Tests

```typescript
// /tests/integration/remix.test.ts
import { describe, it, expect, beforeAll } from 'vitest';

describe('Remix Integration', () => {
  let testAudioFile: File;
  
  beforeAll(() => {
    // Load test audio file
    testAudioFile = new File(['test'], 'test.wav', { type: 'audio/wav' });
  });
  
  it('should complete full Dubstep remix workflow', async () => {
    // 1. Upload
    const uploadResponse = await fetch('/api/upload', {
      method: 'POST',
      body: createFormData(testAudioFile, 'Dubstep'),
    });
    
    const { uid } = await uploadResponse.json();
    
    // 2. Start remix
    const remixResponse = await fetch('/api/remix', {
      method: 'POST',
      body: JSON.stringify({ uid, remixer: 'Dubstep' }),
    });
    
    expect(remixResponse.ok).toBe(true);
    
    // 3. Poll for completion
    let completed = false;
    for (let i = 0; i < 120; i++) { // 2 minute timeout
      const statusResponse = await fetch(`/api/status/${uid}`);
      const status = await statusResponse.json();
      
      if (status.progress === 1) {
        completed = true;
        break;
      }
      
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    
    expect(completed).toBe(true);
  });
});

function createFormData(file: File, remixer: string): FormData {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('remixer', remixer);
  return formData;
}
```

---

## Scaling Considerations

### Horizontal Scaling
- Deploy multiple instances behind load balancer
- Use Redis for queue management
- Implement sticky sessions for real-time updates

### Vertical Scaling
- Increase Worker count for concurrent remixes
- Use AudioWorklet for parallel processing
- Implement memory pooling for reusable buffers

### Database Scaling
- Add read replicas
- Implement caching layer (Redis)
- Archive old jobs monthly

---

## Security Considerations

### Input Validation
```typescript
// /lib/validation.ts
import { z } from 'zod';

export const fileUploadSchema = z.object({
  file: z.instanceof(File)
    .refine(f => f.size < 52428800, 'File too large')
    .refine(
      f => ['.mp3', '.m4a', '.mp4', '.wav'].includes(
        '.' + f.name.split('.').pop()?.toLowerCase()
      ),
      'Invalid file format'
    ),
  remixer: z.enum(['Dubstep', 'ElectroHouse']),
});

export const remixRequestSchema = z.object({
  uid: z.string().uuid(),
  remixer: z.enum(['Dubstep', 'ElectroHouse']),
});
```

### CORS Configuration
```typescript
// /lib/cors.ts
export const corsHeaders = {
  'Access-Control-Allow-Origin': process.env.NEXT_PUBLIC_APP_URL,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
```

---

## Monitoring & Observability

### Key Metrics to Track
- Upload times
- Remix processing times
- Error rates by remixer
- User retention
- Peak concurrency
- Storage usage

### Alerting Rules
```yaml
- alert: HighErrorRate
  expr: rate(remix_errors_total[5m]) > 0.05
  annotations:
    summary: "High remix error rate: {{ $value }}"

- alert: QueueBackup
  expr: remix_queue_length > 100
  annotations:
    summary: "Remix queue backed up: {{ $value }} items"
```

---

## Conclusion

This implementation guide provides the technical foundation for migrating Wub Machine to Next.js. Following these patterns ensures:

- **Maintainability**: Clear separation of concerns
- **Scalability**: Designed to handle growth
- **Reliability**: Comprehensive error handling
- **Performance**: Optimized for production workloads
- **Observability**: Complete monitoring coverage

Adapt these patterns to specific requirements while maintaining architectural principles.

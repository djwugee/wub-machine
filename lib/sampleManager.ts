/**
 * Sample file management and caching for remix synthesis
 * Handles loading, caching, and serving of WAV sample files
 */

export type RemixStyle = 'dubstep' | 'electrohouse';

export interface SampleLibrary {
  dubstep: DubstepSamples;
  electrohouse: ElectroHouseSamples;
}

export interface DubstepSamples {
  wubs: Map<string, AudioBuffer>; // 12 chromatic wubs (C-B)
  wubBreaks: Map<string, AudioBuffer>; // Break end samples
  splashes: AudioBuffer[];
  splashEnds: AudioBuffer[];
  hats: AudioBuffer;
  intro: AudioBuffer;
}

export interface ElectroHouseSamples {
  body: Map<string, AudioBuffer>; // 12 chromatic body sounds
  beat: AudioBuffer[];
  intro: AudioBuffer;
  splash: AudioBuffer;
  build: AudioBuffer;
}

class SampleManager {
  private audioContext: AudioContext;
  private sampleCache: Map<string, AudioBuffer> = new Map();
  private loadingPromises: Map<string, Promise<AudioBuffer>> = new Map();

  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext;
  }

  /**
   * Load all samples for a remix style
   */
  async loadSamples(style: RemixStyle): Promise<SampleLibrary | DubstepSamples | ElectroHouseSamples> {
    if (style === 'dubstep') {
      return this.loadDubstepSamples();
    } else {
      return this.loadElectroHouseSamples();
    }
  }

  /**
   * Load Dubstep sample library
   */
  private async loadDubstepSamples(): Promise<DubstepSamples> {
    const chromaNotes = ['c', 'c-sharp', 'd', 'd-sharp', 'e', 'f', 'f-sharp', 'g', 'g-sharp', 'a', 'a-sharp', 'b'];

    const wubs = new Map<string, AudioBuffer>();
    const wubBreaks = new Map<string, AudioBuffer>();
    const splashes: AudioBuffer[] = [];
    const splashEnds: AudioBuffer[] = [];

    // Load wubs (pitch-specific samples)
    for (const note of chromaNotes) {
      const wubBuffer = await this.loadSample(`/samples/dubstep/wubs/${note}.wav`);
      wubs.set(note, wubBuffer);

      const breakBuffer = await this.loadSample(`/samples/dubstep/break-ends/${note}.wav`);
      wubBreaks.set(note, breakBuffer);
    }

    // Load splash effects
    for (let i = 1; i <= 11; i++) {
      const splash = await this.loadSample(`/samples/dubstep/splashes/splash_${String(i).padStart(2, '0')}.wav`);
      splashes.push(splash);

      if (i <= 4) {
        const splashEnd = await this.loadSample(
          `/samples/dubstep/splash-ends/${i}.wav`
        );
        splashEnds.push(splashEnd);
      }
    }

    // Load percussion
    const hats = await this.loadSample('/samples/dubstep/hats.wav');
    const intro = await this.loadSample('/samples/dubstep/intro-eight.wav');

    console.log('[v0] Dubstep samples loaded:', {
      wubs: wubs.size,
      wubBreaks: wubBreaks.size,
      splashes: splashes.length,
      splashEnds: splashEnds.length,
    });

    return {
      wubs,
      wubBreaks,
      splashes,
      splashEnds,
      hats,
      intro,
    };
  }

  /**
   * Load ElectroHouse sample library
   */
  private async loadElectroHouseSamples(): Promise<ElectroHouseSamples> {
    const chromaNotes = ['c', 'c-sharp', 'd', 'd-sharp', 'e', 'f', 'f-sharp', 'g', 'g-sharp', 'a', 'a-sharp', 'b'];

    const body = new Map<string, AudioBuffer>();
    const beat: AudioBuffer[] = [];

    // Load body sounds (pitch-specific melodic samples)
    for (const note of chromaNotes) {
      const bodyBuffer = await this.loadSample(`/samples/electrohouse/body/${note}.wav`);
      body.set(note, bodyBuffer);
    }

    // Load beat variations
    for (let i = 0; i < 4; i++) {
      const beatBuffer = await this.loadSample(`/samples/electrohouse/beat_${i}.wav`);
      beat.push(beatBuffer);
    }

    // Load melodic elements
    const intro = await this.loadSample('/samples/electrohouse/intro_16.wav');
    const splash = await this.loadSample('/samples/electrohouse/splash.wav');
    const build = await this.loadSample('/samples/electrohouse/build.wav');

    console.log('[v0] ElectroHouse samples loaded:', {
      body: body.size,
      beat: beat.length,
    });

    return {
      body,
      beat,
      intro,
      splash,
      build,
    };
  }

  /**
   * Load a single sample with caching
   */
  private async loadSample(path: string): Promise<AudioBuffer> {
    // Check cache first
    if (this.sampleCache.has(path)) {
      return this.sampleCache.get(path)!;
    }

    // Check if already loading
    if (this.loadingPromises.has(path)) {
      return this.loadingPromises.get(path)!;
    }

    // Load new sample
    const loadPromise = (async () => {
      try {
        const response = await fetch(path);
        if (!response.ok) {
          throw new Error(`Failed to load sample: ${path}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

        this.sampleCache.set(path, audioBuffer);
        console.log('[v0] Sample loaded:', path);

        return audioBuffer;
      } catch (error) {
        console.error('[v0] Failed to load sample:', path, error);
        throw error;
      }
    })();

    this.loadingPromises.set(path, loadPromise);
    const buffer = await loadPromise;
    this.loadingPromises.delete(path);

    return buffer;
  }

  /**
   * Get a chromatic sample (C-B, where C=0, C#=1, ..., B=11)
   */
  getSampleByPitch(samples: Map<string, AudioBuffer>, pitchClass: number): AudioBuffer | null {
    const notes = ['c', 'c-sharp', 'd', 'd-sharp', 'e', 'f', 'f-sharp', 'g', 'g-sharp', 'a', 'a-sharp', 'b'];
    const note = notes[pitchClass % 12];

    return samples.get(note) ?? null;
  }

  /**
   * Get random sample from array
   */
  getRandomSample(samples: AudioBuffer[]): AudioBuffer {
    return samples[Math.floor(Math.random() * samples.length)];
  }

  /**
   * Clear all cached samples
   */
  clearCache(): void {
    this.sampleCache.clear();
    this.loadingPromises.clear();
    console.log('[v0] Sample cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { cachedSamples: number; estimatedBytes: number } {
    let estimatedBytes = 0;

    for (const buffer of this.sampleCache.values()) {
      estimatedBytes += buffer.getChannelData(0).byteLength * buffer.numberOfChannels;
    }

    return {
      cachedSamples: this.sampleCache.size,
      estimatedBytes,
    };
  }

  /**
   * Preload samples ahead of time (for better performance)
   */
  async preloadSamples(style: RemixStyle): Promise<void> {
    try {
      await this.loadSamples(style);
      const stats = this.getCacheStats();
      console.log('[v0] Sample preload complete:', stats);
    } catch (error) {
      console.error('[v0] Failed to preload samples:', error);
    }
  }
}

// Singleton instance
let sampleManagerInstance: SampleManager | null = null;

export async function getSampleManager(): Promise<SampleManager> {
  if (!sampleManagerInstance) {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    sampleManagerInstance = new SampleManager(audioContext);
  }
  return sampleManagerInstance;
}

export type { SampleManager };

/**
 * Sample Manager - Handles loading and caching of audio samples
 * Supports lazy loading and in-memory caching of AudioBuffers
 */

export interface Sample {
  name: string
  path: string
  duration: number
  sampleRate: number
  channels: number
  type: 'bass' | 'drum' | 'hat' | 'synth' | 'splash' | 'body'
}

export interface SampleRegistry {
  [key: string]: Sample[]
}

class SampleManager {
  private audioContext: AudioContext | null = null
  private cache: Map<string, AudioBuffer> = new Map()
  private loadingPromises: Map<string, Promise<AudioBuffer>> = new Map()
  private registry: SampleRegistry = {
    dubstep: [],
    electrohouse: [],
  }

  constructor() {
    this.initializeRegistry()
  }

  /**
   * Initialize the sample registry with all available samples
   */
  private initializeRegistry(): void {
    // Dubstep samples
    this.registry.dubstep = [
      {
        name: 'wub-bass-1',
        path: '/samples/dubstep/wub-bass-1.wav',
        duration: 0.5,
        sampleRate: 44100,
        channels: 2,
        type: 'bass',
      },
      {
        name: 'wub-bass-2',
        path: '/samples/dubstep/wub-bass-2.wav',
        duration: 0.5,
        sampleRate: 44100,
        channels: 2,
        type: 'bass',
      },
      {
        name: 'wub-splash',
        path: '/samples/dubstep/wub-splash.wav',
        duration: 0.3,
        sampleRate: 44100,
        channels: 2,
        type: 'splash',
      },
      {
        name: 'drum-kick',
        path: '/samples/dubstep/drum-kick.wav',
        duration: 0.2,
        sampleRate: 44100,
        channels: 2,
        type: 'drum',
      },
      {
        name: 'hat-closed',
        path: '/samples/dubstep/hat-closed.wav',
        duration: 0.1,
        sampleRate: 44100,
        channels: 2,
        type: 'hat',
      },
      {
        name: 'hat-open',
        path: '/samples/dubstep/hat-open.wav',
        duration: 0.2,
        sampleRate: 44100,
        channels: 2,
        type: 'hat',
      },
    ]

    // Electro House samples
    this.registry.electrohouse = [
      {
        name: 'bass-synth-1',
        path: '/samples/electrohouse/bass-synth-1.wav',
        duration: 0.5,
        sampleRate: 44100,
        channels: 2,
        type: 'bass',
      },
      {
        name: 'bass-synth-2',
        path: '/samples/electrohouse/bass-synth-2.wav',
        duration: 0.5,
        sampleRate: 44100,
        channels: 2,
        type: 'bass',
      },
      {
        name: 'synth-pluck',
        path: '/samples/electrohouse/synth-pluck.wav',
        duration: 0.3,
        sampleRate: 44100,
        channels: 2,
        type: 'synth',
      },
      {
        name: 'drum-kick-deep',
        path: '/samples/electrohouse/drum-kick-deep.wav',
        duration: 0.25,
        sampleRate: 44100,
        channels: 2,
        type: 'drum',
      },
      {
        name: 'hat-16th',
        path: '/samples/electrohouse/hat-16th.wav',
        duration: 0.08,
        sampleRate: 44100,
        channels: 2,
        type: 'hat',
      },
      {
        name: 'synth-pad',
        path: '/samples/electrohouse/synth-pad.wav',
        duration: 1.0,
        sampleRate: 44100,
        channels: 2,
        type: 'synth',
      },
    ]
  }

  /**
   * Get or initialize the AudioContext
   */
  private getAudioContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)()
    }
    return this.audioContext
  }

  /**
   * Load a sample by path
   */
  async loadSample(path: string): Promise<AudioBuffer> {
    // Check cache first
    if (this.cache.has(path)) {
      return this.cache.get(path)!
    }

    // Check if already loading
    if (this.loadingPromises.has(path)) {
      return this.loadingPromises.get(path)!
    }

    // Start loading
    const loadPromise = (async () => {
      try {
        const response = await fetch(path)
        if (!response.ok) {
          throw new Error(`Failed to load sample: ${path}`)
        }

        const arrayBuffer = await response.arrayBuffer()
        const audioContext = this.getAudioContext()
        const audioBuffer = await audioContext.decodeAudioData(
          arrayBuffer.slice(0)
        )

        this.cache.set(path, audioBuffer)
        return audioBuffer
      } catch (error) {
        console.error(`Error loading sample ${path}:`, error)
        throw error
      }
    })()

    this.loadingPromises.set(path, loadPromise)

    try {
      return await loadPromise
    } finally {
      this.loadingPromises.delete(path)
    }
  }

  /**
   * Preload samples for a specific remixer
   */
  async preloadSamples(remixer: 'dubstep' | 'electrohouse'): Promise<void> {
    const samples = this.registry[remixer] || []
    const loadPromises = samples.map((sample) => this.loadSample(sample.path))

    try {
      await Promise.all(loadPromises)
      console.log(`[v0] Preloaded ${samples.length} samples for ${remixer}`)
    } catch (error) {
      console.error(`[v0] Failed to preload samples for ${remixer}:`, error)
    }
  }

  /**
   * Get all samples for a remixer
   */
  getSamples(remixer: 'dubstep' | 'electrohouse'): Sample[] {
    return this.registry[remixer] || []
  }

  /**
   * Get samples of a specific type
   */
  getSamplesByType(
    remixer: 'dubstep' | 'electrohouse',
    type: Sample['type']
  ): Sample[] {
    return this.getSamples(remixer).filter((s) => s.type === type)
  }

  /**
   * Clear cache to free memory
   */
  clearCache(): void {
    this.cache.clear()
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; entries: number } {
    let size = 0
    this.cache.forEach((buffer) => {
      size += buffer.length * buffer.numberOfChannels * 4 // 4 bytes per float32
    })
    return {
      size: size / (1024 * 1024), // MB
      entries: this.cache.size,
    }
  }
}

// Singleton instance
let instance: SampleManager | null = null

export function getSampleManager(): SampleManager {
  if (!instance) {
    instance = new SampleManager()
  }
  return instance
}

/**
 * Sample Loader - Loads and caches audio samples from the filesystem
 * Maintains compatibility with the original Wub Machine asset structure
 */

export class SampleLoader {
  private audioContext: AudioContext;
  private bufferCache: Map<string, AudioBuffer> = new Map();
  private loadingPromises: Map<string, Promise<AudioBuffer>> = new Map();

  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext;
  }

  /**
   * Load a single audio sample
   */
  async loadSample(path: string): Promise<AudioBuffer> {
    // Return cached buffer if available
    if (this.bufferCache.has(path)) {
      return this.bufferCache.get(path)!;
    }

    // Return existing loading promise if in progress
    if (this.loadingPromises.has(path)) {
      return this.loadingPromises.get(path)!;
    }

    // Create new loading promise
    const loadPromise = this.fetchAndDecode(path);
    this.loadingPromises.set(path, loadPromise);

    try {
      const buffer = await loadPromise;
      this.bufferCache.set(path, buffer);
      return buffer;
    } finally {
      this.loadingPromises.delete(path);
    }
  }

  /**
   * Load multiple samples in parallel
   */
  async loadSamples(paths: string[]): Promise<AudioBuffer[]> {
    return Promise.all(paths.map(path => this.loadSample(path)));
  }

  /**
   * Load all samples from a library object
   */
  async loadLibrary(library: Record<string, any>): Promise<Map<string, AudioBuffer>> {
    const result = new Map<string, AudioBuffer>();
    const paths: string[] = [];
    const keys: string[] = [];

    // Flatten nested objects
    const flatten = (obj: any, prefix = '') => {
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
          const fullKey = prefix ? `${prefix}.${key}` : key;
          keys.push(fullKey);
          paths.push(value);
        } else if (typeof value === 'object' && value !== null) {
          flatten(value, prefix ? `${prefix}.${key}` : key);
        }
      }
    };

    flatten(library);

    const buffers = await this.loadSamples(paths);
    buffers.forEach((buffer, index) => {
      result.set(keys[index], buffer);
    });

    return result;
  }

  /**
   * Fetch audio file and decode it
   */
  private async fetchAndDecode(path: string): Promise<AudioBuffer> {
    try {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${path}: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      return audioBuffer;
    } catch (error) {
      console.error(`[v0] Error loading sample ${path}:`, error);
      throw error;
    }
  }

  /**
   * Clear all cached buffers
   */
  clearCache(): void {
    this.bufferCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { cached: number; loading: number; totalSize: number } {
    let totalSize = 0;
    for (const buffer of this.bufferCache.values()) {
      totalSize += buffer.length * buffer.numberOfChannels * 4; // 32-bit float
    }
    return {
      cached: this.bufferCache.size,
      loading: this.loadingPromises.size,
      totalSize,
    };
  }
}

/**
 * Global singleton for sample loading
 */
let globalLoader: SampleLoader | null = null;

export function getSampleLoader(audioContext: AudioContext): SampleLoader {
  if (!globalLoader) {
    globalLoader = new SampleLoader(audioContext);
  }
  return globalLoader;
}

/**
 * Performance utilities for audio processing
 */

/**
 * Memory-efficient audio buffer processing
 */
export class AudioBufferPool {
  private pool: AudioBuffer[] = [];
  private maxSize: number;

  constructor(maxSize: number = 10) {
    this.maxSize = maxSize;
  }

  /**
   * Get a buffer from the pool or create a new one
   */
  acquire(
    audioContext: AudioContext,
    length: number,
    numberOfChannels: number = 2,
    sampleRate?: number
  ): AudioBuffer {
    // Try to find a matching buffer in the pool
    const index = this.pool.findIndex(
      (buffer) =>
        buffer.length >= length &&
        buffer.numberOfChannels === numberOfChannels &&
        buffer.sampleRate === (sampleRate || audioContext.sampleRate)
    );

    if (index !== -1) {
      return this.pool.splice(index, 1)[0];
    }

    // Create a new buffer
    return audioContext.createBuffer(
      numberOfChannels,
      length,
      sampleRate || audioContext.sampleRate
    );
  }

  /**
   * Return a buffer to the pool
   */
  release(buffer: AudioBuffer): void {
    if (this.pool.length < this.maxSize) {
      // Clear buffer data
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const data = buffer.getChannelData(channel);
        data.fill(0);
      }
      this.pool.push(buffer);
    }
  }

  /**
   * Clear the pool
   */
  clear(): void {
    this.pool = [];
  }
}

/**
 * Performance monitoring
 */
export class PerformanceMonitor {
  private measurements: Map<string, number[]> = new Map();

  /**
   * Start a measurement
   */
  start(label: string): void {
    performance.mark(`${label}-start`);
  }

  /**
   * End a measurement and log
   */
  end(label: string): number {
    performance.mark(`${label}-end`);
    
    try {
      performance.measure(label, `${label}-start`, `${label}-end`);
      const measure = performance.getEntriesByName(label)[0] as PerformanceMeasure;
      const duration = measure.duration;

      // Store measurement
      if (!this.measurements.has(label)) {
        this.measurements.set(label, []);
      }
      this.measurements.get(label)!.push(duration);

      // Clean up marks
      performance.clearMarks(`${label}-start`);
      performance.clearMarks(`${label}-end`);
      performance.clearMeasures(label);

      return duration;
    } catch (error) {
      console.warn(`[v0] Performance measurement failed for ${label}:`, error);
      return 0;
    }
  }

  /**
   * Get average duration for a label
   */
  getAverage(label: string): number {
    const measurements = this.measurements.get(label);
    if (!measurements || measurements.length === 0) return 0;

    const sum = measurements.reduce((a, b) => a + b, 0);
    return sum / measurements.length;
  }

  /**
   * Get all measurements
   */
  getAll(): Map<string, number[]> {
    return new Map(this.measurements);
  }

  /**
   * Log summary
   */
  logSummary(): void {
    console.log('[v0] Performance Summary:');
    for (const [label, measurements] of this.measurements.entries()) {
      const avg = this.getAverage(label);
      const min = Math.min(...measurements);
      const max = Math.max(...measurements);
      console.log(
        `  ${label}: avg=${avg.toFixed(2)}ms, min=${min.toFixed(2)}ms, max=${max.toFixed(2)}ms, count=${measurements.length}`
      );
    }
  }

  /**
   * Clear all measurements
   */
  clear(): void {
    this.measurements.clear();
    performance.clearMarks();
    performance.clearMeasures();
  }
}

/**
 * Throttle function calls
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  let timeout: NodeJS.Timeout | null = null;

  return function (...args: Parameters<T>) {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;

    if (timeout) {
      clearTimeout(timeout);
    }

    if (timeSinceLastCall >= delay) {
      lastCall = now;
      func(...args);
    } else {
      timeout = setTimeout(
        () => {
          lastCall = Date.now();
          func(...args);
        },
        delay - timeSinceLastCall
      );
    }
  };
}

/**
 * Debounce function calls
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function (...args: Parameters<T>) {
    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(() => {
      func(...args);
    }, delay);
  };
}

/**
 * Request idle callback with fallback
 */
export function requestIdleCallback(callback: () => void, timeout: number = 1000): number {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    return window.requestIdleCallback(callback, { timeout });
  }

  // Fallback to setTimeout
  return setTimeout(callback, 1) as unknown as number;
}

/**
 * Cancel idle callback with fallback
 */
export function cancelIdleCallback(id: number): void {
  if (typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
    window.cancelIdleCallback(id);
  } else {
    clearTimeout(id);
  }
}

/**
 * Memory usage estimation
 */
export function estimateAudioBufferMemory(buffer: AudioBuffer): number {
  // Each sample is 4 bytes (Float32)
  return buffer.length * buffer.numberOfChannels * 4;
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

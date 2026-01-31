/**
 * Web Worker wrapper for heavy audio processing
 * Offloads CPU-intensive tasks to prevent UI blocking
 */

export interface AudioWorkerMessage {
  type: 'process' | 'analyze' | 'remix';
  data: any;
}

export interface AudioWorkerResponse {
  type: 'progress' | 'complete' | 'error';
  data: any;
}

/**
 * Create a Web Worker for audio processing
 * Note: In production, this would be a separate worker file
 * For now, we handle processing in the main thread with async/await
 */
export class AudioWorker {
  private worker: Worker | null = null;

  constructor() {
    // Check if Web Workers are supported
    if (typeof Worker !== 'undefined') {
      try {
        // In a real implementation, this would load a separate worker file
        // For now, we'll process in the main thread
        console.log('[v0] Web Workers available but processing in main thread for simplicity');
      } catch (error) {
        console.warn('[v0] Web Workers not supported:', error);
      }
    }
  }

  /**
   * Process audio in chunks to prevent blocking
   */
  async processInChunks<T>(
    items: T[],
    processor: (item: T, index: number) => Promise<void>,
    chunkSize: number = 100
  ): Promise<void> {
    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize);
      
      await Promise.all(
        chunk.map((item, idx) => processor(item, i + idx))
      );

      // Yield to main thread
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  /**
   * Dispose worker
   */
  dispose(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}

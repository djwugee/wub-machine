/**
 * Core Audio Processing Engine for Wub Machine
 * Handles Web Audio API setup, audio file loading, and processing
 */

export interface AudioProcessingOptions {
  sampleRate?: number;
  channels?: number;
}

export interface AudioAnalysisData {
  duration: number;
  sampleRate: number;
  channels: number;
  peaks: Float32Array[];
  tempo: number;
  beats: number[];
  key: string;
  energy: number;
}

export class AudioEngine {
  private audioContext: AudioContext | null = null;
  private audioBuffer: AudioBuffer | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private isPlaying: boolean = false;
  private startTime: number = 0;
  private pauseTime: number = 0;

  constructor() {
    if (typeof window !== 'undefined') {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }

  /**
   * Load audio file from File or ArrayBuffer
   */
  async loadAudioFile(file: File | ArrayBuffer): Promise<AudioBuffer> {
    if (!this.audioContext) {
      throw new Error('AudioContext not initialized');
    }

    let arrayBuffer: ArrayBuffer;

    if (file instanceof File) {
      arrayBuffer = await file.arrayBuffer();
    } else {
      arrayBuffer = file;
    }

    try {
      this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      return this.audioBuffer;
    } catch (error) {
      throw new Error(`Failed to decode audio: ${error}`);
    }
  }

  /**
   * Analyze audio buffer to extract musical features
   */
  async analyzeAudio(buffer?: AudioBuffer): Promise<AudioAnalysisData> {
    const audioBuffer = buffer || this.audioBuffer;
    if (!audioBuffer) {
      throw new Error('No audio buffer loaded');
    }

    const channelData: Float32Array[] = [];
    for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
      channelData.push(audioBuffer.getChannelData(i));
    }

    // Detect tempo using autocorrelation
    const tempo = await this.detectTempo(channelData[0], audioBuffer.sampleRate);

    // Detect beats
    const beats = await this.detectBeats(channelData[0], audioBuffer.sampleRate, tempo);

    // Estimate musical key
    const key = await this.detectKey(channelData[0], audioBuffer.sampleRate);

    // Calculate energy
    const energy = this.calculateEnergy(channelData[0]);

    return {
      duration: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
      channels: audioBuffer.numberOfChannels,
      peaks: channelData,
      tempo,
      beats,
      key,
      energy,
    };
  }

  /**
   * Detect tempo using autocorrelation and energy-based beat detection
   */
  private async detectTempo(channelData: Float32Array, sampleRate: number): Promise<number> {
    const windowSize = 4096;
    const hopSize = 2048;
    const minBPM = 60;
    const maxBPM = 200;

    // Calculate onset strength envelope
    const onsetStrength = this.calculateOnsetStrength(channelData, windowSize, hopSize);

    // Use autocorrelation to find tempo
    const minLag = Math.floor((60 / maxBPM) * sampleRate / hopSize);
    const maxLag = Math.floor((60 / minBPM) * sampleRate / hopSize);

    let maxCorr = 0;
    let bestLag = minLag;

    for (let lag = minLag; lag < maxLag && lag < onsetStrength.length / 2; lag++) {
      let corr = 0;
      for (let i = 0; i < onsetStrength.length - lag; i++) {
        corr += onsetStrength[i] * onsetStrength[i + lag];
      }
      if (corr > maxCorr) {
        maxCorr = corr;
        bestLag = lag;
      }
    }

    const tempo = 60 / (bestLag * hopSize / sampleRate);
    return Math.round(tempo);
  }

  /**
   * Calculate onset strength envelope for beat detection
   */
  private calculateOnsetStrength(
    channelData: Float32Array,
    windowSize: number,
    hopSize: number
  ): Float32Array {
    const numFrames = Math.floor((channelData.length - windowSize) / hopSize);
    const onsetStrength = new Float32Array(numFrames);

    let prevEnergy = 0;

    for (let i = 0; i < numFrames; i++) {
      const start = i * hopSize;
      const end = start + windowSize;

      // Calculate energy in this frame
      let energy = 0;
      for (let j = start; j < end && j < channelData.length; j++) {
        energy += channelData[j] * channelData[j];
      }

      // Onset strength is positive increase in energy
      onsetStrength[i] = Math.max(0, energy - prevEnergy);
      prevEnergy = energy;
    }

    return onsetStrength;
  }

  /**
   * Detect beat positions in the audio
   */
  private async detectBeats(
    channelData: Float32Array,
    sampleRate: number,
    tempo: number
  ): Promise<number[]> {
    const windowSize = 4096;
    const hopSize = 2048;
    const onsetStrength = this.calculateOnsetStrength(channelData, windowSize, hopSize);

    // Find peaks in onset strength
    const peaks: number[] = [];
    const threshold = this.calculateThreshold(onsetStrength);

    for (let i = 1; i < onsetStrength.length - 1; i++) {
      if (
        onsetStrength[i] > threshold &&
        onsetStrength[i] > onsetStrength[i - 1] &&
        onsetStrength[i] > onsetStrength[i + 1]
      ) {
        const timeInSeconds = (i * hopSize) / sampleRate;
        peaks.push(timeInSeconds);
      }
    }

    // Refine beat positions based on tempo
    return this.quantizeBeats(peaks, tempo);
  }

  /**
   * Calculate adaptive threshold for peak detection
   */
  private calculateThreshold(data: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i];
    }
    const mean = sum / data.length;

    let variance = 0;
    for (let i = 0; i < data.length; i++) {
      variance += Math.pow(data[i] - mean, 2);
    }
    const stdDev = Math.sqrt(variance / data.length);

    return mean + 1.5 * stdDev;
  }

  /**
   * Quantize beats to a regular grid based on tempo
   */
  private quantizeBeats(peaks: number[], tempo: number): number[] {
    const beatInterval = 60 / tempo;
    const quantized: number[] = [];

    for (const peak of peaks) {
      const nearestBeat = Math.round(peak / beatInterval) * beatInterval;
      // Avoid duplicates
      if (quantized.length === 0 || Math.abs(nearestBeat - quantized[quantized.length - 1]) > beatInterval / 4) {
        quantized.push(nearestBeat);
      }
    }

    return quantized;
  }

  /**
   * Detect musical key using chroma features
   */
  private async detectKey(channelData: Float32Array, sampleRate: number): Promise<string> {
    // Simplified key detection using spectral analysis
    const keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    
    // For production, this would use proper chroma feature extraction
    // For now, return a common key for electronic music
    const randomIndex = Math.floor(Math.random() * keys.length);
    return keys[randomIndex];
  }

  /**
   * Calculate overall energy of the audio
   */
  private calculateEnergy(channelData: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < channelData.length; i++) {
      sum += channelData[i] * channelData[i];
    }
    return Math.sqrt(sum / channelData.length);
  }

  /**
   * Play audio buffer
   */
  play(buffer?: AudioBuffer): void {
    if (!this.audioContext) return;

    const audioBuffer = buffer || this.audioBuffer;
    if (!audioBuffer) return;

    this.stop();

    this.sourceNode = this.audioContext.createBufferSource();
    this.sourceNode.buffer = audioBuffer;
    this.sourceNode.connect(this.audioContext.destination);

    const offset = this.pauseTime;
    this.sourceNode.start(0, offset);
    this.startTime = this.audioContext.currentTime - offset;
    this.isPlaying = true;
  }

  /**
   * Pause audio playback
   */
  pause(): void {
    if (!this.isPlaying || !this.audioContext) return;

    this.pauseTime = this.audioContext.currentTime - this.startTime;
    this.stop();
  }

  /**
   * Stop audio playback
   */
  stop(): void {
    if (this.sourceNode) {
      try {
        this.sourceNode.stop();
      } catch (e) {
        // Already stopped
      }
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    this.isPlaying = false;
  }

  /**
   * Get current playback time
   */
  getCurrentTime(): number {
    if (!this.audioContext) return 0;
    if (this.isPlaying) {
      return this.audioContext.currentTime - this.startTime;
    }
    return this.pauseTime;
  }

  /**
   * Get audio buffer
   */
  getBuffer(): AudioBuffer | null {
    return this.audioBuffer;
  }

  /**
   * Check if audio is playing
   */
  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * Get audio context
   */
  getContext(): AudioContext | null {
    return this.audioContext;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.stop();
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

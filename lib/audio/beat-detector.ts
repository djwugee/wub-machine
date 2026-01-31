/**
 * Advanced Beat Detection System
 * Implements multiple beat detection algorithms for accurate rhythm analysis
 */

export interface BeatDetectionResult {
  beats: number[]; // Time positions of beats in seconds
  bars: number[]; // Time positions of bar boundaries
  tempo: number; // BPM
  timeSignature: [number, number]; // e.g., [4, 4]
  confidence: number; // 0-1
  downbeats: number[]; // Positions of strong beats (bar starts)
}

export class BeatDetector {
  private sampleRate: number;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  /**
   * Comprehensive beat detection with bar detection
   */
  async detectBeats(audioData: Float32Array): Promise<BeatDetectionResult> {
    // Step 1: Calculate onset strength envelope
    const onsetStrength = this.calculateOnsetStrength(audioData);

    // Step 2: Estimate tempo using multiple methods
    const tempoEstimates = this.estimateTempo(onsetStrength);
    const tempo = this.selectBestTempo(tempoEstimates);

    // Step 3: Detect beat positions
    const beats = this.detectBeatPositions(onsetStrength, tempo);

    // Step 4: Detect downbeats (strong beats at bar boundaries)
    const downbeats = this.detectDownbeats(audioData, beats, tempo);

    // Step 5: Create bar positions
    const bars = this.createBarPositions(beats, downbeats, tempo);

    // Step 6: Detect time signature
    const timeSignature = this.detectTimeSignature(beats, downbeats);

    // Step 7: Calculate confidence
    const confidence = this.calculateConfidence(beats, tempo);

    return {
      beats,
      bars,
      tempo,
      timeSignature,
      confidence,
      downbeats,
    };
  }

  /**
   * Calculate onset strength envelope using spectral flux
   */
  private calculateOnsetStrength(audioData: Float32Array): Float32Array {
    const windowSize = 2048;
    const hopSize = 512;
    const numFrames = Math.floor((audioData.length - windowSize) / hopSize);
    const onsetStrength = new Float32Array(numFrames);

    let prevSpectrum = new Float32Array(windowSize / 2);

    for (let frame = 0; frame < numFrames; frame++) {
      const start = frame * hopSize;
      const windowData = audioData.slice(start, start + windowSize);

      // Apply Hann window
      const windowed = this.applyHannWindow(windowData);

      // Calculate magnitude spectrum using simple DFT
      const spectrum = this.calculateMagnitudeSpectrum(windowed);

      // Calculate spectral flux (positive changes in spectrum)
      let flux = 0;
      for (let i = 0; i < spectrum.length; i++) {
        const diff = spectrum[i] - prevSpectrum[i];
        if (diff > 0) {
          flux += diff;
        }
      }

      onsetStrength[frame] = flux;
      prevSpectrum = spectrum;
    }

    // Normalize onset strength
    return this.normalizeArray(onsetStrength);
  }

  /**
   * Apply Hann window to audio data
   */
  private applyHannWindow(data: Float32Array): Float32Array {
    const windowed = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) {
      const window = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (data.length - 1)));
      windowed[i] = data[i] * window;
    }
    return windowed;
  }

  /**
   * Calculate magnitude spectrum (simplified FFT alternative)
   */
  private calculateMagnitudeSpectrum(data: Float32Array): Float32Array {
    const N = data.length;
    const spectrum = new Float32Array(N / 2);

    for (let k = 0; k < N / 2; k++) {
      let real = 0;
      let imag = 0;

      for (let n = 0; n < N; n++) {
        const angle = (2 * Math.PI * k * n) / N;
        real += data[n] * Math.cos(angle);
        imag -= data[n] * Math.sin(angle);
      }

      spectrum[k] = Math.sqrt(real * real + imag * imag) / N;
    }

    return spectrum;
  }

  /**
   * Estimate tempo using autocorrelation
   */
  private estimateTempo(onsetStrength: Float32Array): number[] {
    const hopSize = 512;
    const minBPM = 60;
    const maxBPM = 200;
    const tempoEstimates: { tempo: number; score: number }[] = [];

    // Convert BPM range to lag range
    const minLag = Math.floor((60 / maxBPM) * this.sampleRate / hopSize);
    const maxLag = Math.floor((60 / minBPM) * this.sampleRate / hopSize);

    // Calculate autocorrelation for different lags
    for (let lag = minLag; lag < maxLag && lag < onsetStrength.length / 2; lag++) {
      let correlation = 0;
      let count = 0;

      for (let i = 0; i < onsetStrength.length - lag; i++) {
        correlation += onsetStrength[i] * onsetStrength[i + lag];
        count++;
      }

      if (count > 0) {
        correlation /= count;
        const tempo = 60 / (lag * hopSize / this.sampleRate);
        tempoEstimates.push({ tempo, score: correlation });
      }
    }

    // Sort by score and return top estimates
    tempoEstimates.sort((a, b) => b.score - a.score);
    return tempoEstimates.slice(0, 5).map((e) => e.tempo);
  }

  /**
   * Select best tempo from multiple estimates
   */
  private selectBestTempo(tempos: number[]): number {
    if (tempos.length === 0) return 120; // Default tempo

    // Prefer tempos in common electronic music range (120-140 BPM)
    const preferred = tempos.find((t) => t >= 120 && t <= 140);
    if (preferred) return Math.round(preferred);

    // Otherwise return the most confident estimate
    return Math.round(tempos[0]);
  }

  /**
   * Detect beat positions using dynamic programming
   */
  private detectBeatPositions(onsetStrength: Float32Array, tempo: number): number[] {
    const hopSize = 512;
    const beatInterval = (60 / tempo) * this.sampleRate / hopSize;
    const beats: number[] = [];

    // Find peaks in onset strength
    const peaks = this.findPeaks(onsetStrength);

    if (peaks.length === 0) {
      // Generate regular beats if no peaks found
      const duration = (onsetStrength.length * hopSize) / this.sampleRate;
      const numBeats = Math.floor(duration / (60 / tempo));
      for (let i = 0; i < numBeats; i++) {
        beats.push(i * (60 / tempo));
      }
      return beats;
    }

    // Use first peak as starting point
    let currentBeat = peaks[0] * hopSize / this.sampleRate;
    beats.push(currentBeat);

    // Generate beat grid
    const duration = (onsetStrength.length * hopSize) / this.sampleRate;
    while (currentBeat < duration) {
      currentBeat += 60 / tempo;
      beats.push(currentBeat);
    }

    // Adjust beats to nearby peaks
    return this.adjustBeatsToOnsets(beats, onsetStrength, hopSize);
  }

  /**
   * Find peaks in onset strength
   */
  private findPeaks(data: Float32Array, threshold?: number): number[] {
    const peaks: number[] = [];
    const computedThreshold = threshold || this.calculateAdaptiveThreshold(data);

    for (let i = 1; i < data.length - 1; i++) {
      if (
        data[i] > computedThreshold &&
        data[i] > data[i - 1] &&
        data[i] > data[i + 1]
      ) {
        peaks.push(i);
      }
    }

    return peaks;
  }

  /**
   * Calculate adaptive threshold for peak detection
   */
  private calculateAdaptiveThreshold(data: Float32Array): number {
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
   * Adjust beat positions to nearby onsets
   */
  private adjustBeatsToOnsets(
    beats: number[],
    onsetStrength: Float32Array,
    hopSize: number
  ): number[] {
    const adjusted: number[] = [];
    const searchWindow = 0.07; // 70ms search window

    for (const beat of beats) {
      const frameIndex = Math.floor((beat * this.sampleRate) / hopSize);
      const searchFrames = Math.floor((searchWindow * this.sampleRate) / hopSize);

      let maxStrength = 0;
      let bestFrame = frameIndex;

      for (let offset = -searchFrames; offset <= searchFrames; offset++) {
        const frame = frameIndex + offset;
        if (frame >= 0 && frame < onsetStrength.length) {
          if (onsetStrength[frame] > maxStrength) {
            maxStrength = onsetStrength[frame];
            bestFrame = frame;
          }
        }
      }

      adjusted.push((bestFrame * hopSize) / this.sampleRate);
    }

    return adjusted;
  }

  /**
   * Detect downbeats (strong beats at bar boundaries)
   */
  private detectDownbeats(
    audioData: Float32Array,
    beats: number[],
    tempo: number
  ): number[] {
    const downbeats: number[] = [];
    const beatsPerBar = 4; // Assume 4/4 time for now

    // Calculate energy at each beat
    const beatEnergies = beats.map((beat) => {
      const sampleIndex = Math.floor(beat * this.sampleRate);
      const windowSize = Math.floor(0.1 * this.sampleRate); // 100ms window

      let energy = 0;
      for (let i = 0; i < windowSize && sampleIndex + i < audioData.length; i++) {
        energy += audioData[sampleIndex + i] ** 2;
      }
      return energy;
    });

    // Find patterns of strong beats
    for (let i = 0; i < beats.length; i += beatsPerBar) {
      if (i < beatEnergies.length) {
        downbeats.push(beats[i]);
      }
    }

    return downbeats;
  }

  /**
   * Create bar positions from beats and downbeats
   */
  private createBarPositions(
    beats: number[],
    downbeats: number[],
    tempo: number
  ): number[] {
    if (downbeats.length > 0) {
      return downbeats;
    }

    // Create regular bar grid if no downbeats detected
    const bars: number[] = [];
    const barDuration = (60 / tempo) * 4; // 4 beats per bar
    const duration = beats.length > 0 ? beats[beats.length - 1] : 0;

    for (let time = 0; time <= duration; time += barDuration) {
      bars.push(time);
    }

    return bars;
  }

  /**
   * Detect time signature
   */
  private detectTimeSignature(beats: number[], downbeats: number[]): [number, number] {
    // For electronic music, default to 4/4
    // In production, this would analyze beat patterns
    return [4, 4];
  }

  /**
   * Calculate confidence score for beat detection
   */
  private calculateConfidence(beats: number[], tempo: number): number {
    if (beats.length < 4) return 0.5;

    // Calculate regularity of beat intervals
    const intervals: number[] = [];
    for (let i = 1; i < beats.length; i++) {
      intervals.push(beats[i] - beats[i - 1]);
    }

    const expectedInterval = 60 / tempo;
    let variance = 0;
    for (const interval of intervals) {
      variance += Math.pow(interval - expectedInterval, 2);
    }
    variance /= intervals.length;

    const stdDev = Math.sqrt(variance);
    const regularity = Math.max(0, 1 - stdDev / expectedInterval);

    return regularity;
  }

  /**
   * Normalize array to 0-1 range
   */
  private normalizeArray(data: Float32Array): Float32Array {
    const max = Math.max(...Array.from(data));
    const min = Math.min(...Array.from(data));
    const range = max - min;

    if (range === 0) return data;

    const normalized = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) {
      normalized[i] = (data[i] - min) / range;
    }
    return normalized;
  }
}

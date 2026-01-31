/**
 * Base class for remix algorithms
 * Provides common functionality for Dubstep and ElectroHouse remixers
 */

import { AudioAnalysisData } from './audio-engine';

export interface RemixOptions {
  intensity: number; // 0-1, how aggressive the remix is
  preserveVocals: boolean; // Try to preserve vocal frequencies
  additionalEffects: boolean; // Enable extra effects
}

export interface RemixProgress {
  stage: string;
  progress: number; // 0-1
  message: string;
}

export type ProgressCallback = (progress: RemixProgress) => void;

export abstract class RemixBase {
  protected audioContext: AudioContext;
  protected originalBuffer: AudioBuffer;
  protected analysisData: AudioAnalysisData;
  protected options: RemixOptions;
  protected progressCallback?: ProgressCallback;

  constructor(
    audioContext: AudioContext,
    originalBuffer: AudioBuffer,
    analysisData: AudioAnalysisData,
    options: RemixOptions,
    progressCallback?: ProgressCallback
  ) {
    this.audioContext = audioContext;
    this.originalBuffer = originalBuffer;
    this.analysisData = analysisData;
    this.options = options;
    this.progressCallback = progressCallback;
  }

  /**
   * Main remix method - to be implemented by subclasses
   */
  abstract remix(): Promise<AudioBuffer>;

  /**
   * Report progress
   */
  protected reportProgress(stage: string, progress: number, message: string): void {
    if (this.progressCallback) {
      this.progressCallback({ stage, progress, message });
    }
  }

  /**
   * Create a new audio buffer with specified length
   */
  protected createBuffer(length: number, numberOfChannels: number = 2): AudioBuffer {
    return this.audioContext.createBuffer(
      numberOfChannels,
      length,
      this.audioContext.sampleRate
    );
  }

  /**
   * Copy audio data from one buffer to another
   */
  protected copyBufferData(
    source: AudioBuffer,
    destination: AudioBuffer,
    sourceOffset: number = 0,
    destOffset: number = 0,
    length?: number
  ): void {
    const copyLength = length || Math.min(
      source.length - sourceOffset,
      destination.length - destOffset
    );

    for (let channel = 0; channel < Math.min(source.numberOfChannels, destination.numberOfChannels); channel++) {
      const sourceData = source.getChannelData(channel);
      const destData = destination.getChannelData(channel);

      for (let i = 0; i < copyLength; i++) {
        if (sourceOffset + i < sourceData.length && destOffset + i < destData.length) {
          destData[destOffset + i] = sourceData[sourceOffset + i];
        }
      }
    }
  }

  /**
   * Apply fade in/out to audio data
   */
  protected applyFade(
    channelData: Float32Array,
    startSample: number,
    fadeLength: number,
    fadeIn: boolean
  ): void {
    for (let i = 0; i < fadeLength && startSample + i < channelData.length; i++) {
      const fadeMultiplier = fadeIn ? i / fadeLength : 1 - i / fadeLength;
      channelData[startSample + i] *= fadeMultiplier;
    }
  }

  /**
   * Apply gain to a section of audio
   */
  protected applyGain(
    channelData: Float32Array,
    startSample: number,
    length: number,
    gain: number
  ): void {
    for (let i = 0; i < length && startSample + i < channelData.length; i++) {
      channelData[startSample + i] *= gain;
    }
  }

  /**
   * Time stretch audio using simple overlap-add method
   */
  protected timeStretch(
    sourceData: Float32Array,
    stretchFactor: number
  ): Float32Array {
    const windowSize = 4096;
    const hopSize = windowSize / 4;
    const outputLength = Math.floor(sourceData.length * stretchFactor);
    const output = new Float32Array(outputLength);

    let inputPos = 0;
    let outputPos = 0;

    while (inputPos + windowSize < sourceData.length && outputPos + windowSize < output.length) {
      // Copy window with overlap
      for (let i = 0; i < windowSize; i++) {
        const window = 0.5 * (1 - Math.cos((2 * Math.PI * i) / windowSize)); // Hann window
        if (outputPos + i < output.length) {
          output[outputPos + i] += sourceData[Math.floor(inputPos) + i] * window;
        }
      }

      inputPos += hopSize / stretchFactor;
      outputPos += hopSize;
    }

    return output;
  }

  /**
   * Pitch shift audio using resampling
   */
  protected pitchShift(
    sourceData: Float32Array,
    semitones: number
  ): Float32Array {
    const ratio = Math.pow(2, semitones / 12);
    const outputLength = Math.floor(sourceData.length / ratio);
    const output = new Float32Array(outputLength);

    for (let i = 0; i < outputLength; i++) {
      const sourceIndex = i * ratio;
      const index1 = Math.floor(sourceIndex);
      const index2 = Math.ceil(sourceIndex);
      const fraction = sourceIndex - index1;

      if (index2 < sourceData.length) {
        output[i] = sourceData[index1] * (1 - fraction) + sourceData[index2] * fraction;
      } else if (index1 < sourceData.length) {
        output[i] = sourceData[index1];
      }
    }

    return output;
  }

  /**
   * Apply low-pass filter
   */
  protected async applyLowPassFilter(
    buffer: AudioBuffer,
    frequency: number
  ): Promise<AudioBuffer> {
    const offlineContext = new OfflineAudioContext(
      buffer.numberOfChannels,
      buffer.length,
      buffer.sampleRate
    );

    const source = offlineContext.createBufferSource();
    source.buffer = buffer;

    const filter = offlineContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = frequency;
    filter.Q.value = 1;

    source.connect(filter);
    filter.connect(offlineContext.destination);

    source.start(0);
    return await offlineContext.startRendering();
  }

  /**
   * Apply high-pass filter
   */
  protected async applyHighPassFilter(
    buffer: AudioBuffer,
    frequency: number
  ): Promise<AudioBuffer> {
    const offlineContext = new OfflineAudioContext(
      buffer.numberOfChannels,
      buffer.length,
      buffer.sampleRate
    );

    const source = offlineContext.createBufferSource();
    source.buffer = buffer;

    const filter = offlineContext.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = frequency;
    filter.Q.value = 1;

    source.connect(filter);
    filter.connect(offlineContext.destination);

    source.start(0);
    return await offlineContext.startRendering();
  }

  /**
   * Apply band-pass filter
   */
  protected async applyBandPassFilter(
    buffer: AudioBuffer,
    frequency: number,
    Q: number = 1
  ): Promise<AudioBuffer> {
    const offlineContext = new OfflineAudioContext(
      buffer.numberOfChannels,
      buffer.length,
      buffer.sampleRate
    );

    const source = offlineContext.createBufferSource();
    source.buffer = buffer;

    const filter = offlineContext.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = Q;

    source.connect(filter);
    filter.connect(offlineContext.destination);

    source.start(0);
    return await offlineContext.startRendering();
  }

  /**
   * Mix two audio buffers together
   */
  protected mixBuffers(
    buffer1: AudioBuffer,
    buffer2: AudioBuffer,
    mix: number = 0.5 // 0 = all buffer1, 1 = all buffer2
  ): AudioBuffer {
    const length = Math.max(buffer1.length, buffer2.length);
    const output = this.createBuffer(length, Math.max(buffer1.numberOfChannels, buffer2.numberOfChannels));

    for (let channel = 0; channel < output.numberOfChannels; channel++) {
      const outputData = output.getChannelData(channel);
      const data1 = channel < buffer1.numberOfChannels ? buffer1.getChannelData(channel) : new Float32Array(length);
      const data2 = channel < buffer2.numberOfChannels ? buffer2.getChannelData(channel) : new Float32Array(length);

      for (let i = 0; i < length; i++) {
        const sample1 = i < data1.length ? data1[i] : 0;
        const sample2 = i < data2.length ? data2[i] : 0;
        outputData[i] = sample1 * (1 - mix) + sample2 * mix;
      }
    }

    return output;
  }

  /**
   * Normalize audio buffer to prevent clipping
   */
  protected normalize(buffer: AudioBuffer): AudioBuffer {
    let maxAmplitude = 0;

    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < data.length; i++) {
        maxAmplitude = Math.max(maxAmplitude, Math.abs(data[i]));
      }
    }

    if (maxAmplitude > 0) {
      const gain = 0.95 / maxAmplitude;
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const data = buffer.getChannelData(channel);
        for (let i = 0; i < data.length; i++) {
          data[i] *= gain;
        }
      }
    }

    return buffer;
  }
}

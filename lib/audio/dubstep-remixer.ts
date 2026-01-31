/**
 * Dubstep Remixer
 * Creates dubstep remixes with wobble bass, bass drops, and half-time drums
 */

import { RemixBase, RemixOptions, ProgressCallback } from './remix-base';
import { AudioAnalysisData } from './audio-engine';
import { SynthGenerator } from './synth-generator';
import { BeatDetector } from './beat-detector';

export class DubstepRemixer extends RemixBase {
  private synthGenerator: SynthGenerator;
  private beatDetector: BeatDetector;

  constructor(
    audioContext: AudioContext,
    originalBuffer: AudioBuffer,
    analysisData: AudioAnalysisData,
    options: RemixOptions,
    progressCallback?: ProgressCallback
  ) {
    super(audioContext, originalBuffer, analysisData, options, progressCallback);
    this.synthGenerator = new SynthGenerator(audioContext);
    this.beatDetector = new BeatDetector(audioContext.sampleRate);
  }

  /**
   * Main dubstep remix algorithm
   */
  async remix(): Promise<AudioBuffer> {
    this.reportProgress('Analyzing', 0.1, 'Analyzing audio structure');

    // Step 1: Extract and process vocals/melody
    const melodicContent = await this.extractMelodicContent();
    this.reportProgress('Processing', 0.2, 'Extracting melodic elements');

    // Step 2: Create dubstep rhythm (half-time)
    const dubstepRhythm = await this.createDubstepRhythm();
    this.reportProgress('Rhythm', 0.4, 'Creating dubstep rhythm');

    // Step 3: Generate wobble bass
    const wobbleBass = await this.generateWobbleBass();
    this.reportProgress('Bass', 0.6, 'Generating wobble bass');

    // Step 4: Add bass drops
    const withDrops = await this.addBassDrops(wobbleBass);
    this.reportProgress('Drops', 0.7, 'Adding bass drops');

    // Step 5: Mix everything together
    const finalMix = await this.mixDubstepElements(melodicContent, dubstepRhythm, withDrops);
    this.reportProgress('Mixing', 0.9, 'Mixing all elements');

    // Step 6: Apply mastering effects
    const mastered = await this.applyMastering(finalMix);
    this.reportProgress('Complete', 1.0, 'Remix complete');

    return mastered;
  }

  /**
   * Extract melodic content (vocals and high-frequency elements)
   */
  private async extractMelodicContent(): Promise<AudioBuffer> {
    if (!this.options.preserveVocals) {
      // Return silent buffer if not preserving vocals
      return this.createBuffer(this.originalBuffer.length);
    }

    // Apply high-pass filter to extract melodic content
    const filtered = await this.applyHighPassFilter(this.originalBuffer, 300);

    // Reduce volume of melodic content to make room for bass
    for (let channel = 0; channel < filtered.numberOfChannels; channel++) {
      const data = filtered.getChannelData(channel);
      for (let i = 0; i < data.length; i++) {
        data[i] *= 0.4; // Reduce to 40%
      }
    }

    return filtered;
  }

  /**
   * Create dubstep rhythm with half-time drums
   */
  private async createDubstepRhythm(): Promise<AudioBuffer> {
    const duration = this.originalBuffer.duration;
    const output = this.createBuffer(
      Math.floor(duration * this.audioContext.sampleRate),
      2
    );

    // Generate drum hits
    const snare = await this.synthGenerator.generateSnare();
    const hiHat = await this.synthGenerator.generateHiHat(0.06, true);
    const kick = await this.synthGenerator.generateBassDropImpact(0.4);

    // Half-time dubstep pattern (effectively half the tempo)
    const originalTempo = this.analysisData.tempo;
    const dubstepTempo = originalTempo / 2;
    const beatInterval = 60 / dubstepTempo;

    let currentTime = 0;
    let beatCount = 0;

    while (currentTime < duration) {
      const beatInBar = beatCount % 4;

      // Kick on beats 1 and 3
      if (beatInBar === 0 || beatInBar === 2) {
        this.mixSampleAtTime(output, kick, currentTime, 0.8);
      }

      // Snare on beats 2 and 4 (with occasional variations)
      if (beatInBar === 1) {
        this.mixSampleAtTime(output, snare, currentTime, 0.6);
      } else if (beatInBar === 3) {
        // Add variation on beat 4
        if (Math.floor(beatCount / 4) % 2 === 1) {
          this.mixSampleAtTime(output, snare, currentTime - beatInterval * 0.25, 0.4);
        }
        this.mixSampleAtTime(output, snare, currentTime, 0.6);
      }

      // Hi-hats on off-beats
      if (this.options.additionalEffects) {
        const offBeatTime = currentTime + beatInterval / 2;
        if (offBeatTime < duration) {
          this.mixSampleAtTime(output, hiHat, offBeatTime, 0.3);
        }
      }

      currentTime += beatInterval;
      beatCount++;
    }

    return output;
  }

  /**
   * Generate wobble bass throughout the track
   */
  private async generateWobbleBass(): Promise<AudioBuffer> {
    const duration = this.originalBuffer.duration;
    const output = this.createBuffer(
      Math.floor(duration * this.audioContext.sampleRate),
      2
    );

    // Determine bass note (typically root note of the key)
    const baseFrequency = this.getBaseFrequency();
    
    // Create sections with different wobble rates
    const sectionDuration = 4; // 4 seconds per section
    let currentTime = 0;
    let sectionIndex = 0;

    while (currentTime < duration) {
      const remainingTime = duration - currentTime;
      const thisSection = Math.min(sectionDuration, remainingTime);

      // Vary wobble rate for interest
      const wobbleRates = [4, 6, 8, 4]; // Different LFO rates
      const wobbleRate = wobbleRates[sectionIndex % wobbleRates.length];

      // Generate wub bass for this section
      const wubBass = await this.synthGenerator.generateWubBass(
        baseFrequency,
        thisSection,
        wobbleRate
      );

      // Mix into output
      this.mixBufferAtTime(output, wubBass, currentTime, this.options.intensity);

      currentTime += thisSection;
      sectionIndex++;
    }

    return output;
  }

  /**
   * Add dramatic bass drops at key moments
   */
  private async addBassDrops(bassBuffer: AudioBuffer): Promise<AudioBuffer> {
    const output = this.createBuffer(bassBuffer.length, bassBuffer.numberOfChannels);

    // Copy existing bass
    this.copyBufferData(bassBuffer, output);

    // Add drops every 8 bars (approximately 16 seconds at 120 BPM half-time)
    const dubstepTempo = this.analysisData.tempo / 2;
    const barDuration = (60 / dubstepTempo) * 4; // 4 beats per bar
    const dropInterval = barDuration * 8; // Every 8 bars

    // Generate drop impact sound
    const dropImpact = await this.synthGenerator.generateBassDropImpact(1.0);

    // Build-up using filtered noise
    const buildUpDuration = barDuration * 2; // 2 bar build-up
    const buildUp = await this.generateBuildUp(buildUpDuration);

    let dropTime = dropInterval;

    while (dropTime < this.originalBuffer.duration) {
      // Add build-up before drop
      const buildUpStart = dropTime - buildUpDuration;
      if (buildUpStart > 0) {
        this.mixBufferAtTime(output, buildUp, buildUpStart, 0.5);

        // Apply filter sweep to existing bass during build-up
        this.applyBuildUpEffect(output, buildUpStart, buildUpDuration);
      }

      // Add the drop impact
      this.mixBufferAtTime(output, dropImpact, dropTime, 1.2);

      // Increase bass intensity after drop for 4 bars
      const postDropDuration = barDuration * 4;
      this.amplifyRegion(output, dropTime, postDropDuration, 1.3);

      dropTime += dropInterval;
    }

    return output;
  }

  /**
   * Generate build-up effect (rising noise)
   */
  private async generateBuildUp(duration: number): Promise<AudioBuffer> {
    const sampleRate = this.audioContext.sampleRate;
    const length = Math.floor(duration * sampleRate);
    const buffer = this.audioContext.createBuffer(2, length, sampleRate);

    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);

      for (let i = 0; i < length; i++) {
        const t = i / length; // 0 to 1

        // White noise
        const noise = Math.random() * 2 - 1;

        // Rising pitch sine wave
        const freq = 100 + t * 400; // 100Hz to 500Hz
        const sine = Math.sin(2 * Math.PI * freq * (i / sampleRate));

        // Increasing volume envelope
        const envelope = Math.pow(t, 0.5);

        data[i] = (noise * 0.7 + sine * 0.3) * envelope * 0.6;
      }
    }

    // Apply high-pass filter
    return await this.applyHighPassFilter(buffer, 1000);
  }

  /**
   * Apply build-up filter effect to a region
   */
  private applyBuildUpEffect(
    buffer: AudioBuffer,
    startTime: number,
    duration: number
  ): void {
    const startSample = Math.floor(startTime * this.audioContext.sampleRate);
    const durationSamples = Math.floor(duration * this.audioContext.sampleRate);

    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);

      for (let i = 0; i < durationSamples; i++) {
        const sampleIndex = startSample + i;
        if (sampleIndex < data.length) {
          // Gradually reduce volume leading to drop
          const progress = i / durationSamples;
          const reduction = 1 - (progress * 0.5); // Fade to 50%
          data[sampleIndex] *= reduction;
        }
      }
    }
  }

  /**
   * Amplify a region of audio
   */
  private amplifyRegion(
    buffer: AudioBuffer,
    startTime: number,
    duration: number,
    gain: number
  ): void {
    const startSample = Math.floor(startTime * this.audioContext.sampleRate);
    const durationSamples = Math.floor(duration * this.audioContext.sampleRate);

    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);

      for (let i = 0; i < durationSamples; i++) {
        const sampleIndex = startSample + i;
        if (sampleIndex < data.length) {
          data[sampleIndex] *= gain;
        }
      }
    }
  }

  /**
   * Mix all dubstep elements together
   */
  private async mixDubstepElements(
    melodic: AudioBuffer,
    rhythm: AudioBuffer,
    bass: AudioBuffer
  ): Promise<AudioBuffer> {
    const maxLength = Math.max(melodic.length, rhythm.length, bass.length);
    const output = this.createBuffer(maxLength, 2);

    // Mix levels (adjusted for dubstep style - bass heavy)
    const melodicGain = this.options.preserveVocals ? 0.4 : 0.2;
    const rhythmGain = 0.5;
    const bassGain = 0.8;

    for (let channel = 0; channel < 2; channel++) {
      const outputData = output.getChannelData(channel);
      const melodicData = channel < melodic.numberOfChannels ? melodic.getChannelData(channel) : new Float32Array(maxLength);
      const rhythmData = channel < rhythm.numberOfChannels ? rhythm.getChannelData(channel) : new Float32Array(maxLength);
      const bassData = channel < bass.numberOfChannels ? bass.getChannelData(channel) : new Float32Array(maxLength);

      for (let i = 0; i < maxLength; i++) {
        const melodicSample = i < melodicData.length ? melodicData[i] * melodicGain : 0;
        const rhythmSample = i < rhythmData.length ? rhythmData[i] * rhythmGain : 0;
        const bassSample = i < bassData.length ? bassData[i] * bassGain : 0;

        outputData[i] = melodicSample + rhythmSample + bassSample;
      }
    }

    return output;
  }

  /**
   * Apply mastering effects (compression, limiting, EQ)
   */
  private async applyMastering(buffer: AudioBuffer): Promise<AudioBuffer> {
    // Normalize
    let mastered = this.normalize(buffer);

    // Apply gentle compression by reducing peaks
    for (let channel = 0; channel < mastered.numberOfChannels; channel++) {
      const data = mastered.getChannelData(channel);
      for (let i = 0; i < data.length; i++) {
        const abs = Math.abs(data[i]);
        if (abs > 0.8) {
          // Soft clipping
          const sign = Math.sign(data[i]);
          data[i] = sign * (0.8 + (abs - 0.8) * 0.3);
        }
      }
    }

    // Final normalization
    return this.normalize(mastered);
  }

  /**
   * Get base frequency for bass from detected key
   */
  private getBaseFrequency(): number {
    const keyToFrequency: { [key: string]: number } = {
      'C': 65.41,
      'C#': 69.30,
      'D': 73.42,
      'D#': 77.78,
      'E': 82.41,
      'F': 87.31,
      'F#': 92.50,
      'G': 98.00,
      'G#': 103.83,
      'A': 110.00,
      'A#': 116.54,
      'B': 123.47,
    };

    const key = this.analysisData.key;
    return keyToFrequency[key] || 73.42; // Default to D
  }

  /**
   * Mix a sample buffer at a specific time
   */
  private mixSampleAtTime(
    targetBuffer: AudioBuffer,
    sample: AudioBuffer,
    time: number,
    gain: number
  ): void {
    const startSample = Math.floor(time * this.audioContext.sampleRate);

    for (let channel = 0; channel < Math.min(targetBuffer.numberOfChannels, sample.numberOfChannels); channel++) {
      const targetData = targetBuffer.getChannelData(channel);
      const sampleData = sample.getChannelData(channel);

      for (let i = 0; i < sampleData.length && startSample + i < targetData.length; i++) {
        targetData[startSample + i] += sampleData[i] * gain;
      }
    }
  }

  /**
   * Mix a buffer at a specific time
   */
  private mixBufferAtTime(
    targetBuffer: AudioBuffer,
    sourceBuffer: AudioBuffer,
    time: number,
    gain: number
  ): void {
    const startSample = Math.floor(time * this.audioContext.sampleRate);

    for (let channel = 0; channel < Math.min(targetBuffer.numberOfChannels, sourceBuffer.numberOfChannels); channel++) {
      const targetData = targetBuffer.getChannelData(channel);
      const sourceData = sourceBuffer.getChannelData(channel);

      for (let i = 0; i < sourceData.length && startSample + i < targetData.length; i++) {
        targetData[startSample + i] += sourceData[i] * gain;
      }
    }
  }
}

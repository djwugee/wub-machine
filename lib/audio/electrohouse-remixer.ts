/**
 * ElectroHouse Remixer
 * Creates electro-house remixes with four-on-the-floor beats, synth stabs, and progressive builds
 */

import { RemixBase, RemixOptions, ProgressCallback } from './remix-base';
import { AudioAnalysisData } from './audio-engine';
import { SynthGenerator } from './synth-generator';
import { BeatDetector } from './beat-detector';

export class ElectroHouseRemixer extends RemixBase {
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
   * Main electro-house remix algorithm
   */
  async remix(): Promise<AudioBuffer> {
    this.reportProgress('Analyzing', 0.1, 'Analyzing audio structure');

    // Step 1: Extract vocals and melodic content
    const melodicContent = await this.extractMelodicContent();
    this.reportProgress('Extracting', 0.2, 'Extracting vocals and melody');

    // Step 2: Create four-on-the-floor rhythm
    const houseRhythm = await this.createFourOnTheFloorRhythm();
    this.reportProgress('Rhythm', 0.35, 'Creating house rhythm');

    // Step 3: Generate bassline
    const bassline = await this.generateHouseBassline();
    this.reportProgress('Bass', 0.5, 'Generating bassline');

    // Step 4: Add synth layers (pads and stabs)
    const synthLayers = await this.generateSynthLayers();
    this.reportProgress('Synths', 0.65, 'Adding synth layers');

    // Step 5: Add progressive elements and builds
    const withBuilds = await this.addProgressiveElements(synthLayers);
    this.reportProgress('Building', 0.8, 'Adding progressive builds');

    // Step 6: Mix everything together
    const finalMix = await this.mixElectroHouseElements(
      melodicContent,
      houseRhythm,
      bassline,
      withBuilds
    );
    this.reportProgress('Mixing', 0.9, 'Mixing all elements');

    // Step 7: Apply mastering
    const mastered = await this.applyMastering(finalMix);
    this.reportProgress('Complete', 1.0, 'Remix complete');

    return mastered;
  }

  /**
   * Extract melodic content with emphasis on vocals
   */
  private async extractMelodicContent(): Promise<AudioBuffer> {
    if (!this.options.preserveVocals) {
      return this.createBuffer(this.originalBuffer.length);
    }

    // Extract mid-high frequencies for vocals and melody
    const filtered = await this.applyBandPassFilter(this.originalBuffer, 1000, 2);

    // Moderate volume reduction to blend with house elements
    for (let channel = 0; channel < filtered.numberOfChannels; channel++) {
      const data = filtered.getChannelData(channel);
      for (let i = 0; i < data.length; i++) {
        data[i] *= 0.6; // 60% volume
      }
    }

    return filtered;
  }

  /**
   * Create classic four-on-the-floor house rhythm
   */
  private async createFourOnTheFloorRhythm(): Promise<AudioBuffer> {
    const duration = this.originalBuffer.duration;
    const output = this.createBuffer(
      Math.floor(duration * this.audioContext.sampleRate),
      2
    );

    // Generate drum sounds
    const kick = await this.synthGenerator.generateHouseKick(0.5);
    const snare = await this.synthGenerator.generateSnare(0.12);
    const hiHatClosed = await this.synthGenerator.generateHiHat(0.06, true);
    const hiHatOpen = await this.synthGenerator.generateHiHat(0.15, false);

    // Use original or boosted tempo
    let houseTempo = this.analysisData.tempo;
    if (houseTempo < 120) {
      houseTempo *= 2; // Double if too slow
    } else if (houseTempo > 135) {
      houseTempo /= 2; // Halve if too fast
    }

    // Ensure tempo is in typical house range (125-130 BPM)
    if (houseTempo < 120) houseTempo = 128;
    if (houseTempo > 135) houseTempo = 128;

    const beatInterval = 60 / houseTempo;
    let currentTime = 0;
    let beatCount = 0;

    while (currentTime < duration) {
      const beatInBar = beatCount % 4;
      const barNumber = Math.floor(beatCount / 4);

      // Four-on-the-floor kick (every beat)
      this.mixSampleAtTime(output, kick, currentTime, 0.9);

      // Claps on beats 2 and 4
      if (beatInBar === 1 || beatInBar === 3) {
        this.mixSampleAtTime(output, snare, currentTime, 0.5);
      }

      // Hi-hat pattern (eighth notes)
      const eighthNotes = 2;
      for (let i = 0; i < eighthNotes; i++) {
        const hiHatTime = currentTime + (beatInterval * i) / eighthNotes;
        
        // Alternate between closed and slightly open hi-hats
        if (i % 2 === 0) {
          this.mixSampleAtTime(output, hiHatClosed, hiHatTime, 0.35);
        } else {
          // Every 4th bar, add open hi-hat for variation
          if (barNumber % 4 === 3 && beatInBar === 3) {
            this.mixSampleAtTime(output, hiHatOpen, hiHatTime, 0.4);
          } else {
            this.mixSampleAtTime(output, hiHatClosed, hiHatTime, 0.25);
          }
        }
      }

      currentTime += beatInterval;
      beatCount++;
    }

    return output;
  }

  /**
   * Generate pumping house bassline
   */
  private async generateHouseBassline(): Promise<AudioBuffer> {
    const duration = this.originalBuffer.duration;
    const output = this.createBuffer(
      Math.floor(duration * this.audioContext.sampleRate),
      2
    );

    // Get base frequency from detected key
    const baseFreq = this.getBaseFrequency();
    
    let houseTempo = this.analysisData.tempo;
    if (houseTempo < 120) houseTempo *= 2;
    if (houseTempo > 135) houseTempo /= 2;
    if (houseTempo < 120) houseTempo = 128;

    const beatInterval = 60 / houseTempo;
    const barDuration = beatInterval * 4;

    // Create bassline pattern
    const bassPattern = this.createBassPattern(baseFreq);

    let currentTime = 0;
    let patternIndex = 0;

    while (currentTime < duration) {
      const noteInfo = bassPattern[patternIndex % bassPattern.length];
      const noteDuration = beatInterval * noteInfo.duration;

      // Generate bass note
      const bassNote = await this.generateBassNote(noteInfo.frequency, noteDuration);

      // Apply sidechain compression effect (pumping)
      this.applySidechainPump(bassNote, beatInterval);

      // Mix into output
      this.mixBufferAtTime(output, bassNote, currentTime, 0.7 * this.options.intensity);

      currentTime += noteDuration;
      patternIndex++;
    }

    return output;
  }

  /**
   * Create bass pattern based on key
   */
  private createBassPattern(rootFreq: number): Array<{ frequency: number; duration: number }> {
    // Simple house bass pattern (root, fifth, octave progression)
    return [
      { frequency: rootFreq, duration: 1 },           // Root
      { frequency: rootFreq, duration: 1 },           // Root
      { frequency: rootFreq * 1.5, duration: 1 },     // Fifth
      { frequency: rootFreq * 2, duration: 1 },       // Octave
    ];
  }

  /**
   * Generate a single bass note
   */
  private async generateBassNote(frequency: number, duration: number): Promise<AudioBuffer> {
    const sampleRate = this.audioContext.sampleRate;
    const length = Math.floor(duration * sampleRate);
    const buffer = this.audioContext.createBuffer(2, length, sampleRate);

    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);

      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;

        // Sawtooth wave for classic house bass
        const phase = (t * frequency) % 1;
        const saw = 2 * phase - 1;

        // Add sine wave for sub-bass
        const sub = Math.sin(2 * Math.PI * frequency * t);

        // Envelope (quick attack, sustained)
        const attack = 0.01;
        let envelope = 1;
        if (t < attack) {
          envelope = t / attack;
        }

        // Mix saw and sub
        data[i] = (saw * 0.5 + sub * 0.5) * envelope;
      }
    }

    // Apply low-pass filter for warmth
    return await this.applyLowPassFilter(buffer, 400);
  }

  /**
   * Apply sidechain compression (pumping effect)
   */
  private applySidechainPump(buffer: AudioBuffer, beatInterval: number): void {
    const pumpDepth = 0.6; // How much to reduce volume
    const pumpSpeed = 0.15; // Duration of pump in seconds

    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      const beatSamples = Math.floor(beatInterval * this.audioContext.sampleRate);
      const pumpSamples = Math.floor(pumpSpeed * this.audioContext.sampleRate);

      let sampleCount = 0;

      while (sampleCount < data.length) {
        // Apply pump envelope at each beat
        for (let i = 0; i < pumpSamples && sampleCount + i < data.length; i++) {
          const pumpProgress = i / pumpSamples;
          const pumpAmount = (1 - pumpDepth) + pumpDepth * pumpProgress;
          data[sampleCount + i] *= pumpAmount;
        }

        sampleCount += beatSamples;
      }
    }
  }

  /**
   * Generate synth layers (pads and stabs)
   */
  private async generateSynthLayers(): Promise<AudioBuffer> {
    const duration = this.originalBuffer.duration;
    const output = this.createBuffer(
      Math.floor(duration * this.audioContext.sampleRate),
      2
    );

    const baseFreq = this.getBaseFrequency();

    let houseTempo = this.analysisData.tempo;
    if (houseTempo < 120) houseTempo *= 2;
    if (houseTempo > 135) houseTempo /= 2;
    if (houseTempo < 120) houseTempo = 128;

    const beatInterval = 60 / houseTempo;
    const barDuration = beatInterval * 4;

    // Add synth pads (long sustained chords)
    await this.addSynthPads(output, baseFreq, barDuration);

    // Add synth stabs (short punchy chords on off-beats)
    if (this.options.additionalEffects) {
      await this.addSynthStabs(output, baseFreq, beatInterval);
    }

    return output;
  }

  /**
   * Add synth pad layers
   */
  private async addSynthPads(
    output: AudioBuffer,
    baseFreq: number,
    barDuration: number
  ): Promise<void> {
    const duration = output.duration;

    // Chord progression (I - V - vi - IV in any key)
    const chordFrequencies = [
      [baseFreq * 2, baseFreq * 2 * 1.25, baseFreq * 2 * 1.5],          // I (root chord)
      [baseFreq * 2 * 1.5, baseFreq * 2 * 1.875, baseFreq * 2 * 2.25],  // V
      [baseFreq * 2 * 1.67, baseFreq * 2 * 2, baseFreq * 2 * 2.5],      // vi
      [baseFreq * 2 * 1.33, baseFreq * 2 * 1.67, baseFreq * 2 * 2],     // IV
    ];

    let currentTime = 0;
    let chordIndex = 0;

    while (currentTime < duration) {
      const chord = chordFrequencies[chordIndex % chordFrequencies.length];
      const remainingTime = duration - currentTime;
      const chordDuration = Math.min(barDuration * 2, remainingTime); // 2 bars per chord

      // Generate each note in the chord
      for (const freq of chord) {
        const pad = await this.synthGenerator.generateSynthPad(freq, chordDuration, 10);
        this.mixBufferAtTime(output, pad, currentTime, 0.2);
      }

      currentTime += chordDuration;
      chordIndex++;
    }
  }

  /**
   * Add synth stab layers (punchy chords)
   */
  private async addSynthStabs(
    output: AudioBuffer,
    baseFreq: number,
    beatInterval: number
  ): Promise<void> {
    const duration = output.duration;

    // Stab chord (major chord)
    const stabFrequencies = [
      baseFreq * 2,
      baseFreq * 2 * 1.25,
      baseFreq * 2 * 1.5,
    ];

    let currentTime = beatInterval; // Start on beat 2

    while (currentTime < duration) {
      // Add stabs on off-beats every 2 bars
      const barPosition = (currentTime / (beatInterval * 4)) % 2;

      if (barPosition < 1) {
        // Generate stab chord
        for (const freq of stabFrequencies) {
          const stab = await this.synthGenerator.generatePluck(freq, 0.3);
          this.mixBufferAtTime(output, stab, currentTime, 0.4);
        }
      }

      currentTime += beatInterval * 2; // Every 2 beats
    }
  }

  /**
   * Add progressive elements and builds
   */
  private async addProgressiveElements(synthLayers: AudioBuffer): Promise<AudioBuffer> {
    const output = this.createBuffer(synthLayers.length, synthLayers.numberOfChannels);
    this.copyBufferData(synthLayers, output);

    let houseTempo = this.analysisData.tempo;
    if (houseTempo < 120) houseTempo *= 2;
    if (houseTempo > 135) houseTempo /= 2;
    if (houseTempo < 120) houseTempo = 128;

    const beatInterval = 60 / houseTempo;
    const barDuration = beatInterval * 4;
    const buildInterval = barDuration * 16; // Build every 16 bars

    // Add builds before drops
    let buildTime = buildInterval - barDuration * 2; // Start 2 bars before

    while (buildTime < this.originalBuffer.duration) {
      const buildDuration = barDuration * 2;
      
      // Generate riser effect
      const riser = await this.generateRiser(buildDuration);
      this.mixBufferAtTime(output, riser, buildTime, 0.5);

      // Apply filter sweep to existing synths
      this.applyFilterSweep(output, buildTime, buildDuration);

      buildTime += buildInterval;
    }

    return output;
  }

  /**
   * Generate riser effect for builds
   */
  private async generateRiser(duration: number): Promise<AudioBuffer> {
    const sampleRate = this.audioContext.sampleRate;
    const length = Math.floor(duration * sampleRate);
    const buffer = this.audioContext.createBuffer(2, length, sampleRate);

    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);

      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const progress = i / length;

        // Rising sawtooth with increasing frequency
        const freq = 100 * Math.pow(4, progress); // 100Hz to 400Hz
        const phase = (t * freq) % 1;
        const saw = 2 * phase - 1;

        // White noise
        const noise = Math.random() * 2 - 1;

        // Increasing envelope
        const envelope = Math.pow(progress, 1.5);

        data[i] = (saw * 0.4 + noise * 0.6) * envelope * 0.4;
      }
    }

    // Apply high-pass filter
    return await this.applyHighPassFilter(buffer, 1500);
  }

  /**
   * Apply filter sweep effect
   */
  private applyFilterSweep(
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
          // Gradually reduce volume and apply filtering effect
          const progress = 1 - (i / durationSamples);
          data[sampleIndex] *= 0.7 + 0.3 * progress;
        }
      }
    }
  }

  /**
   * Mix all electro-house elements
   */
  private async mixElectroHouseElements(
    melodic: AudioBuffer,
    rhythm: AudioBuffer,
    bass: AudioBuffer,
    synths: AudioBuffer
  ): Promise<AudioBuffer> {
    const maxLength = Math.max(melodic.length, rhythm.length, bass.length, synths.length);
    const output = this.createBuffer(maxLength, 2);

    // Mix levels (balanced for electro-house)
    const melodicGain = this.options.preserveVocals ? 0.5 : 0.3;
    const rhythmGain = 0.6;
    const bassGain = 0.7;
    const synthGain = 0.5;

    for (let channel = 0; channel < 2; channel++) {
      const outputData = output.getChannelData(channel);
      const melodicData = channel < melodic.numberOfChannels ? melodic.getChannelData(channel) : new Float32Array(maxLength);
      const rhythmData = channel < rhythm.numberOfChannels ? rhythm.getChannelData(channel) : new Float32Array(maxLength);
      const bassData = channel < bass.numberOfChannels ? bass.getChannelData(channel) : new Float32Array(maxLength);
      const synthData = channel < synths.numberOfChannels ? synths.getChannelData(channel) : new Float32Array(maxLength);

      for (let i = 0; i < maxLength; i++) {
        const melodicSample = i < melodicData.length ? melodicData[i] * melodicGain : 0;
        const rhythmSample = i < rhythmData.length ? rhythmData[i] * rhythmGain : 0;
        const bassSample = i < bassData.length ? bassData[i] * bassGain : 0;
        const synthSample = i < synthData.length ? synthData[i] * synthGain : 0;

        outputData[i] = melodicSample + rhythmSample + bassSample + synthSample;
      }
    }

    return output;
  }

  /**
   * Apply mastering effects
   */
  private async applyMastering(buffer: AudioBuffer): Promise<AudioBuffer> {
    let mastered = this.normalize(buffer);

    // Apply soft clipping for loudness
    for (let channel = 0; channel < mastered.numberOfChannels; channel++) {
      const data = mastered.getChannelData(channel);
      for (let i = 0; i < data.length; i++) {
        const abs = Math.abs(data[i]);
        if (abs > 0.75) {
          const sign = Math.sign(data[i]);
          data[i] = sign * (0.75 + (abs - 0.75) * 0.4);
        }
      }
    }

    return this.normalize(mastered);
  }

  /**
   * Get base frequency from detected key
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

    return keyToFrequency[this.analysisData.key] || 73.42; // Default to D
  }

  /**
   * Mix a sample at a specific time
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

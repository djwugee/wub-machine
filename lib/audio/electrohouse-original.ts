/**
 * ElectroHouse Remixer - Uses original Wub Machine samples
 * Creates electro-house remixes with synth body sounds and splash transitions
 */

import { RemixBase, RemixOptions, ProgressCallback } from './remix-base';
import { AudioAnalysisData } from './audio-engine';
import { BeatDetector } from './beat-detector';
import { ELECTROHOUSE_SAMPLES } from './sample-manifest';
import { SampleLoader } from './sample-loader';

export class ElectroHouseRemixerOriginal extends RemixBase {
  private beatDetector: BeatDetector;
  private sampleLoader: SampleLoader;
  private sampleBuffers: Map<string, AudioBuffer> = new Map();

  constructor(
    audioContext: AudioContext,
    originalBuffer: AudioBuffer,
    analysisData: AudioAnalysisData,
    options: RemixOptions,
    progressCallback?: ProgressCallback
  ) {
    super(audioContext, originalBuffer, analysisData, options, progressCallback);
    this.beatDetector = new BeatDetector(audioContext.sampleRate);
    this.sampleLoader = new SampleLoader(audioContext);
  }

  /**
   * Load all necessary sample buffers
   */
  async loadSamples(): Promise<void> {
    this.reportProgress('Loading', 0.05, 'Loading audio samples');

    const samplePaths = [
      ...Object.values(ELECTROHOUSE_SAMPLES.body as Record<string, string>),
      ...Object.values(ELECTROHOUSE_SAMPLES.splashEnds as Record<string, string>),
      ELECTROHOUSE_SAMPLES.intro16,
    ];

    const buffers = await this.sampleLoader.loadSamples(samplePaths);
    samplePaths.forEach((path, index) => {
      this.sampleBuffers.set(path, buffers[index]);
    });
  }

  /**
   * Main electro-house remix using original samples
   */
  async remix(): Promise<AudioBuffer> {
    await this.loadSamples();
    this.reportProgress('Analyzing', 0.15, 'Analyzing beat structure');

    // Analyze original audio
    const beats = await this.beatDetector.detectBeats(this.originalBuffer);
    const tempo = this.analysisData.tempo || 120;

    // Create output buffer
    const duration = this.originalBuffer.duration;
    const output = this.createBuffer(
      Math.floor(duration * this.audioContext.sampleRate),
      2
    );

    // Plan remix structure
    const sections = this.planRemixSections(duration, beats);
    this.reportProgress('Planning', 0.25, 'Planning remix sections');

    // Render each section
    let currentFrame = 0;
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      const sectionBuffer = await this.renderSection(section, tempo, beats);

      // Mix section into output
      this.mixBuffers(output, sectionBuffer, currentFrame);
      currentFrame += sectionBuffer.length;

      const progress = 0.25 + (i / sections.length) * 0.6;
      this.reportProgress('Rendering', progress, `Rendering section ${i + 1}/${sections.length}`);
    }

    // Apply mastering
    this.reportProgress('Mastering', 0.9, 'Applying mastering effects');
    const mastered = await this.applyMastering(output);

    this.reportProgress('Complete', 1.0, 'Remix complete');
    return mastered;
  }

  /**
   * Plan remix sections
   */
  private planRemixSections(
    duration: number,
    beats: number[]
  ): Array<{ type: string; startTime: number; endTime: number; bars: number }> {
    const sections = [];
    const tempo = this.analysisData.tempo || 120;
    const beatDuration = 60 / tempo;
    const barDuration = beatDuration * 4;

    let currentTime = 0;

    // Intro - 16 bars
    if (currentTime < duration) {
      sections.push({
        type: 'intro',
        startTime: currentTime,
        endTime: Math.min(currentTime + barDuration * 16, duration),
        bars: 16,
      });
      currentTime += barDuration * 16;
    }

    // Verses - alternate between synth and vocal sections
    while (currentTime < duration) {
      // Synth verse - 8 bars
      sections.push({
        type: 'synth-verse',
        startTime: currentTime,
        endTime: Math.min(currentTime + barDuration * 8, duration),
        bars: 8,
      });
      currentTime += barDuration * 8;

      if (currentTime >= duration) break;

      // Build - 8 bars
      sections.push({
        type: 'build',
        startTime: currentTime,
        endTime: Math.min(currentTime + barDuration * 8, duration),
        bars: 8,
      });
      currentTime += barDuration * 8;

      if (currentTime >= duration) break;

      // Chorus - 16 bars
      sections.push({
        type: 'chorus',
        startTime: currentTime,
        endTime: Math.min(currentTime + barDuration * 16, duration),
        bars: 16,
      });
      currentTime += barDuration * 16;
    }

    return sections.filter(s => s.startTime < duration);
  }

  /**
   * Render a remix section
   */
  private async renderSection(
    section: any,
    tempo: number,
    beats: number[]
  ): Promise<AudioBuffer> {
    const sectionDuration = section.endTime - section.startTime;
    const output = this.createBuffer(
      Math.floor(sectionDuration * this.audioContext.sampleRate),
      2
    );

    const sectionBeats = beats.filter(
      b => b >= section.startTime && b < section.endTime
    );

    switch (section.type) {
      case 'intro':
        await this.renderIntro(output, tempo, sectionBeats, section.startTime);
        break;
      case 'synth-verse':
        await this.renderSynthVerse(output, tempo, sectionBeats, section.startTime);
        break;
      case 'build':
        await this.renderBuild(output, tempo, sectionBeats, section.startTime);
        break;
      case 'chorus':
        await this.renderChorus(output, tempo, sectionBeats, section.startTime);
        break;
    }

    return output;
  }

  /**
   * Render intro section
   */
  private async renderIntro(
    output: AudioBuffer,
    tempo: number,
    beats: number[],
    sectionStart: number
  ): Promise<void> {
    const introBuffer = this.sampleBuffers.get(ELECTROHOUSE_SAMPLES.intro16);
    if (introBuffer) {
      this.mixBuffers(output, introBuffer, 0, 0.8);
    }

    // Add sparse synth hits
    await this.renderSynthHits(output, tempo, beats, sectionStart, 4);
  }

  /**
   * Render synth verse
   */
  private async renderSynthVerse(
    output: AudioBuffer,
    tempo: number,
    beats: number[],
    sectionStart: number
  ): Promise<void> {
    // Render steady synth body notes
    await this.renderSynthBody(output, tempo, beats, sectionStart);

    // Add occasional splash transitions
    if (Math.random() > 0.5) {
      const splashEnd = Object.values(ELECTROHOUSE_SAMPLES.splashEnds as Record<string, string>)[
        Math.floor(Math.random() * 4)
      ];
      const splashBuffer = this.sampleBuffers.get(splashEnd);
      if (splashBuffer && beats.length > 0) {
        const lastBeatFrame = Math.floor((beats[beats.length - 1] - sectionStart) * this.audioContext.sampleRate);
        this.mixBuffers(output, splashBuffer, Math.max(0, lastBeatFrame - splashBuffer.length), 0.6);
      }
    }
  }

  /**
   * Render build section with rising energy
   */
  private async renderBuild(
    output: AudioBuffer,
    tempo: number,
    beats: number[],
    sectionStart: number
  ): Promise<void> {
    const beatDuration = (60 / tempo) * this.audioContext.sampleRate;
    const bodyNotes = Object.values(ELECTROHOUSE_SAMPLES.body as Record<string, string>);

    // Accelerating pattern
    let interval = 8; // Every 8 beats
    for (let i = 0; i < beats.length; i += interval) {
      const beat = beats[i];
      const beatFrame = Math.floor((beat - sectionStart) * this.audioContext.sampleRate);

      if (beatFrame >= 0 && beatFrame < output.length) {
        const bodyIndex = (i / interval) % bodyNotes.length;
        const bodyPath = bodyNotes[Math.floor(bodyIndex)];
        const bodyBuffer = this.sampleBuffers.get(bodyPath);

        if (bodyBuffer) {
          this.mixBuffers(output, bodyBuffer, beatFrame, 0.7);
        }
      }

      // Accelerate pattern (reduce interval over time)
      interval = Math.max(1, interval - 1);
    }
  }

  /**
   * Render chorus - full energy electro-house
   */
  private async renderChorus(
    output: AudioBuffer,
    tempo: number,
    beats: number[],
    sectionStart: number
  ): Promise<void> {
    // Dense synth body pattern
    await this.renderSynthBody(output, tempo, beats, sectionStart, 0.8);

    // Add splash transitions at bar boundaries
    const beatDuration = 60 / tempo;
    const barDuration = beatDuration * 4;

    for (const beat of beats) {
      const beatInBar = ((beat - sectionStart) / beatDuration) % 4;
      if (Math.abs(beatInBar) < 0.1) {
        // At bar start
        const splashEnds = Object.values(ELECTROHOUSE_SAMPLES.splashEnds as Record<string, string>);
        const splashPath = splashEnds[Math.floor(Math.random() * splashEnds.length)];
        const splashBuffer = this.sampleBuffers.get(splashPath);

        if (splashBuffer) {
          const beatFrame = Math.floor((beat - sectionStart) * this.audioContext.sampleRate);
          this.mixBuffers(output, splashBuffer, beatFrame, 0.7);
        }
      }
    }
  }

  /**
   * Render synth body pattern
   */
  private async renderSynthBody(
    output: AudioBuffer,
    tempo: number,
    beats: number[],
    sectionStart: number,
    volume: number = 0.6
  ): Promise<void> {
    const bodyNotes = Object.values(ELECTROHOUSE_SAMPLES.body as Record<string, string>);
    let noteIndex = 0;

    for (const beat of beats) {
      const beatFrame = Math.floor((beat - sectionStart) * this.audioContext.sampleRate);

      if (beatFrame >= 0 && beatFrame < output.length) {
        const bodyPath = bodyNotes[noteIndex % bodyNotes.length];
        const bodyBuffer = this.sampleBuffers.get(bodyPath);

        if (bodyBuffer) {
          this.mixBuffers(output, bodyBuffer, beatFrame, volume);
          noteIndex++;
        }
      }
    }
  }

  /**
   * Render sparse synth hits
   */
  private async renderSynthHits(
    output: AudioBuffer,
    tempo: number,
    beats: number[],
    sectionStart: number,
    beatInterval: number
  ): Promise<void> {
    const bodyNotes = Object.values(ELECTROHOUSE_SAMPLES.body as Record<string, string>);

    for (let i = 0; i < beats.length; i += beatInterval) {
      const beat = beats[i];
      const beatFrame = Math.floor((beat - sectionStart) * this.audioContext.sampleRate);

      if (beatFrame >= 0 && beatFrame < output.length) {
        const bodyIndex = (i / beatInterval) % bodyNotes.length;
        const bodyPath = bodyNotes[Math.floor(bodyIndex)];
        const bodyBuffer = this.sampleBuffers.get(bodyPath);

        if (bodyBuffer) {
          this.mixBuffers(output, bodyBuffer, beatFrame, 0.5);
        }
      }
    }
  }

  /**
   * Mix audio buffer
   */
  private mixBuffers(
    output: AudioBuffer,
    source: AudioBuffer,
    frameOffset: number,
    volume: number = 1.0
  ): void {
    const channels = Math.min(output.numberOfChannels, source.numberOfChannels);

    for (let ch = 0; ch < channels; ch++) {
      const outData = output.getChannelData(ch);
      const srcData = source.getChannelData(ch);

      for (let i = 0; i < srcData.length; i++) {
        const outIndex = frameOffset + i;
        if (outIndex < outData.length) {
          outData[outIndex] += srcData[i] * volume;
        }
      }
    }
  }

  /**
   * Apply mastering effects
   */
  private async applyMastering(buffer: AudioBuffer): Promise<AudioBuffer> {
    const output = this.createBuffer(buffer.length, buffer.numberOfChannels);
    const maxAmplitude = this.findMaxAmplitude(buffer);
    const scaleFactor = maxAmplitude > 0 ? 0.95 / maxAmplitude : 1.0;

    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const inData = buffer.getChannelData(ch);
      const outData = output.getChannelData(ch);

      for (let i = 0; i < inData.length; i++) {
        const sample = inData[i] * scaleFactor;
        outData[i] = Math.tanh(sample);
      }
    }

    return output;
  }

  /**
   * Find maximum amplitude
   */
  private findMaxAmplitude(buffer: AudioBuffer): number {
    let max = 0;
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        max = Math.max(max, Math.abs(data[i]));
      }
    }
    return max;
  }
}

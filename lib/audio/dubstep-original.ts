/**
 * Dubstep Remixer - Uses original Wub Machine samples
 * Implements actual dubstep remixing with sample playback from project assets
 */

import { RemixBase, RemixOptions, ProgressCallback } from './remix-base';
import { AudioAnalysisData } from './audio-engine';
import { BeatDetector } from './beat-detector';
import { DUBSTEP_SAMPLES, getChromaticNote, getRandomSplash } from './sample-manifest';
import { SampleLoader } from './sample-loader';

export class DubstepRemixerOriginal extends RemixBase {
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
      ...Object.values(DUBSTEP_SAMPLES.wubs as Record<string, string>),
      ...Object.values(DUBSTEP_SAMPLES.breakEnds as Record<string, string>),
      ...Object.values(DUBSTEP_SAMPLES.splashes as Record<string, string>),
      ...Object.values(DUBSTEP_SAMPLES.splashEnds as Record<string, string>),
      DUBSTEP_SAMPLES.hats,
      DUBSTEP_SAMPLES.introEight,
    ];

    const buffers = await this.sampleLoader.loadSamples(samplePaths);
    samplePaths.forEach((path, index) => {
      this.sampleBuffers.set(path, buffers[index]);
    });
  }

  /**
   * Main dubstep remix using original samples
   */
  async remix(): Promise<AudioBuffer> {
    await this.loadSamples();
    this.reportProgress('Analyzing', 0.15, 'Analyzing beat structure');

    // Analyze original audio for beat information
    const beats = await this.beatDetector.detectBeats(this.originalBuffer);
    const tempo = this.analysisData.tempo || 120;

    // Create output buffer
    const duration = this.originalBuffer.duration;
    const output = this.createBuffer(
      Math.floor(duration * this.audioContext.sampleRate),
      2
    );

    // Build dubstep remix structure
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
   * Plan remix sections (intro, build, drop, etc.)
   */
  private planRemixSections(
    duration: number,
    beats: number[]
  ): Array<{ type: string; startTime: number; endTime: number; beats: number[] }> {
    const sections = [];
    const beatDuration = 60 / (this.analysisData.tempo || 120) / 4; // Quarter note

    // Intro - 16 bars
    sections.push({
      type: 'intro',
      startTime: 0,
      endTime: beatDuration * 64,
      beats: beats.filter(b => b < beatDuration * 64),
    });

    // Build - 16 bars
    const buildStart = beatDuration * 64;
    sections.push({
      type: 'build',
      startTime: buildStart,
      endTime: buildStart + beatDuration * 64,
      beats: beats.filter(b => b >= buildStart && b < buildStart + beatDuration * 64),
    });

    // Drop - 32 bars
    const dropStart = buildStart + beatDuration * 64;
    sections.push({
      type: 'drop',
      startTime: dropStart,
      endTime: Math.min(dropStart + beatDuration * 128, duration),
      beats: beats.filter(b => b >= dropStart && b < Math.min(dropStart + beatDuration * 128, duration)),
    });

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

    let currentFrame = 0;

    switch (section.type) {
      case 'intro':
        // Play intro sample if available
        const introBuffer = this.sampleBuffers.get(DUBSTEP_SAMPLES.introEight);
        if (introBuffer) {
          const source = this.audioContext.createBufferSource();
          source.buffer = introBuffer;
          const offlineContext = new OfflineAudioContext(2, output.length, this.audioContext.sampleRate);
          source.connect(offlineContext.destination);
          source.start(0);
          // Mix intro into output
        }
        break;

      case 'build':
        // Gradually build energy with drum patterns and bass
        currentFrame = await this.renderDrumPattern(output, 0, section.beats, tempo);
        currentFrame = await this.renderBassLine(output, currentFrame, section.beats, tempo);
        break;

      case 'drop':
        // Heavy dubstep drop with wobble bass and wubs
        currentFrame = await this.renderWubBass(output, 0, section.beats, tempo);
        currentFrame = await this.renderDrumPattern(output, currentFrame, section.beats, tempo);
        break;
    }

    return output;
  }

  /**
   * Render wub bass using chromatic wub samples
   */
  private async renderWubBass(
    output: AudioBuffer,
    startFrame: number,
    beats: number[],
    tempo: number
  ): Promise<number> {
    const beatDuration = (60 / tempo) * this.audioContext.sampleRate;
    let currentFrame = startFrame;

    // Generate wub pattern - play chromatically
    const wubNotes = Object.values(DUBSTEP_SAMPLES.wubs as Record<string, string>);
    const beatsPerWub = 4; // One wub per 4 beats

    for (let i = 0; i < beats.length; i += beatsPerWub) {
      const beatFrame = Math.floor(beats[i] * this.audioContext.sampleRate);
      
      if (beatFrame >= startFrame && beatFrame < output.length) {
        // Get wub sample for this beat
        const wubIndex = (i / beatsPerWub) % wubNotes.length;
        const wubPath = wubNotes[Math.floor(wubIndex)];
        const wubBuffer = this.sampleBuffers.get(wubPath);

        if (wubBuffer) {
          this.mixBuffers(output, wubBuffer, beatFrame);
          currentFrame = beatFrame + wubBuffer.length;
        }
      }
    }

    return currentFrame;
  }

  /**
   * Render drum pattern using samples and synth
   */
  private async renderDrumPattern(
    output: AudioBuffer,
    startFrame: number,
    beats: number[],
    tempo: number
  ): Promise<number> {
    let currentFrame = startFrame;

    // Get drum samples
    const hatsBuffer = this.sampleBuffers.get(DUBSTEP_SAMPLES.hats);
    const splashBuffer = this.sampleBuffers.get(
      getRandomSplash(DUBSTEP_SAMPLES.splashes as Record<string, string>)
    );

    // Create drum pattern
    for (const beat of beats) {
      const beatFrame = Math.floor(beat * this.audioContext.sampleRate);
      
      if (beatFrame >= startFrame && beatFrame < output.length) {
        // Kick on beat 0 and 2
        const beatInBar = (beat * (tempo / 60)) % 4;
        if (Math.floor(beatInBar) % 2 === 0 && hatsBuffer) {
          this.mixBuffers(output, hatsBuffer, beatFrame);
          currentFrame = Math.max(currentFrame, beatFrame + hatsBuffer.length);
        }
      }
    }

    return currentFrame;
  }

  /**
   * Render bass line
   */
  private async renderBassLine(
    output: AudioBuffer,
    startFrame: number,
    beats: number[],
    tempo: number
  ): Promise<number> {
    let currentFrame = startFrame;
    const wubNotes = Object.values(DUBSTEP_SAMPLES.wubs as Record<string, string>);

    for (let i = 0; i < beats.length; i += 2) {
      const beat = beats[i];
      const beatFrame = Math.floor(beat * this.audioContext.sampleRate);

      if (beatFrame >= startFrame && beatFrame < output.length) {
        // Cycle through wub notes
        const wubIndex = (i / 2) % wubNotes.length;
        const wubPath = wubNotes[Math.floor(wubIndex)];
        const wubBuffer = this.sampleBuffers.get(wubPath);

        if (wubBuffer) {
          this.mixBuffers(output, wubBuffer, beatFrame, 0.6);
          currentFrame = Math.max(currentFrame, beatFrame + wubBuffer.length);
        }
      }
    }

    return currentFrame;
  }

  /**
   * Mix audio buffer into output at a specific frame
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

    // Apply soft clipping and normalization
    const maxAmplitude = this.findMaxAmplitude(buffer);
    const scaleFactor = maxAmplitude > 0 ? 0.95 / maxAmplitude : 1.0;

    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const inData = buffer.getChannelData(ch);
      const outData = output.getChannelData(ch);

      for (let i = 0; i < inData.length; i++) {
        const sample = inData[i] * scaleFactor;
        // Soft clipping
        outData[i] = Math.tanh(sample);
      }
    }

    return output;
  }

  /**
   * Find maximum amplitude in buffer
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

/**
 * remixer-dubstep-ported.ts
 * 
 * Direct port of the original Python Dubstep remixer to TypeScript for Next.js
 * Maintains the original remix algorithm structure and logic
 * 
 * Original by Peter Sobot <hi@petersobot.com>
 * Port for Next.js/Web Audio API by v0
 */

import { AudioEngine } from './audio-engine';
import { BeatDetector } from './beat-detector';
import type { AudioAnalysisData } from './audio-engine';

export interface RemixProgress {
  status: number; // -1 = error, 0 = waiting, 1 = processing
  text: string;
  progress: number; // 0-1
  uid?: string;
}

export interface DubstepTemplate {
  tempo: number;
  intro: string;
  hats: string;
  wubs: string[];
  wub_breaks: string[];
  splashes: string[];
  splash_ends: string[];
  mixpoint: number;
  target: 'beats' | 'bars' | 'tatums';
}

export class DubstepRemixerPorted {
  private audioContext: AudioContext;
  private originalBuffer: AudioBuffer;
  private analysis: AudioAnalysisData;
  private progressCallback: (progress: RemixProgress) => void;
  
  private template: DubstepTemplate = {
    tempo: 140,
    intro: '/samples/dubstep/intro-eight.wav',
    hats: '/samples/dubstep/hats.wav',
    wubs: [
      '/samples/dubstep/wubs/c.wav',
      '/samples/dubstep/wubs/c-sharp.wav',
      '/samples/dubstep/wubs/d.wav',
      '/samples/dubstep/wubs/d-sharp.wav',
      '/samples/dubstep/wubs/e.wav',
      '/samples/dubstep/wubs/f.wav',
      '/samples/dubstep/wubs/f-sharp.wav',
      '/samples/dubstep/wubs/g.wav',
      '/samples/dubstep/wubs/g-sharp.wav',
      '/samples/dubstep/wubs/a.wav',
      '/samples/dubstep/wubs/a-sharp.wav',
      '/samples/dubstep/wubs/b.wav',
    ],
    wub_breaks: [
      '/samples/dubstep/break-ends/c.wav',
      '/samples/dubstep/break-ends/c-sharp.wav',
      '/samples/dubstep/break-ends/d.wav',
      '/samples/dubstep/break-ends/d-sharp.wav',
      '/samples/dubstep/break-ends/e.wav',
      '/samples/dubstep/break-ends/f.wav',
      '/samples/dubstep/break-ends/f-sharp.wav',
      '/samples/dubstep/break-ends/g.wav',
      '/samples/dubstep/break-ends/g-sharp.wav',
      '/samples/dubstep/break-ends/a.wav',
      '/samples/dubstep/break-ends/a-sharp.wav',
      '/samples/dubstep/break-ends/b.wav',
    ],
    splashes: [
      '/samples/dubstep/splashes/splash_03.wav',
      '/samples/dubstep/splashes/splash_04.wav',
      '/samples/dubstep/splashes/splash_02.wav',
      '/samples/dubstep/splashes/splash_01.wav',
      '/samples/dubstep/splashes/splash_05.wav',
      '/samples/dubstep/splashes/splash_07.wav',
      '/samples/dubstep/splashes/splash_06.wav',
      '/samples/dubstep/splashes/splash_08.wav',
      '/samples/dubstep/splashes/splash_10.wav',
      '/samples/dubstep/splashes/splash_09.wav',
      '/samples/dubstep/splashes/splash_11.wav',
    ],
    splash_ends: [
      '/samples/dubstep/splash-ends/1.wav',
      '/samples/dubstep/splash-ends/2.wav',
      '/samples/dubstep/splash-ends/3.wav',
      '/samples/dubstep/splash-ends/4.wav',
    ],
    mixpoint: 18,
    target: 'beats',
  };

  private tonic: number = 0;
  private tempo: number = 140;
  private progress: number = 0;
  private sampleCache: Map<string, AudioBuffer> = new Map();

  constructor(
    audioContext: AudioContext,
    originalBuffer: AudioBuffer,
    analysis: AudioAnalysisData,
    progressCallback: (progress: RemixProgress) => void = () => {}
  ) {
    this.audioContext = audioContext;
    this.originalBuffer = originalBuffer;
    this.analysis = analysis;
    this.progressCallback = progressCallback;
    this.tonic = analysis.key || 0;
    this.tempo = analysis.tempo || 140;
  }

  private log(text: string, progressIncrement: number): void {
    if (progressIncrement > 1) {
      progressIncrement *= 0.01;
    }
    this.progress += progressIncrement;
    this.progressCallback({
      status: 1,
      text,
      progress: Math.min(1, this.progress),
    });
  }

  private async loadSample(url: string): Promise<AudioBuffer> {
    if (this.sampleCache.has(url)) {
      return this.sampleCache.get(url)!;
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      this.sampleCache.set(url, audioBuffer);
      return audioBuffer;
    } catch (error) {
      throw new Error(`Failed to load sample ${url}: ${error}`);
    }
  }

  /**
   * Port of searchSamples from original Python code
   * Find all samples (beats) of a given key in a given section
   */
  private searchSamples(sectionIndex: number, key: number): number[] {
    let beatIndices: number[] = [];
    
    // Try to find beats matching the key
    beatIndices = this.getSamples(sectionIndex, key);
    
    // If no samples found, try fifths up the scale
    for (let tries = 0; tries < 5 && beatIndices.length === 0; tries++) {
      key = (key + 7) % 12;
      beatIndices = this.getSamples(sectionIndex, key);
    }
    
    // If still no samples, try other sections
    if (beatIndices.length === 0) {
      for (let tries = 0; tries < 5; tries++) {
        sectionIndex = (sectionIndex + 1) % Math.max(1, this.analysis.sections.length);
        key = (key + 2) % 12;
        beatIndices = this.getSamples(sectionIndex, key);
        if (beatIndices.length > 0) break;
      }
    }
    
    return beatIndices;
  }

  /**
   * Port of getSamples from original Python code
   * Finds all beats/bars in a given section, of a given pitch
   */
  private getSamples(sectionIndex: number, pitch: number): number[] {
    const section = this.analysis.sections[sectionIndex] || { start: 0, duration: this.originalBuffer.duration };
    const sectionStart = section.start;
    const sectionEnd = section.start + section.duration;
    
    // Find beats that fall within this section and match the pitch
    const matchingBeats: number[] = [];
    
    this.analysis.beats.forEach((beat, index) => {
      if (beat >= sectionStart && beat < sectionEnd) {
        // Check if any segments at this beat match the pitch
        const pitchMatches = this.analysis.pitches.some(p => 
          Math.abs(p.time - beat) < 0.1 && p.pitch === pitch && p.confidence > 0.5
        );
        
        if (pitchMatches || matchingBeats.length === 0) {
          matchingBeats.push(index);
        }
      }
    });
    
    return matchingBeats;
  }

  /**
   * Port of mixfactor from original Python code
   * Computes the balance between wubs and original audio
   */
  private mixfactor(beatIndex: number): number {
    const a = (89.0 / 1.5) + this.template.mixpoint;
    const b = (188.0 / 1.5) + this.template.mixpoint;
    
    // Get loudness at this beat
    const beat = this.analysis.beats[beatIndex];
    let loud = -60; // default loudness
    
    // Find segment at this beat
    for (const segment of this.analysis.segments || []) {
      if (Math.abs(segment.time - beat) < 0.1) {
        loud = segment.loudness || -60;
        break;
      }
    }
    
    let mixfactor = 0;
    if (loud !== -1 * b) {
      mixfactor = (loud + a) / (loud + b);
    }
    
    return Math.max(0.3, Math.min(0.8, mixfactor));
  }

  /**
   * Port of compileIntro from original Python code
   * Compiles the dubstep introduction (8 bars)
   */
  private async compileIntro(): Promise<AudioBuffer> {
    this.log('Arranging intro...', 0);
    
    const intro = await this.loadSample(this.template.intro);
    
    // Build the intro pattern from the original
    const introParts: AudioBuffer[] = [];
    
    // First 4 bars of song
    const firstFourBars = this.extractAudioSegment(0, Math.min(16, this.analysis.beats.length));
    introParts.push(await this.timeStretch(firstFourBars, this.template.tempo / this.tempo));
    
    // Mix intro sample with stretched audio
    return this.mixBuffers(intro, introParts[0], 0.5);
  }

  /**
   * Port of compileSection from original Python code
   * Compiles one section of dubstep
   */
  private async compileSection(sectionIndex: number): Promise<AudioBuffer[]> {
    this.log(`Arranging section ${sectionIndex + 1}...`, 0);
    
    const hats = await this.loadSample(this.template.hats);
    
    // Get samples for three keys: tonic, minor 3rd, minor 7th
    const s1 = this.searchSamples(sectionIndex, this.tonic);
    const s2 = this.searchSamples(sectionIndex, (this.tonic + 3) % 12);
    const s3 = this.searchSamples(sectionIndex, (this.tonic + 9) % 12);
    
    // Ensure we have samples
    const biggest = [s1, s2, s3].reduce((a, b) => a.length > b.length ? a : b, []);
    
    if (biggest.length === 0) {
      throw new Error(`Missing samples in section ${sectionIndex + 1}`);
    }
    
    // Build the dubstep pattern
    const pattern: number[] = [];
    
    // Pattern: 8 beats tonic, 2 beats m3, 2 beats m7, repeat
    for (let k = 0; k < 2; k++) {
      for (let i = 0; i < 8; i++) {
        pattern.push((s1[i % s1.length] || biggest[i % biggest.length]));
      }
      for (let i = 0; i < 4; i++) {
        pattern.push((s2[i % s2.length] || biggest[i % biggest.length]));
      }
      for (let i = 0; i < 4; i++) {
        pattern.push((s3[i % s3.length] || biggest[i % biggest.length]));
      }
    }
    
    // Extract and time-stretch the pattern
    const origBar = this.extractAudioFromBeats(pattern);
    const stretched = await this.timeStretch(origBar, this.template.tempo / this.tempo);
    
    // Load wub and splash samples
    const wub = await this.loadSample(this.template.wubs[this.tonic]);
    const splash = await this.loadSample(this.template.splashes[(sectionIndex + 1) % this.template.splashes.length]);
    const wubBreak = await this.loadSample(this.template.wub_breaks[this.tonic]);
    
    // Create two variations
    const mixFactor = this.mixfactor(pattern[0]);
    
    // Version A: wub + splash mixed with original
    const wubSplashMix = this.mixBuffers(wub, splash, 0.5);
    const versionA = this.mixBuffers(wubSplashMix, stretched, mixFactor);
    
    // Version B: wub break + hats mixed with original
    const wubHatsMix = this.mixBuffers(wubBreak, hats, 0.5);
    const versionB = this.mixBuffers(wubHatsMix, stretched, mixFactor);
    
    return [versionA, versionB];
  }

  /**
   * Extract audio segment between beat indices
   */
  private extractAudioSegment(startBeatIndex: number, endBeatIndex: number): AudioBuffer {
    const start = this.analysis.beats[startBeatIndex] || 0;
    const end = this.analysis.beats[endBeatIndex] || this.originalBuffer.duration;
    
    const startFrame = Math.floor(start * this.originalBuffer.sampleRate);
    const endFrame = Math.floor(end * this.originalBuffer.sampleRate);
    const length = endFrame - startFrame;
    
    const buffer = this.audioContext.createBuffer(
      this.originalBuffer.numberOfChannels,
      length,
      this.originalBuffer.sampleRate
    );
    
    for (let channel = 0; channel < this.originalBuffer.numberOfChannels; channel++) {
      const sourceData = this.originalBuffer.getChannelData(channel);
      const destData = buffer.getChannelData(channel);
      destData.set(sourceData.subarray(startFrame, endFrame));
    }
    
    return buffer;
  }

  /**
   * Extract audio from an array of beat indices
   */
  private extractAudioFromBeats(beatIndices: number[]): AudioBuffer {
    const segments: Float32Array[] = [];
    let totalLength = 0;
    
    for (let i = 0; i < beatIndices.length; i++) {
      const beatIndex = beatIndices[i];
      const nextBeatIndex = i < beatIndices.length - 1 ? beatIndices[i + 1] : beatIndex;
      
      const start = this.analysis.beats[beatIndex] || 0;
      const end = this.analysis.beats[nextBeatIndex] || start + 0.4;
      
      const startFrame = Math.floor(start * this.originalBuffer.sampleRate);
      const endFrame = Math.floor(end * this.originalBuffer.sampleRate);
      const length = endFrame - startFrame;
      
      const segment = this.originalBuffer.getChannelData(0).subarray(startFrame, endFrame);
      segments.push(new Float32Array(segment));
      totalLength += length;
    }
    
    // Concatenate segments
    const buffer = this.audioContext.createBuffer(
      this.originalBuffer.numberOfChannels,
      totalLength,
      this.originalBuffer.sampleRate
    );
    
    let offset = 0;
    for (const segment of segments) {
      for (let channel = 0; channel < this.originalBuffer.numberOfChannels; channel++) {
        buffer.getChannelData(channel).set(segment, offset);
      }
      offset += segment.length;
    }
    
    return buffer;
  }

  /**
   * Simple time stretching using playback rate simulation
   */
  private async timeStretch(buffer: AudioBuffer, ratio: number): Promise<AudioBuffer> {
    const newLength = Math.floor(buffer.length / ratio);
    const stretched = this.audioContext.createBuffer(
      buffer.numberOfChannels,
      newLength,
      buffer.sampleRate
    );
    
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const sourceData = buffer.getChannelData(channel);
      const destData = stretched.getChannelData(channel);
      
      for (let i = 0; i < newLength; i++) {
        const sourceIndex = i * ratio;
        const index = Math.floor(sourceIndex);
        const frac = sourceIndex - index;
        
        if (index + 1 < buffer.length) {
          destData[i] = sourceData[index] * (1 - frac) + sourceData[index + 1] * frac;
        } else {
          destData[i] = sourceData[index] || 0;
        }
      }
    }
    
    return stretched;
  }

  /**
   * Mix two audio buffers with a given ratio
   */
  private mixBuffers(bufferA: AudioBuffer, bufferB: AudioBuffer, mixRatio: number): AudioBuffer {
    const maxLength = Math.min(bufferA.length, bufferB.length);
    const mixed = this.audioContext.createBuffer(
      Math.max(bufferA.numberOfChannels, bufferB.numberOfChannels),
      maxLength,
      bufferA.sampleRate
    );
    
    for (let channel = 0; channel < mixed.numberOfChannels; channel++) {
      const dataA = bufferA.numberOfChannels > channel ? bufferA.getChannelData(channel) : null;
      const dataB = bufferB.numberOfChannels > channel ? bufferB.getChannelData(channel) : null;
      const mixedData = mixed.getChannelData(channel);
      
      for (let i = 0; i < maxLength; i++) {
        const a = dataA ? dataA[i] : 0;
        const b = dataB ? dataB[i] : 0;
        mixedData[i] = a * mixRatio + b * (1 - mixRatio);
      }
    }
    
    return mixed;
  }

  /**
   * Main remix method - port of the original Python remix() function
   */
  async remix(): Promise<AudioBuffer> {
    this.log('Starting dubstep remix...', 5);
    
    const parts: AudioBuffer[] = [];
    
    // Compile intro (8 bars)
    this.log('Compiling intro...', 10);
    const intro = await this.compileIntro();
    parts.push(intro);
    
    // Compile sections
    const numSections = Math.max(1, this.analysis.sections.length);
    const progressPerSection = 60 / numSections;
    
    for (let i = 0; i < numSections; i++) {
      this.log(`Compiling section ${i + 1} of ${numSections}...`, progressPerSection);
      const [versionA, versionB] = await this.compileSection(i);
      parts.push(versionA);
      parts.push(versionB);
    }
    
    // Add ending splash
    this.log('Adding ending...', 10);
    const splashEnd = await this.loadSample(
      this.template.splash_ends[(numSections) % this.template.splash_ends.length]
    );
    parts.push(splashEnd);
    
    // Concatenate all parts
    this.log('Mixing final output...', 15);
    const totalLength = parts.reduce((sum, buffer) => sum + buffer.length, 0);
    const finalBuffer = this.audioContext.createBuffer(
      2,
      totalLength,
      this.audioContext.sampleRate
    );
    
    let offset = 0;
    for (const part of parts) {
      for (let channel = 0; channel < 2; channel++) {
        const sourceChannel = channel < part.numberOfChannels ? channel : 0;
        const sourceData = part.getChannelData(sourceChannel);
        const destData = finalBuffer.getChannelData(channel);
        destData.set(sourceData, offset);
      }
      offset += part.length;
    }
    
    this.log('Remix complete!', 0);
    this.progressCallback({
      status: 1,
      text: 'Done!',
      progress: 1,
    });
    
    return finalBuffer;
  }
}

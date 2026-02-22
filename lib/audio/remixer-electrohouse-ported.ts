/**
 * remixer-electrohouse-ported.ts
 * 
 * Direct port of the original Python ElectroHouse remixer to TypeScript for Next.js
 * Maintains the original remix algorithm structure and pattern-based sequencing
 * 
 * Original by Peter Sobot <hi@petersobot.com>
 * Port for Next.js/Web Audio API by v0
 */

import type { AudioAnalysisData } from './audio-engine';
import type { RemixProgress } from './remixer-dubstep-ported';

export interface ElectroHouseTemplate {
  tempo: number;
  intro: string;
  body: string[];
  splash_ends: string[];
  mixpoint: number;
  target: 'beats' | 'bars' | 'tatums';
}

interface Note {
  pitch: number | null; // null = rest
  length: number; // in sixteenth notes
}

/**
 * Port of the ElectroHouse pattern format from the original Python code
 * Pattern format: space-separated sixteenth notes
 * Numbers 0-11 represent semitones from root (tonic)
 * "-" means hold/tie the previous note
 * "  " (two spaces) means rest
 */
const SECTION_PATTERN = `
# Pattern for ElectroHouse section (from section.txt)
1 e + a 2 e + a 3 e + a 4 e + a 1 e + a 2 e + a 3 e + a 4 e + a 1 e + a 2 e + a 3 e + a 4 e + a 1 e + a 2 e + a 3 e + a 4 e + a
0 - 0 - 2   0 - 11  0 - 3 - 5 -     0 - - - 3 - - - 10  7 7 5 4 -   0 -     0 - - - 0 - 3 - 5 - - - 0 - 4   0 - 5   10  7 7 5   
    0 - 5 5 0 -     5 - 7 - 7 6     3       5       10  7 3 5       0 -     0 -     0 - 3 - 5 -     0 - 4   0 - 5   10  7 7 11  
    0 2 3 4 5       0 - 3 - 5 - 10  0 - 6   0 - 6   10  7 6 5     7 0 - 8   0 - 9   0 - 3 4 5 5     0 - 4 4 0 6 5 7 10  3 4 5   
0 - 0 - 2   0 - 11  0 - 3 - 5 -     0 - - - 3 - - - 10  7 7 5 4 -   0 -     0 - - - 0 - 3 - 5 - - - 0 - 4   0 - 5   10  7 7 5   
    0 -     0 -     0 - 3 - 5 -     0 -     0 -     10  7 7 5       0 -     0 -     0 - 3 - 5 -     0 - 4   0 - 5   10  7 7 5   
    0 - 5 5 0 -     5 - 7 - 7 6     3       5       10  7 3 5       0 -     0 -     0 - 3 - 5 -     0 - 4   0 - 5   10  7 7 11  
`;

const INTRO_PATTERN = `
# Simplified intro pattern
1 e + a 2 e + a 3 e + a 4 e + a 1 e + a 2 e + a 3 e + a 4 e + a
0 - 0 - 0 - 0 -     0 -     0 -     0 -     0 -     0 -     0 -
0 - 0 - 0 - 0 -     5 -     7 -     0 -     0 -     0 -     0 -
`;

export class ElectroHouseRemixerPorted {
  private audioContext: AudioContext;
  private originalBuffer: AudioBuffer;
  private analysis: AudioAnalysisData;
  private progressCallback: (progress: RemixProgress) => void;
  
  private template: ElectroHouseTemplate = {
    tempo: 128,
    intro: '/samples/electrohouse/intro_16.wav',
    body: [
      '/samples/electrohouse/body/c.wav',
      '/samples/electrohouse/body/c-sharp.wav',
      '/samples/electrohouse/body/d.wav',
      '/samples/electrohouse/body/d-sharp.wav',
      '/samples/electrohouse/body/e.wav',
      '/samples/electrohouse/body/f.wav',
      '/samples/electrohouse/body/f-sharp.wav',
      '/samples/electrohouse/body/g.wav',
      '/samples/electrohouse/body/g-sharp.wav',
      '/samples/electrohouse/body/a.wav',
      '/samples/electrohouse/body/a-sharp.wav',
      '/samples/electrohouse/body/b.wav',
    ],
    splash_ends: [
      '/samples/electrohouse/splash-ends/1.wav',
      '/samples/electrohouse/splash-ends/2.wav',
      '/samples/electrohouse/splash-ends/3.wav',
      '/samples/electrohouse/splash-ends/4.wav',
    ],
    mixpoint: 18,
    target: 'beats',
  };

  private tonic: number = 0;
  private tempo: number = 128;
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
    this.tempo = analysis.tempo || 128;
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
   * Port of readPattern from original Python code
   * Parses the text pattern into an array of notes
   */
  private readPattern(patternText: string): Note[] {
    const lines = patternText.split('\n').filter(line => {
      const trimmed = line.trim();
      return trimmed && !trimmed.startsWith('#') && !trimmed.includes('+');
    });

    const notes: Note[] = [];
    
    for (const line of lines) {
      // Extract two-character chunks (every 2 spaces is one sixteenth note)
      const chars = line.split('');
      for (let i = 0; i < chars.length; i += 2) {
        const chunk = (chars[i] || ' ') + (chars[i + 1] || ' ');
        
        if (chunk === '  ') {
          // Rest
          notes.push({ pitch: null, length: 1 });
        } else if (chunk === '- ') {
          // Tie - extend previous note
          if (notes.length > 0) {
            notes[notes.length - 1].length += 1;
          }
        } else {
          // Try to parse as a number
          const num = parseInt(chunk.trim());
          if (!isNaN(num) && num >= 0 && num <= 11) {
            notes.push({ pitch: num, length: 1 });
          }
        }
      }
    }
    
    return notes;
  }

  /**
   * Port of searchSamples from original Python code
   */
  private searchSamples(sectionIndex: number, key: number): number[] {
    let beatIndices: number[] = [];
    
    beatIndices = this.getSamples(sectionIndex, key);
    
    for (let tries = 0; tries < 5 && beatIndices.length === 0; tries++) {
      key = (key + 7) % 12;
      beatIndices = this.getSamples(sectionIndex, key);
    }
    
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
   */
  private getSamples(sectionIndex: number, pitch: number): number[] {
    const section = this.analysis.sections[sectionIndex] || { start: 0, duration: this.originalBuffer.duration };
    const sectionStart = section.start;
    const sectionEnd = section.start + section.duration;
    
    const matchingBeats: number[] = [];
    
    this.analysis.beats.forEach((beat, index) => {
      if (beat >= sectionStart && beat < sectionEnd) {
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
   * Creates an audio buffer of a specific length based on note duration
   */
  private createNoteBuffer(lengthInSixteenths: number): AudioBuffer {
    const beatsPerSecond = this.template.tempo / 60;
    const sixteenthDuration = (1 / beatsPerSecond) / 4; // Duration of one sixteenth note in seconds
    const samples = Math.floor(sixteenthDuration * lengthInSixteenths * this.audioContext.sampleRate);
    
    return this.audioContext.createBuffer(2, samples, this.audioContext.sampleRate);
  }

  /**
   * Cuts a note to a specific length
   */
  private cutNote(audioData: AudioBuffer, lengthInSixteenths: number): AudioBuffer {
    const targetBuffer = this.createNoteBuffer(lengthInSixteenths);
    const targetLength = targetBuffer.length;
    
    for (let channel = 0; channel < 2; channel++) {
      const sourceData = channel < audioData.numberOfChannels ? audioData.getChannelData(channel) : audioData.getChannelData(0);
      const destData = targetBuffer.getChannelData(channel);
      
      for (let i = 0; i < Math.min(targetLength, audioData.length); i++) {
        destData[i] = sourceData[i];
      }
    }
    
    return targetBuffer;
  }

  /**
   * Port of compileIntro from original Python code
   */
  private async compileIntro(sectionIndex: number = 0): Promise<AudioBuffer> {
    this.log('Arranging intro...', 0);
    
    const intro = await this.loadSample(this.template.intro);
    const pattern = this.readPattern(INTRO_PATTERN);
    const parts: AudioBuffer[] = [];
    
    for (let i = 0; i < pattern.length; i++) {
      const note = pattern[i];
      
      if (note.pitch === null) {
        // Rest
        parts.push(this.createNoteBuffer(note.length));
      } else {
        // Get samples matching this pitch
        const samples = this.searchSamples(sectionIndex, (note.pitch + this.tonic) % 12);
        
        if (samples.length === 0) {
          parts.push(this.createNoteBuffer(note.length));
        } else {
          const beatIndex = samples[i % samples.length];
          const segment = this.extractBeatSegment(beatIndex);
          const stretched = await this.timeStretch(segment, this.template.tempo / this.tempo);
          const cut = this.cutNote(stretched, note.length);
          parts.push(cut);
        }
      }
    }
    
    // Concatenate all parts
    const totalLength = parts.reduce((sum, buffer) => sum + buffer.length, 0);
    const assembled = this.audioContext.createBuffer(2, totalLength, this.audioContext.sampleRate);
    
    let offset = 0;
    for (const part of parts) {
      for (let channel = 0; channel < 2; channel++) {
        const sourceChannel = channel < part.numberOfChannels ? channel : 0;
        assembled.getChannelData(channel).set(part.getChannelData(sourceChannel), offset);
      }
      offset += part.length;
    }
    
    // Mix with intro sample
    return this.mixBuffers(intro, assembled, 0.3);
  }

  /**
   * Port of compileSection from original Python code
   */
  private async compileSection(sectionIndex: number): Promise<AudioBuffer> {
    this.log(`Arranging section ${sectionIndex + 1}...`, 0);
    
    const backing = await this.loadSample(this.template.body[this.tonic]);
    const pattern = this.readPattern(SECTION_PATTERN);
    const parts: AudioBuffer[] = [];
    
    for (let i = 0; i < pattern.length; i++) {
      const note = pattern[i];
      
      if (note.pitch === null) {
        parts.push(this.createNoteBuffer(note.length));
      } else {
        const samples = this.searchSamples(sectionIndex, (note.pitch + this.tonic) % 12);
        
        if (samples.length === 0) {
          parts.push(this.createNoteBuffer(note.length));
        } else {
          const beatIndex = samples[i % samples.length];
          const segment = this.extractBeatSegment(beatIndex);
          const stretched = await this.timeStretch(segment, this.template.tempo / this.tempo);
          const cut = this.cutNote(stretched, note.length);
          parts.push(cut);
        }
      }
    }
    
    // Concatenate all parts
    const totalLength = parts.reduce((sum, buffer) => sum + buffer.length, 0);
    const assembled = this.audioContext.createBuffer(2, totalLength, this.audioContext.sampleRate);
    
    let offset = 0;
    for (const part of parts) {
      for (let channel = 0; channel < 2; channel++) {
        const sourceChannel = channel < part.numberOfChannels ? channel : 0;
        assembled.getChannelData(channel).set(part.getChannelData(sourceChannel), offset);
      }
      offset += part.length;
    }
    
    // Mix with backing track
    return this.mixBuffers(backing, assembled, 0.3);
  }

  private extractBeatSegment(beatIndex: number): AudioBuffer {
    const start = this.analysis.beats[beatIndex] || 0;
    const end = this.analysis.beats[beatIndex + 1] || start + 0.4;
    
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

  private mixBuffers(bufferA: AudioBuffer, bufferB: AudioBuffer, mixRatio: number): AudioBuffer {
    const maxLength = Math.min(bufferA.length, bufferB.length);
    const mixed = this.audioContext.createBuffer(2, maxLength, bufferA.sampleRate);
    
    for (let channel = 0; channel < 2; channel++) {
      const dataA = bufferA.numberOfChannels > channel ? bufferA.getChannelData(channel) : bufferA.getChannelData(0);
      const dataB = bufferB.numberOfChannels > channel ? bufferB.getChannelData(channel) : bufferB.getChannelData(0);
      const mixedData = mixed.getChannelData(channel);
      
      for (let i = 0; i < maxLength; i++) {
        mixedData[i] = dataA[i] * mixRatio + dataB[i] * (1 - mixRatio);
      }
    }
    
    return mixed;
  }

  /**
   * Main remix method - port of the original Python remix() function
   */
  async remix(): Promise<AudioBuffer> {
    this.log('Starting ElectroHouse remix...', 5);
    
    const parts: AudioBuffer[] = [];
    
    // Compile intro
    this.log('Compiling intro...', 10);
    const intro = await this.compileIntro(0);
    parts.push(intro);
    
    // Compile sections
    const sections = this.analysis.sections.length > 2 ? 
      (this.analysis.sections.length % 2 === 0 ? 
        this.analysis.sections : 
        this.analysis.sections.slice(1)) : 
      this.analysis.sections;
    
    const progressPerSection = 60 / Math.max(1, sections.length);
    
    for (let i = 0; i < sections.length; i++) {
      this.log(`Compiling section ${i + 1} of ${sections.length}...`, progressPerSection);
      
      // Add intro again at midpoint
      if (i === Math.floor(sections.length / 2) + 1) {
        const midIntro = await this.compileIntro(i);
        parts.push(midIntro);
      } else {
        const section = await this.compileSection(i);
        parts.push(section);
      }
    }
    
    // Add ending splash
    this.log('Adding ending...', 10);
    const splashEnd = await this.loadSample(
      this.template.splash_ends[(sections.length) % this.template.splash_ends.length]
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

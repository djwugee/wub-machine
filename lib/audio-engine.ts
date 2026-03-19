// Wub Machine Audio Engine - Client-side audio processing
// Ported from the original Python implementation by Peter Sobot

export interface AudioAnalysis {
  tempo: number;
  key: number;
  beats: Beat[];
  sections: Section[];
  loudness: number;
}

export interface Beat {
  start: number;
  duration: number;
  confidence: number;
}

export interface Section {
  start: number;
  duration: number;
  beats: Beat[];
  key: number;
  loudness: number;
}

export type RemixStyle = "dubstep" | "electrohouse";

export interface RemixProgress {
  status: "analyzing" | "remixing" | "encoding" | "complete" | "error";
  progress: number;
  text: string;
}

const KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Dubstep template configuration
const DUBSTEP_CONFIG = {
  tempo: 140,
  mixpoint: 18,
};

// Electro House template configuration
const ELECTROHOUSE_CONFIG = {
  tempo: 128,
  mixpoint: 18,
};

export class WubMachineEngine {
  private audioContext: AudioContext | null = null;
  private originalBuffer: AudioBuffer | null = null;
  private sampleBuffers: Map<string, AudioBuffer> = new Map();
  private onProgress: ((progress: RemixProgress) => void) | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      this.audioContext = new AudioContext();
    }
  }

  setProgressCallback(callback: (progress: RemixProgress) => void) {
    this.onProgress = callback;
  }

  private reportProgress(status: RemixProgress["status"], progress: number, text: string) {
    if (this.onProgress) {
      this.onProgress({ status, progress, text });
    }
  }

  async loadAudioFile(file: File): Promise<AudioBuffer> {
    if (!this.audioContext) throw new Error("AudioContext not available");

    this.reportProgress("analyzing", 0.05, "Loading audio file...");
    const arrayBuffer = await file.arrayBuffer();
    this.reportProgress("analyzing", 0.1, "Decoding audio...");
    this.originalBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
    return this.originalBuffer;
  }

  async loadSample(url: string): Promise<AudioBuffer> {
    if (!this.audioContext) throw new Error("AudioContext not available");
    
    if (this.sampleBuffers.has(url)) {
      return this.sampleBuffers.get(url)!;
    }

    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = await this.audioContext.decodeAudioData(arrayBuffer);
    this.sampleBuffers.set(url, buffer);
    return buffer;
  }

  // Beat detection using onset detection
  async detectBeats(buffer: AudioBuffer): Promise<Beat[]> {
    const sampleRate = buffer.sampleRate;
    const channelData = buffer.getChannelData(0);
    const beats: Beat[] = [];

    // Parameters for beat detection
    const hopSize = 512;
    const windowSize = 1024;
    const threshold = 0.3;

    // Calculate spectral flux for onset detection
    let prevSpectrum: Float32Array | null = null;
    const onsetFunction: number[] = [];

    for (let i = 0; i < channelData.length - windowSize; i += hopSize) {
      const frame = channelData.slice(i, i + windowSize);
      const spectrum = this.computeSpectrum(frame);

      if (prevSpectrum) {
        let flux = 0;
        for (let j = 0; j < spectrum.length; j++) {
          const diff = spectrum[j] - prevSpectrum[j];
          if (diff > 0) flux += diff;
        }
        onsetFunction.push(flux);
      } else {
        onsetFunction.push(0);
      }
      prevSpectrum = spectrum;
    }

    // Normalize onset function
    const maxOnset = Math.max(...onsetFunction);
    const normalizedOnset = onsetFunction.map((v) => v / maxOnset);

    // Peak picking
    for (let i = 1; i < normalizedOnset.length - 1; i++) {
      if (
        normalizedOnset[i] > threshold &&
        normalizedOnset[i] > normalizedOnset[i - 1] &&
        normalizedOnset[i] > normalizedOnset[i + 1]
      ) {
        const time = (i * hopSize) / sampleRate;
        beats.push({
          start: time,
          duration: hopSize / sampleRate,
          confidence: normalizedOnset[i],
        });
      }
    }

    // Filter beats to get regular tempo
    return this.regularizeBeats(beats, buffer.duration);
  }

  private computeSpectrum(frame: Float32Array): Float32Array {
    // Simple magnitude spectrum using DFT
    const n = frame.length;
    const spectrum = new Float32Array(n / 2);

    for (let k = 0; k < n / 2; k++) {
      let real = 0;
      let imag = 0;
      for (let t = 0; t < n; t++) {
        const angle = (2 * Math.PI * k * t) / n;
        real += frame[t] * Math.cos(angle);
        imag -= frame[t] * Math.sin(angle);
      }
      spectrum[k] = Math.sqrt(real * real + imag * imag);
    }

    return spectrum;
  }

  private regularizeBeats(rawBeats: Beat[], duration: number): Beat[] {
    if (rawBeats.length < 4) return rawBeats;

    // Estimate tempo from beat intervals
    const intervals: number[] = [];
    for (let i = 1; i < Math.min(rawBeats.length, 100); i++) {
      intervals.push(rawBeats[i].start - rawBeats[i - 1].start);
    }

    // Find median interval
    intervals.sort((a, b) => a - b);
    const medianInterval = intervals[Math.floor(intervals.length / 2)];
    const estimatedTempo = 60 / medianInterval;

    // Generate regular beat grid
    const regularBeats: Beat[] = [];
    const beatDuration = 60 / Math.round(estimatedTempo);

    for (let time = 0; time < duration; time += beatDuration) {
      regularBeats.push({
        start: time,
        duration: beatDuration,
        confidence: 0.8,
      });
    }

    return regularBeats;
  }

  // Detect key using pitch class histogram
  detectKey(buffer: AudioBuffer): number {
    const channelData = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;

    // Build pitch class histogram using autocorrelation
    const pitchClasses = new Float32Array(12);
    const frameSize = 4096;
    const hopSize = 2048;

    for (let i = 0; i < channelData.length - frameSize; i += hopSize * 10) {
      const frame = channelData.slice(i, i + frameSize);
      const pitch = this.detectPitch(frame, sampleRate);
      if (pitch > 0) {
        const midiNote = 12 * Math.log2(pitch / 440) + 69;
        const pitchClass = Math.round(midiNote) % 12;
        if (pitchClass >= 0 && pitchClass < 12) {
          pitchClasses[pitchClass]++;
        }
      }
    }

    // Find dominant pitch class
    let maxIdx = 0;
    let maxVal = pitchClasses[0];
    for (let i = 1; i < 12; i++) {
      if (pitchClasses[i] > maxVal) {
        maxVal = pitchClasses[i];
        maxIdx = i;
      }
    }

    return maxIdx;
  }

  private detectPitch(frame: Float32Array, sampleRate: number): number {
    // Autocorrelation-based pitch detection
    const minLag = Math.floor(sampleRate / 1000); // 1000 Hz max
    const maxLag = Math.floor(sampleRate / 60); // 60 Hz min

    let maxCorr = 0;
    let bestLag = 0;

    for (let lag = minLag; lag < maxLag && lag < frame.length; lag++) {
      let correlation = 0;
      for (let i = 0; i < frame.length - lag; i++) {
        correlation += frame[i] * frame[i + lag];
      }
      if (correlation > maxCorr) {
        maxCorr = correlation;
        bestLag = lag;
      }
    }

    return bestLag > 0 ? sampleRate / bestLag : 0;
  }

  // Estimate sections based on spectral changes
  detectSections(buffer: AudioBuffer, beats: Beat[]): Section[] {
    const sections: Section[] = [];
    const channelData = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;

    // Simple section detection: divide into roughly 8-bar sections
    const beatsPerSection = 32;
    const barsPerSection = 8;

    for (let i = 0; i < beats.length; i += beatsPerSection) {
      const sectionBeats = beats.slice(i, Math.min(i + beatsPerSection, beats.length));
      if (sectionBeats.length === 0) continue;

      const startTime = sectionBeats[0].start;
      const endTime = sectionBeats[sectionBeats.length - 1].start + sectionBeats[sectionBeats.length - 1].duration;

      // Calculate section loudness
      const startSample = Math.floor(startTime * sampleRate);
      const endSample = Math.min(Math.floor(endTime * sampleRate), channelData.length);
      let rms = 0;
      for (let j = startSample; j < endSample; j++) {
        rms += channelData[j] * channelData[j];
      }
      rms = Math.sqrt(rms / (endSample - startSample));
      const loudness = 20 * Math.log10(rms + 0.0001);

      sections.push({
        start: startTime,
        duration: endTime - startTime,
        beats: sectionBeats,
        key: this.detectKey(buffer),
        loudness,
      });
    }

    return sections;
  }

  // Full audio analysis
  async analyzeAudio(buffer: AudioBuffer): Promise<AudioAnalysis> {
    this.reportProgress("analyzing", 0.2, "Detecting beats...");
    const beats = await this.detectBeats(buffer);

    this.reportProgress("analyzing", 0.4, "Analyzing key...");
    const key = this.detectKey(buffer);

    this.reportProgress("analyzing", 0.5, "Detecting sections...");
    const sections = this.detectSections(buffer, beats);

    // Calculate overall loudness
    const channelData = buffer.getChannelData(0);
    let rms = 0;
    for (let i = 0; i < channelData.length; i++) {
      rms += channelData[i] * channelData[i];
    }
    rms = Math.sqrt(rms / channelData.length);
    const loudness = 20 * Math.log10(rms + 0.0001);

    // Estimate tempo from beats
    let tempo = 120;
    if (beats.length > 1) {
      const intervals = [];
      for (let i = 1; i < Math.min(beats.length, 50); i++) {
        intervals.push(beats[i].start - beats[i - 1].start);
      }
      intervals.sort((a, b) => a - b);
      const medianInterval = intervals[Math.floor(intervals.length / 2)];
      tempo = 60 / medianInterval;
    }

    return { tempo, key, beats, sections, loudness };
  }

  // Time-stretch audio to match target tempo
  timeStretch(buffer: AudioBuffer, ratio: number): AudioBuffer {
    if (!this.audioContext) throw new Error("AudioContext not available");

    const newLength = Math.floor(buffer.length * ratio);
    const newBuffer = this.audioContext.createBuffer(
      buffer.numberOfChannels,
      newLength,
      buffer.sampleRate
    );

    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const inputData = buffer.getChannelData(channel);
      const outputData = newBuffer.getChannelData(channel);

      // Simple linear interpolation time stretching
      for (let i = 0; i < newLength; i++) {
        const srcIndex = i / ratio;
        const srcIndexFloor = Math.floor(srcIndex);
        const srcIndexCeil = Math.min(srcIndexFloor + 1, inputData.length - 1);
        const fraction = srcIndex - srcIndexFloor;

        outputData[i] = inputData[srcIndexFloor] * (1 - fraction) + inputData[srcIndexCeil] * fraction;
      }
    }

    return newBuffer;
  }

  // Mix two audio buffers
  mixBuffers(buffer1: AudioBuffer, buffer2: AudioBuffer, mixFactor: number): AudioBuffer {
    if (!this.audioContext) throw new Error("AudioContext not available");

    const length = Math.min(buffer1.length, buffer2.length);
    const mixed = this.audioContext.createBuffer(2, length, buffer1.sampleRate);

    for (let channel = 0; channel < 2; channel++) {
      const chan1 = channel < buffer1.numberOfChannels ? channel : 0;
      const chan2 = channel < buffer2.numberOfChannels ? channel : 0;

      const input1 = buffer1.getChannelData(chan1);
      const input2 = buffer2.getChannelData(chan2);
      const output = mixed.getChannelData(channel);

      for (let i = 0; i < length; i++) {
        output[i] = input1[i] * (1 - mixFactor) + input2[i] * mixFactor;
      }
    }

    return mixed;
  }

  // Concatenate audio buffers
  concatBuffers(buffers: AudioBuffer[]): AudioBuffer {
    if (!this.audioContext) throw new Error("AudioContext not available");
    if (buffers.length === 0) throw new Error("No buffers to concatenate");

    const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0);
    const sampleRate = buffers[0].sampleRate;
    const result = this.audioContext.createBuffer(2, totalLength, sampleRate);

    let offset = 0;
    for (const buffer of buffers) {
      for (let channel = 0; channel < 2; channel++) {
        const chan = channel < buffer.numberOfChannels ? channel : 0;
        const input = buffer.getChannelData(chan);
        const output = result.getChannelData(channel);
        for (let i = 0; i < buffer.length; i++) {
          output[offset + i] = input[i];
        }
      }
      offset += buffer.length;
    }

    return result;
  }

  // Extract a portion of audio buffer
  sliceBuffer(buffer: AudioBuffer, startTime: number, duration: number): AudioBuffer {
    if (!this.audioContext) throw new Error("AudioContext not available");

    const startSample = Math.floor(startTime * buffer.sampleRate);
    const numSamples = Math.floor(duration * buffer.sampleRate);
    const endSample = Math.min(startSample + numSamples, buffer.length);

    const sliced = this.audioContext.createBuffer(
      buffer.numberOfChannels,
      endSample - startSample,
      buffer.sampleRate
    );

    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const input = buffer.getChannelData(channel);
      const output = sliced.getChannelData(channel);
      for (let i = startSample; i < endSample; i++) {
        output[i - startSample] = input[i];
      }
    }

    return sliced;
  }

  // Calculate mix factor based on loudness
  private calculateMixFactor(loudness: number, mixpoint: number): number {
    const a = 89.0 / 1.5 + mixpoint;
    const b = 188.0 / 1.5 + mixpoint;

    if (loudness === -1 * b) return 0.5;

    let mixfactor = (loudness + a) / (loudness + b);
    return Math.max(0.3, Math.min(0.8, mixfactor));
  }

  // Main remix function for Dubstep
  async remixDubstep(
    originalBuffer: AudioBuffer,
    analysis: AudioAnalysis
  ): Promise<AudioBuffer> {
    const config = DUBSTEP_CONFIG;
    const targetTempo = config.tempo;
    const tempoRatio = targetTempo / analysis.tempo;

    const parts: AudioBuffer[] = [];

    // Load samples
    this.reportProgress("remixing", 0.55, "Loading dubstep samples...");
    const wubSamples: AudioBuffer[] = [];
    const notes = ["c", "c-sharp", "d", "d-sharp", "e", "f", "f-sharp", "g", "g-sharp", "a", "a-sharp", "b"];

    for (const note of notes) {
      try {
        const sample = await this.loadSample(`/samples/dubstep/wubs/${note}.wav`);
        wubSamples.push(sample);
      } catch {
        // Use first loaded sample as fallback
        if (wubSamples.length > 0) {
          wubSamples.push(wubSamples[0]);
        }
      }
    }

    const introSample = await this.loadSample("/samples/dubstep/intro-eight.wav");
    const hatsSample = await this.loadSample("/samples/dubstep/hats.wav");

    // Compile intro (first 16 beats)
    this.reportProgress("remixing", 0.6, "Creating intro...");
    const introBeats = analysis.beats.slice(0, 16);
    if (introBeats.length > 0) {
      const introParts: AudioBuffer[] = [];
      for (const beat of introBeats) {
        const beatSlice = this.sliceBuffer(originalBuffer, beat.start, beat.duration);
        introParts.push(beatSlice);
      }

      if (introParts.length > 0) {
        let introOrig = this.concatBuffers(introParts);
        introOrig = this.timeStretch(introOrig, tempoRatio);

        // Truncate or extend to match intro sample
        const introLength = Math.min(introSample.length, introOrig.length);
        introOrig = this.sliceBuffer(introOrig, 0, introLength / originalBuffer.sampleRate);

        const intro = this.mixBuffers(introSample, introOrig, 0.4);
        parts.push(intro);
      }
    }

    // Compile sections
    const totalSections = analysis.sections.length;
    for (let i = 0; i < totalSections; i++) {
      const section = analysis.sections[i];
      this.reportProgress(
        "remixing",
        0.6 + (i / totalSections) * 0.3,
        `Remixing section ${i + 1} of ${totalSections}...`
      );

      // Get samples from the section
      const sectionBeats = section.beats.slice(0, 16);
      if (sectionBeats.length === 0) continue;

      const sectionParts: AudioBuffer[] = [];
      for (const beat of sectionBeats) {
        const beatSlice = this.sliceBuffer(originalBuffer, beat.start, beat.duration);
        sectionParts.push(beatSlice);
      }

      if (sectionParts.length === 0) continue;

      let sectionAudio = this.concatBuffers(sectionParts);
      sectionAudio = this.timeStretch(sectionAudio, tempoRatio);

      // Mix with wub sample based on key
      const wubIndex = analysis.key % wubSamples.length;
      if (wubSamples[wubIndex]) {
        const mixFactor = this.calculateMixFactor(section.loudness, config.mixpoint);
        const wubSample = wubSamples[wubIndex];

        // Truncate to match
        const mixLength = Math.min(wubSample.length, sectionAudio.length);
        const wubSlice = this.sliceBuffer(wubSample, 0, mixLength / wubSample.sampleRate);
        const origSlice = this.sliceBuffer(sectionAudio, 0, mixLength / sectionAudio.sampleRate);

        const mixed = this.mixBuffers(wubSlice, origSlice, mixFactor);
        parts.push(mixed);

        // Add hats variation
        const hatsSlice = this.sliceBuffer(hatsSample, 0, mixLength / hatsSample.sampleRate);
        const withHats = this.mixBuffers(mixed, hatsSlice, 0.7);
        parts.push(withHats);
      } else {
        parts.push(sectionAudio);
      }
    }

    // Add ending
    this.reportProgress("remixing", 0.92, "Adding ending...");
    try {
      const ending = await this.loadSample("/samples/dubstep/splash-ends/1.wav");
      parts.push(ending);
    } catch {
      // Skip ending if not available
    }

    // Concatenate all parts
    this.reportProgress("encoding", 0.95, "Finalizing remix...");
    const result = this.concatBuffers(parts);

    return result;
  }

  // Main remix function for Electro House
  async remixElectroHouse(
    originalBuffer: AudioBuffer,
    analysis: AudioAnalysis
  ): Promise<AudioBuffer> {
    const config = ELECTROHOUSE_CONFIG;
    const targetTempo = config.tempo;
    const tempoRatio = targetTempo / analysis.tempo;

    const parts: AudioBuffer[] = [];

    // Load samples
    this.reportProgress("remixing", 0.55, "Loading electro house samples...");
    const bodySamples: AudioBuffer[] = [];
    const notes = ["c", "c-sharp", "d", "d-sharp", "e", "f", "f-sharp", "g", "g-sharp", "a", "a-sharp", "b"];

    for (const note of notes) {
      try {
        const sample = await this.loadSample(`/samples/electrohouse/body/${note}.wav`);
        bodySamples.push(sample);
      } catch {
        if (bodySamples.length > 0) {
          bodySamples.push(bodySamples[0]);
        }
      }
    }

    const introSample = await this.loadSample("/samples/electrohouse/intro_16.wav");

    // Compile intro
    this.reportProgress("remixing", 0.6, "Creating intro...");
    const introBeats = analysis.beats.slice(0, 32);
    if (introBeats.length > 0) {
      const introParts: AudioBuffer[] = [];
      for (const beat of introBeats) {
        const beatSlice = this.sliceBuffer(originalBuffer, beat.start, beat.duration);
        introParts.push(beatSlice);
      }

      if (introParts.length > 0) {
        let introOrig = this.concatBuffers(introParts);
        introOrig = this.timeStretch(introOrig, tempoRatio);

        const introLength = Math.min(introSample.length, introOrig.length);
        introOrig = this.sliceBuffer(introOrig, 0, introLength / originalBuffer.sampleRate);

        const intro = this.mixBuffers(introSample, introOrig, 0.3);
        parts.push(intro);
      }
    }

    // Compile sections
    const totalSections = analysis.sections.length;
    for (let i = 0; i < totalSections; i++) {
      const section = analysis.sections[i];
      this.reportProgress(
        "remixing",
        0.6 + (i / totalSections) * 0.3,
        `Remixing section ${i + 1} of ${totalSections}...`
      );

      const sectionBeats = section.beats.slice(0, 32);
      if (sectionBeats.length === 0) continue;

      const sectionParts: AudioBuffer[] = [];
      for (const beat of sectionBeats) {
        const beatSlice = this.sliceBuffer(originalBuffer, beat.start, beat.duration);
        sectionParts.push(beatSlice);
      }

      if (sectionParts.length === 0) continue;

      let sectionAudio = this.concatBuffers(sectionParts);
      sectionAudio = this.timeStretch(sectionAudio, tempoRatio);

      const bodyIndex = analysis.key % bodySamples.length;
      if (bodySamples[bodyIndex]) {
        const mixFactor = this.calculateMixFactor(section.loudness, config.mixpoint);
        const bodySample = bodySamples[bodyIndex];

        const mixLength = Math.min(bodySample.length, sectionAudio.length);
        const bodySlice = this.sliceBuffer(bodySample, 0, mixLength / bodySample.sampleRate);
        const origSlice = this.sliceBuffer(sectionAudio, 0, mixLength / sectionAudio.sampleRate);

        const mixed = this.mixBuffers(bodySlice, origSlice, mixFactor);
        parts.push(mixed);
      } else {
        parts.push(sectionAudio);
      }
    }

    // Add ending
    this.reportProgress("remixing", 0.92, "Adding ending...");
    try {
      const ending = await this.loadSample("/samples/electrohouse/splash-ends/1.wav");
      parts.push(ending);
    } catch {
      // Skip if not available
    }

    this.reportProgress("encoding", 0.95, "Finalizing remix...");
    const result = this.concatBuffers(parts);

    return result;
  }

  // Main entry point
  async remix(file: File, style: RemixStyle): Promise<AudioBuffer> {
    const buffer = await this.loadAudioFile(file);
    const analysis = await this.analyzeAudio(buffer);

    this.reportProgress("remixing", 0.52, `Starting ${style} remix...`);

    let result: AudioBuffer;
    if (style === "dubstep") {
      result = await this.remixDubstep(buffer, analysis);
    } else {
      result = await this.remixElectroHouse(buffer, analysis);
    }

    this.reportProgress("complete", 1, "Remix complete!");
    return result;
  }

  // Export to WAV
  exportToWav(buffer: AudioBuffer): Blob {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    const dataSize = buffer.length * blockAlign;
    const headerSize = 44;
    const totalSize = headerSize + dataSize;

    const arrayBuffer = new ArrayBuffer(totalSize);
    const view = new DataView(arrayBuffer);

    // RIFF header
    this.writeString(view, 0, "RIFF");
    view.setUint32(4, totalSize - 8, true);
    this.writeString(view, 8, "WAVE");

    // fmt chunk
    this.writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true); // chunk size
    view.setUint16(20, 1, true); // audio format (PCM)
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);

    // data chunk
    this.writeString(view, 36, "data");
    view.setUint32(40, dataSize, true);

    // Write interleaved samples
    const channels: Float32Array[] = [];
    for (let c = 0; c < numChannels; c++) {
      channels.push(buffer.getChannelData(c));
    }

    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
      for (let c = 0; c < numChannels; c++) {
        const sample = Math.max(-1, Math.min(1, channels[c][i]));
        const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        view.setInt16(offset, int16, true);
        offset += 2;
      }
    }

    return new Blob([arrayBuffer], { type: "audio/wav" });
  }

  private writeString(view: DataView, offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  getKeyName(key: number): string {
    return KEY_NAMES[key % 12];
  }

  dispose() {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.sampleBuffers.clear();
  }
}

// Singleton instance
let engineInstance: WubMachineEngine | null = null;

export function getWubMachineEngine(): WubMachineEngine {
  if (!engineInstance) {
    engineInstance = new WubMachineEngine();
  }
  return engineInstance;
}

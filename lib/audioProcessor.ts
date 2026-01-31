/**
 * Advanced Web Audio API integration for real-time mixing, filtering, and effects
 */

export class AudioProcessor {
  private audioContext: AudioContext;
  private nodes: Map<string, AudioNode> = new Map();
  private masterGainNode: GainNode;
  private analyserNode: AnalyserNode;

  constructor() {
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.masterGainNode = this.audioContext.createGain();
    this.analyserNode = this.audioContext.createAnalyser();

    this.masterGainNode.connect(this.analyserNode);
    this.analyserNode.connect(this.audioContext.destination);

    this.masterGainNode.gain.value = 0.8;
  }

  /**
   * Create an EQ filter with 3-band parametric equalizer
   */
  createEQ(): {
    bass: BiquadFilterNode;
    mid: BiquadFilterNode;
    treble: BiquadFilterNode;
  } {
    const bass = this.audioContext.createBiquadFilter();
    bass.type = 'lowshelf';
    bass.frequency.value = 200;
    bass.gain.value = 0;

    const mid = this.audioContext.createBiquadFilter();
    mid.type = 'peaking';
    mid.frequency.value = 2000;
    mid.gain.value = 0;
    mid.Q.value = 1.0;

    const treble = this.audioContext.createBiquadFilter();
    treble.type = 'highshelf';
    treble.frequency.value = 4000;
    treble.gain.value = 0;

    // Chain them together
    bass.connect(mid);
    mid.connect(treble);

    return { bass, mid, treble };
  }

  /**
   * Create a compressor for dynamic range control
   */
  createCompressor(): DynamicsCompressorNode {
    const compressor = this.audioContext.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.knee.value = 30;
    compressor.ratio.value = 12;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;

    return compressor;
  }

  /**
   * Create a reverb effect using ConvolverNode (impulse response based)
   */
  createReverb(): ConvolverNode {
    const convolver = this.audioContext.createConvolver();

    // Create simple impulse response (you can replace with real impulse response)
    const dryGain = this.audioContext.createGain();
    const wetGain = this.audioContext.createGain();

    dryGain.gain.value = 0.7;
    wetGain.gain.value = 0.3;

    // In production, load an actual impulse response file
    // For now, create a simple synthetic one
    this.createSimpleImpulseResponse(convolver);

    return convolver;
  }

  /**
   * Create a delay effect
   */
  createDelay(
    time: number = 0.5,
    feedback: number = 0.3
  ): {
    delay: DelayNode;
    feedback: GainNode;
  } {
    const delay = this.audioContext.createDelay(5.0);
    const feedbackNode = this.audioContext.createGain();

    delay.delayTime.value = time;
    feedbackNode.gain.value = feedback;

    // Connect feedback loop: delay -> feedback -> delay input
    delay.connect(feedbackNode);
    feedbackNode.connect(delay);

    return { delay, feedback: feedbackNode };
  }

  /**
   * Create a stereo widener
   */
  createStereoWidener(): {
    input: ChannelSplitterNode;
    output: ChannelMergerNode;
    widthGain: GainNode;
  } {
    const splitter = this.audioContext.createChannelSplitter(2);
    const merger = this.audioContext.createChannelMerger(2);
    const widthGain = this.audioContext.createGain();

    // Spread stereo image
    widthGain.gain.value = 1.5;

    return { input: splitter, output: merger, widthGain };
  }

  /**
   * Create a high-pass filter
   */
  createHighPassFilter(frequency: number = 20): BiquadFilterNode {
    const filter = this.audioContext.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = frequency;
    return filter;
  }

  /**
   * Create a low-pass filter
   */
  createLowPassFilter(frequency: number = 22050): BiquadFilterNode {
    const filter = this.audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = frequency;
    return filter;
  }

  /**
   * Create a notch filter to remove specific frequencies
   */
  createNotchFilter(frequency: number, q: number = 10): BiquadFilterNode {
    const filter = this.audioContext.createBiquadFilter();
    filter.type = 'notch';
    filter.frequency.value = frequency;
    filter.Q.value = q;
    return filter;
  }

  /**
   * Create a limiter to prevent clipping
   */
  createLimiter(threshold: number = -1): DynamicsCompressorNode {
    const limiter = this.audioContext.createDynamicsCompressor();
    limiter.threshold.value = threshold;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.05;

    return limiter;
  }

  /**
   * Get frequency data from analyser (for visualizations)
   */
  getFrequencyData(): Uint8Array {
    const dataArray = new Uint8Array(this.analyserNode.frequencyBinCount);
    this.analyserNode.getByteFrequencyData(dataArray);
    return dataArray;
  }

  /**
   * Get waveform data from analyser
   */
  getWaveformData(): Uint8Array {
    const dataArray = new Uint8Array(this.analyserNode.fftSize);
    this.analyserNode.getByteTimeDomainData(dataArray);
    return dataArray;
  }

  /**
   * Set master volume (0-1)
   */
  setMasterVolume(volume: number): void {
    this.masterGainNode.gain.value = Math.max(0, Math.min(1, volume));
  }

  /**
   * Get master volume
   */
  getMasterVolume(): number {
    return this.masterGainNode.gain.value;
  }

  /**
   * Connect a node to the master output
   */
  connectToMaster(node: AudioNode): void {
    node.connect(this.masterGainNode);
  }

  /**
   * Get the audio context
   */
  getContext(): AudioContext {
    return this.audioContext;
  }

  /**
   * Get master gain node for chaining
   */
  getMasterGain(): GainNode {
    return this.masterGainNode;
  }

  /**
   * Resume audio context (required for user interaction in modern browsers)
   */
  async resume(): Promise<void> {
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  /**
   * Create simple impulse response for reverb
   */
  private createSimpleImpulseResponse(convolver: ConvolverNode): void {
    const rate = this.audioContext.sampleRate;
    const length = rate * 2; // 2 seconds
    const impulse = this.audioContext.createBuffer(2, length, rate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    // Create exponential decay envelope
    for (let i = 0; i < length; i++) {
      const decay = Math.exp(-i / (rate * 0.5));
      left[i] = (Math.random() * 2 - 1) * decay * 0.1;
      right[i] = (Math.random() * 2 - 1) * decay * 0.1;
    }

    convolver.buffer = impulse;
  }
}

/**
 * Tempo-aware audio scheduling utilities
 */
export class AudioScheduler {
  private audioContext: AudioContext;
  private scheduledNodes: Array<{
    sourceNode: AudioBufferSourceNode;
    startTime: number;
    duration: number;
  }> = [];

  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext;
  }

  /**
   * Schedule a buffer to play at specific tempo-based position
   */
  scheduleAtBeat(
    buffer: AudioBuffer,
    beat: number,
    tempo: number,
    destination: AudioNode
  ): AudioBufferSourceNode {
    const beatDuration = 60 / tempo; // Seconds per beat
    const startTime = this.audioContext.currentTime + beat * beatDuration;

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(destination);
    source.start(startTime);

    this.scheduledNodes.push({
      sourceNode: source,
      startTime,
      duration: buffer.duration,
    });

    return source;
  }

  /**
   * Cancel all scheduled nodes
   */
  stopAll(): void {
    for (const scheduled of this.scheduledNodes) {
      try {
        scheduled.sourceNode.stop();
      } catch {
        // Already stopped
      }
    }
    this.scheduledNodes = [];
  }

  /**
   * Get current audio time in beats
   */
  getCurrentBeat(tempo: number): number {
    const beatDuration = 60 / tempo;
    return this.audioContext.currentTime / beatDuration;
  }
}

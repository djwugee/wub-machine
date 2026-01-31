/**
 * Synthesizer for generating dubstep bass wobbles and electronic sounds
 */

export class SynthGenerator {
  private audioContext: AudioContext;

  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext;
  }

  /**
   * Generate a dubstep "wub" bass sound
   */
  async generateWubBass(
    frequency: number,
    duration: number,
    wobbleRate: number = 4
  ): Promise<AudioBuffer> {
    const sampleRate = this.audioContext.sampleRate;
    const length = Math.floor(duration * sampleRate);
    const buffer = this.audioContext.createBuffer(2, length, sampleRate);

    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);

      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;

        // Base sawtooth wave for bass
        const phase = (t * frequency) % 1;
        const sawtooth = 2 * phase - 1;

        // Add sub-bass (sine wave octave below)
        const subBass = Math.sin(2 * Math.PI * frequency * 0.5 * t);

        // LFO for wobble effect
        const lfoValue = Math.sin(2 * Math.PI * wobbleRate * t);
        const wobbleCutoff = 200 + (1500 * (lfoValue + 1) / 2);

        // Simulate filter sweep with harmonics
        let filteredSound = sawtooth * 0.6 + subBass * 0.4;

        // Add harmonics and apply envelope
        for (let harmonic = 2; harmonic <= 4; harmonic++) {
          const harmonicPhase = (t * frequency * harmonic) % 1;
          const harmonicSaw = (2 * harmonicPhase - 1) / harmonic;
          filteredSound += harmonicSaw * 0.1;
        }

        // Envelope
        const attack = 0.01;
        const decay = 0.1;
        const sustain = 0.7;
        const release = 0.2;

        let envelope = 1;
        if (t < attack) {
          envelope = t / attack;
        } else if (t < attack + decay) {
          envelope = 1 - ((t - attack) / decay) * (1 - sustain);
        } else if (t > duration - release) {
          envelope = sustain * (duration - t) / release;
        } else {
          envelope = sustain;
        }

        // Apply wobble modulation and envelope
        data[i] = filteredSound * envelope * (0.3 + 0.7 * Math.abs(lfoValue));
      }
    }

    return buffer;
  }

  /**
   * Generate a bass drop impact sound
   */
  async generateBassDropImpact(duration: number = 0.5): Promise<AudioBuffer> {
    const sampleRate = this.audioContext.sampleRate;
    const length = Math.floor(duration * sampleRate);
    const buffer = this.audioContext.createBuffer(2, length, sampleRate);

    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);

      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;

        // Frequency sweep from high to low
        const startFreq = 200;
        const endFreq = 40;
        const freq = startFreq - (startFreq - endFreq) * (t / duration);

        // Generate kick-like sound with sine wave
        const kick = Math.sin(2 * Math.PI * freq * t);

        // Add noise for impact
        const noise = (Math.random() * 2 - 1) * 0.1;

        // Exponential decay envelope
        const envelope = Math.exp(-t * 8);

        data[i] = (kick * 0.9 + noise * 0.1) * envelope;
      }
    }

    return buffer;
  }

  /**
   * Generate electronic snare/clap sound
   */
  async generateSnare(duration: number = 0.15): Promise<AudioBuffer> {
    const sampleRate = this.audioContext.sampleRate;
    const length = Math.floor(duration * sampleRate);
    const buffer = this.audioContext.createBuffer(2, length, sampleRate);

    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);

      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;

        // Tonal component (200Hz and 300Hz)
        const tone1 = Math.sin(2 * Math.PI * 200 * t);
        const tone2 = Math.sin(2 * Math.PI * 300 * t);

        // Noise component (high-pass filtered)
        const noise = Math.random() * 2 - 1;

        // Fast decay envelope
        const envelope = Math.exp(-t * 40);

        // Mix tone and noise
        data[i] = ((tone1 + tone2) * 0.2 + noise * 0.8) * envelope * 0.5;
      }
    }

    return buffer;
  }

  /**
   * Generate hi-hat sound
   */
  async generateHiHat(duration: number = 0.08, closed: boolean = true): Promise<AudioBuffer> {
    const sampleRate = this.audioContext.sampleRate;
    const length = Math.floor(duration * sampleRate);
    const buffer = this.audioContext.createBuffer(2, length, sampleRate);

    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);

      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;

        // High-frequency square waves
        const square1 = Math.sign(Math.sin(2 * Math.PI * 318 * t));
        const square2 = Math.sign(Math.sin(2 * Math.PI * 522 * t));
        const square3 = Math.sign(Math.sin(2 * Math.PI * 730 * t));

        // Mix squares for metallic sound
        const metallic = (square1 + square2 + square3) / 3;

        // Add noise
        const noise = Math.random() * 2 - 1;

        // Envelope (faster for closed hi-hat)
        const decayRate = closed ? 60 : 30;
        const envelope = Math.exp(-t * decayRate);

        // Mix metallic and noise
        data[i] = (metallic * 0.3 + noise * 0.7) * envelope * 0.3;
      }
    }

    return buffer;
  }

  /**
   * Generate house-style kick drum
   */
  async generateHouseKick(duration: number = 0.5): Promise<AudioBuffer> {
    const sampleRate = this.audioContext.sampleRate;
    const length = Math.floor(duration * sampleRate);
    const buffer = this.audioContext.createBuffer(2, length, sampleRate);

    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);

      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;

        // Pitch envelope for kick
        const pitchStart = 150;
        const pitchEnd = 40;
        const pitchDecay = 0.05;
        const pitch = pitchEnd + (pitchStart - pitchEnd) * Math.exp(-t / pitchDecay);

        // Generate sine wave with pitch envelope
        const phase = 2 * Math.PI * pitch * t;
        const kick = Math.sin(phase);

        // Amplitude envelope
        const envelope = Math.exp(-t * 6);

        // Add a bit of click at the start
        const click = Math.exp(-t * 200) * 0.1;

        data[i] = (kick * envelope * 0.9 + click) * 0.8;
      }
    }

    return buffer;
  }

  /**
   * Generate synth pad for ElectroHouse
   */
  async generateSynthPad(
    frequency: number,
    duration: number,
    detune: number = 0
  ): Promise<AudioBuffer> {
    const sampleRate = this.audioContext.sampleRate;
    const length = Math.floor(duration * sampleRate);
    const buffer = this.audioContext.createBuffer(2, length, sampleRate);

    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      const detuneAmount = channel === 0 ? -detune : detune;

      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const freq = frequency * Math.pow(2, detuneAmount / 1200);

        // Multiple detuned oscillators for rich sound
        const osc1 = Math.sin(2 * Math.PI * freq * t);
        const osc2 = Math.sin(2 * Math.PI * freq * 1.01 * t);
        const osc3 = Math.sin(2 * Math.PI * freq * 0.99 * t);

        // Add sawtooth for brightness
        const sawPhase = (t * freq) % 1;
        const saw = 2 * sawPhase - 1;

        // Mix oscillators
        let sample = (osc1 + osc2 + osc3) / 3 * 0.7 + saw * 0.3;

        // Envelope (slow attack, long sustain)
        const attack = 0.1;
        const release = 0.3;
        let envelope = 1;

        if (t < attack) {
          envelope = t / attack;
        } else if (t > duration - release) {
          envelope = (duration - t) / release;
        }

        data[i] = sample * envelope * 0.3;
      }
    }

    return buffer;
  }

  /**
   * Generate pluck/stab sound for house music
   */
  async generatePluck(
    frequency: number,
    duration: number = 0.5
  ): Promise<AudioBuffer> {
    const sampleRate = this.audioContext.sampleRate;
    const length = Math.floor(duration * sampleRate);
    const buffer = this.audioContext.createBuffer(2, length, sampleRate);

    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);

      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;

        // Sawtooth wave with harmonics
        let sample = 0;
        for (let harmonic = 1; harmonic <= 8; harmonic++) {
          sample += Math.sin(2 * Math.PI * frequency * harmonic * t) / harmonic;
        }

        // Fast decay envelope for pluck effect
        const envelope = Math.exp(-t * 10);

        // Filter envelope
        const filterEnv = Math.exp(-t * 8);
        sample *= (0.3 + 0.7 * filterEnv);

        data[i] = sample * envelope * 0.4;
      }
    }

    return buffer;
  }

  /**
   * Generate white noise
   */
  generateNoise(duration: number): AudioBuffer {
    const sampleRate = this.audioContext.sampleRate;
    const length = Math.floor(duration * sampleRate);
    const buffer = this.audioContext.createBuffer(2, length, sampleRate);

    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    }

    return buffer;
  }
}

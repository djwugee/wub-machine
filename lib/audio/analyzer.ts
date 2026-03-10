/**
 * Audio Analyzer
 * Performs beat detection, tempo extraction, key detection, and section analysis
 * Using Web Audio API and FFT analysis
 */

export interface AudioAnalysis {
  beats: number[] // Beat times in seconds
  tempo: number // BPM
  key: string // Musical key (e.g., "C", "C#", "D", etc.)
  sections: AudioSection[]
  duration: number
  sampleRate: number
  loudness: number // RMS loudness
}

export interface AudioSection {
  type: 'intro' | 'verse' | 'chorus' | 'break' | 'outro'
  startTime: number
  duration: number
  confidence: number
}

// Chromatic pitch classes
const PITCH_CLASSES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
]

class AudioAnalyzer {
  private audioContext: AudioContext
  private fftSize = 2048
  private hopLength = 512

  constructor(audioContext?: AudioContext) {
    if (!audioContext) {
      this.audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)()
    } else {
      this.audioContext = audioContext
    }
  }

  /**
   * Analyze an AudioBuffer and extract musical information
   */
  async analyze(audioBuffer: AudioBuffer): Promise<AudioAnalysis> {
    console.log('[v0] Starting audio analysis...')

    const channelData = audioBuffer.getChannelData(0)
    const sampleRate = audioBuffer.sampleRate
    const duration = audioBuffer.duration

    // Run analysis in parallel
    const [beats, tempo, key, sections, loudness] = await Promise.all([
      this.detectBeats(channelData, sampleRate),
      this.estimateTempo(channelData, sampleRate),
      this.detectKey(channelData, sampleRate),
      this.detectSections(channelData, sampleRate, duration),
      this.calculateLoudness(channelData),
    ])

    console.log('[v0] Analysis complete. Detected:', {
      beats: beats.length,
      tempo,
      key,
      sections: sections.length,
    })

    return {
      beats,
      tempo,
      key,
      sections,
      duration,
      sampleRate,
      loudness,
    }
  }

  /**
   * Detect beats using spectral flux onset detection
   */
  private async detectBeats(
    channelData: Float32Array,
    sampleRate: number
  ): Promise<number[]> {
    const beats: number[] = []
    const hopLength = this.hopLength
    const fftSize = this.fftSize

    // Compute spectral flux
    const spectralFlux = this.computeSpectralFlux(
      channelData,
      fftSize,
      hopLength
    )

    // Smooth the flux
    const smoothed = this.gaussianSmooth(spectralFlux, 5)

    // Peak picking with adaptive threshold
    const peaks = this.findPeaks(smoothed, 0.1)

    // Convert peak indices to time (seconds)
    const beatTimes = peaks.map((i) => (i * hopLength) / sampleRate)

    // Remove duplicates and very close beats
    const minBeatDistance = 0.1 // 100ms minimum
    for (let i = 0; i < beatTimes.length; i++) {
      if (i === 0 || beatTimes[i] - beats[beats.length - 1] > minBeatDistance) {
        beats.push(beatTimes[i])
      }
    }

    return beats
  }

  /**
   * Estimate tempo from beats
   */
  private async estimateTempo(
    channelData: Float32Array,
    sampleRate: number
  ): Promise<number> {
    const beats = await this.detectBeats(channelData, sampleRate)

    if (beats.length < 2) {
      return 120 // Default tempo
    }

    // Calculate inter-beat intervals (IBIs)
    const ibis: number[] = []
    for (let i = 1; i < beats.length; i++) {
      ibis.push((beats[i] - beats[i - 1]) * 1000) // Convert to milliseconds
    }

    // Find the most common IBI (histogram-based)
    const histogram = new Map<number, number>()
    ibis.forEach((ib) => {
      // Round to nearest 10ms
      const rounded = Math.round(ib / 10) * 10
      histogram.set(rounded, (histogram.get(rounded) || 0) + 1)
    })

    let maxCount = 0
    let mostCommonIBI = 500 // Default 500ms = 120 BPM

    histogram.forEach((count, ib) => {
      if (count > maxCount) {
        maxCount = count
        mostCommonIBI = ib
      }
    })

    // Convert IBI (ms) to BPM: BPM = 60000 / IBI
    const tempo = Math.round(60000 / mostCommonIBI)

    // Clamp to reasonable range (60-180 BPM)
    return Math.max(60, Math.min(180, tempo))
  }

  /**
   * Detect musical key using chromatic energy method
   */
  private async detectKey(
    channelData: Float32Array,
    sampleRate: number
  ): Promise<string> {
    const fftSize = this.fftSize
    const hopLength = this.hopLength

    // Compute STFT magnitudes
    const magnitudes = this.computeSTFT(channelData, fftSize, hopLength)

    // Sum across time to get overall spectrum
    const spectrum = new Float32Array(magnitudes[0].length)
    for (let i = 0; i < magnitudes.length; i++) {
      for (let j = 0; j < magnitudes[i].length; j++) {
        spectrum[j] += magnitudes[i][j]
      }
    }

    // Map frequencies to chromatic pitches
    const chromaVector = this.frequencyToChroma(spectrum, sampleRate, fftSize)

    // Find pitch class with maximum energy
    let maxEnergy = 0
    let maxIndex = 0
    for (let i = 0; i < chromaVector.length; i++) {
      if (chromaVector[i] > maxEnergy) {
        maxEnergy = chromaVector[i]
        maxIndex = i
      }
    }

    return PITCH_CLASSES[maxIndex % 12] || 'C'
  }

  /**
   * Detect sections (intro, verse, chorus, break, outro)
   */
  private async detectSections(
    channelData: Float32Array,
    sampleRate: number,
    duration: number
  ): Promise<AudioSection[]> {
    const sections: AudioSection[] = []

    // Compute loudness over time
    const windowSize = Math.floor(sampleRate * 1) // 1-second windows
    const loudnessOverTime: number[] = []

    for (let i = 0; i < channelData.length; i += windowSize) {
      const window = channelData.slice(i, Math.min(i + windowSize, channelData.length))
      loudnessOverTime.push(this.calculateLoudness(window))
    }

    // Find silence/break regions
    const threshold = Math.max(...loudnessOverTime) * 0.2
    let inBreak = false
    let breakStart = 0

    for (let i = 0; i < loudnessOverTime.length; i++) {
      const time = (i * windowSize) / sampleRate
      const isQuiet = loudnessOverTime[i] < threshold

      if (isQuiet && !inBreak) {
        breakStart = time
        inBreak = true
      } else if (!isQuiet && inBreak) {
        sections.push({
          type: 'break',
          startTime: breakStart,
          duration: time - breakStart,
          confidence: 0.7,
        })
        inBreak = false
      }
    }

    // If no breaks detected, default to structure
    if (sections.length === 0) {
      const quarterDuration = duration / 4
      sections.push({
        type: 'intro',
        startTime: 0,
        duration: quarterDuration,
        confidence: 0.5,
      })
      sections.push({
        type: 'verse',
        startTime: quarterDuration,
        duration: quarterDuration * 1.5,
        confidence: 0.5,
      })
      sections.push({
        type: 'chorus',
        startTime: quarterDuration * 2.5,
        duration: quarterDuration * 1.5,
        confidence: 0.5,
      })
    }

    return sections
  }

  /**
   * Compute spectral flux (onset detection function)
   */
  private computeSpectralFlux(
    channelData: Float32Array,
    fftSize: number,
    hopLength: number
  ): Float32Array {
    const magnitudes = this.computeSTFT(channelData, fftSize, hopLength)
    const flux = new Float32Array(magnitudes.length)

    // Spectral flux = sum of positive differences between consecutive frames
    for (let i = 1; i < magnitudes.length; i++) {
      let sum = 0
      for (let j = 0; j < magnitudes[i].length; j++) {
        const diff = magnitudes[i][j] - magnitudes[i - 1][j]
        sum += Math.max(0, diff) // Only count increases
      }
      flux[i] = sum
    }

    return flux
  }

  /**
   * Compute Short-Time Fourier Transform (STFT)
   */
  private computeSTFT(
    channelData: Float32Array,
    fftSize: number,
    hopLength: number
  ): Float32Array[] {
    const magnitudes: Float32Array[] = []
    const window = this.hannWindow(fftSize)

    for (let i = 0; i < channelData.length - fftSize; i += hopLength) {
      const frame = channelData.slice(i, i + fftSize)

      // Apply window
      for (let j = 0; j < frame.length; j++) {
        frame[j] *= window[j]
      }

      // Compute FFT (simple implementation)
      const spectrum = this.simpleFft(frame)

      // Get magnitudes
      const mag = new Float32Array(spectrum.length / 2)
      for (let j = 0; j < mag.length; j++) {
        const real = spectrum[j * 2]
        const imag = spectrum[j * 2 + 1]
        mag[j] = Math.sqrt(real * real + imag * imag) + 1e-10 // Add small epsilon
      }

      magnitudes.push(mag)
    }

    return magnitudes
  }

  /**
   * Simple FFT implementation (Cooley-Tukey)
   */
  private simpleFft(data: Float32Array): Float32Array {
    const n = data.length
    if (n <= 1) return data

    // Pad to next power of 2
    let size = 1
    while (size < n) size *= 2

    const padded = new Float32Array(size * 2)
    for (let i = 0; i < n; i++) {
      padded[i * 2] = data[i]
      padded[i * 2 + 1] = 0
    }

    // Bit reversal
    for (let i = 0; i < size; i++) {
      let j = 0
      for (let k = 1; k < size; k *= 2) {
        j = j * 2 + ((i & k) !== 0 ? 1 : 0)
      }
      if (j > i) {
        const temp = padded[i * 2]
        padded[i * 2] = padded[j * 2]
        padded[j * 2] = temp

        const temp2 = padded[i * 2 + 1]
        padded[i * 2 + 1] = padded[j * 2 + 1]
        padded[j * 2 + 1] = temp2
      }
    }

    // Cooley-Tukey FFT
    for (let s = 1; s <= Math.log2(size); s++) {
      const m = 1 << s
      const mh = m / 2
      for (let k = 0; k < size; k += m) {
        for (let j = 0; j < mh; j++) {
          const angle = (-2 * Math.PI * j) / m
          const wr = Math.cos(angle)
          const wi = Math.sin(angle)

          const i1 = k + j
          const i2 = k + j + mh

          const real1 = padded[i1 * 2]
          const imag1 = padded[i1 * 2 + 1]
          const real2 = padded[i2 * 2]
          const imag2 = padded[i2 * 2 + 1]

          const mul_real = real2 * wr - imag2 * wi
          const mul_imag = real2 * wi + imag2 * wr

          padded[i2 * 2] = real1 - mul_real
          padded[i2 * 2 + 1] = imag1 - mul_imag
          padded[i1 * 2] = real1 + mul_real
          padded[i1 * 2 + 1] = imag1 + mul_imag
        }
      }
    }

    return padded
  }

  /**
   * Hann window for spectral analysis
   */
  private hannWindow(size: number): Float32Array {
    const window = new Float32Array(size)
    for (let i = 0; i < size; i++) {
      window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)))
    }
    return window
  }

  /**
   * Map frequency bins to chromatic pitches
   */
  private frequencyToChroma(
    spectrum: Float32Array,
    sampleRate: number,
    fftSize: number
  ): Float32Array {
    const chromaVector = new Float32Array(12)
    const freqResolution = sampleRate / fftSize

    // A4 = 440 Hz
    const referenceFreq = 440
    const referenceNote = 9 // A
    const referenceOctave = 4

    for (let k = 1; k < spectrum.length; k++) {
      const freq = k * freqResolution
      if (freq > 20000) break // Ignore above 20kHz

      // Compute pitch class
      const noteNumber =
        12 * Math.log2(freq / referenceFreq) +
        referenceNote +
        referenceOctave * 12

      const pitchClass = ((noteNumber % 12) + 12) % 12
      chromaVector[Math.round(pitchClass)] += spectrum[k]
    }

    return chromaVector
  }

  /**
   * Find peaks in an array
   */
  private findPeaks(data: Float32Array, threshold: number): number[] {
    const peaks: number[] = []

    for (let i = 1; i < data.length - 1; i++) {
      if (data[i] > threshold && data[i] > data[i - 1] && data[i] > data[i + 1]) {
        peaks.push(i)
      }
    }

    return peaks
  }

  /**
   * Gaussian smoothing
   */
  private gaussianSmooth(
    data: Float32Array,
    sigma: number
  ): Float32Array {
    const size = Math.ceil(sigma * 3) * 2 + 1
    const kernel = new Float32Array(size)
    const sum = 0
    const center = Math.floor(size / 2)

    let total = 0
    for (let i = 0; i < size; i++) {
      const x = i - center
      kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma))
      total += kernel[i]
    }

    // Normalize kernel
    for (let i = 0; i < size; i++) {
      kernel[i] /= total
    }

    // Convolve
    const result = new Float32Array(data.length)
    for (let i = 0; i < data.length; i++) {
      let sum = 0
      for (let j = 0; j < size; j++) {
        const idx = i + j - center
        if (idx >= 0 && idx < data.length) {
          sum += data[idx] * kernel[j]
        }
      }
      result[i] = sum
    }

    return result
  }

  /**
   * Calculate RMS loudness
   */
  private calculateLoudness(channelData: Float32Array): number {
    let sum = 0
    for (let i = 0; i < channelData.length; i++) {
      sum += channelData[i] * channelData[i]
    }
    return Math.sqrt(sum / channelData.length)
  }
}

export function getAudioAnalyzer(
  audioContext?: AudioContext
): AudioAnalyzer {
  return new AudioAnalyzer(audioContext)
}

/**
 * Core Audio Engine for the Wub Machine
 * Provides audio loading, analysis, DSP operations, and encoding
 * entirely client-side via Web Audio API.
 *
 * Ports the Python Remixer, FastModify, and helpers to TypeScript.
 */

export interface AudioAnalysis {
  tempo: number
  beatTimes: number[]
  barTimes: [number, number][]
  sections: [number, number][]
  tonic: number
  sampleRate: number
  duration: number
  chromaEnergies: Float32Array
}

export interface SongMetadata {
  title?: string
  artist?: string
  album?: string
  artwork?: string // data URL
  duration?: number
  sampleRate?: number
  channels?: number
}

export type ProgressCallback = (text: string, progress: number) => void

let audioContextInstance: AudioContext | null = null

export function getAudioContext(): AudioContext {
  if (!audioContextInstance) {
    audioContextInstance = new AudioContext({ sampleRate: 44100 })
  }
  if (audioContextInstance.state === "suspended") {
    audioContextInstance.resume()
  }
  return audioContextInstance
}

/**
 * Decode an audio file (MP3, WAV, M4A, OGG) into a stereo Float32Array pair.
 * Returns [leftChannel, rightChannel, sampleRate].
 */
export async function decodeAudioFile(
  file: File
): Promise<{ left: Float32Array; right: Float32Array; sampleRate: number; duration: number }> {
  const ctx = getAudioContext()
  const arrayBuffer = await file.arrayBuffer()
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
  const sampleRate = audioBuffer.sampleRate
  const duration = audioBuffer.duration

  const left = audioBuffer.getChannelData(0)
  const right = audioBuffer.numberOfChannels >= 2
    ? audioBuffer.getChannelData(1)
    : new Float32Array(left)

  return { left: new Float32Array(left), right: new Float32Array(right), sampleRate, duration }
}

/**
 * Create a mono mix from stereo channels.
 */
export function toMono(left: Float32Array, right: Float32Array): Float32Array {
  const mono = new Float32Array(left.length)
  for (let i = 0; i < left.length; i++) {
    mono[i] = (left[i] + right[i]) * 0.5
  }
  return mono
}

/**
 * RMS energy of a signal segment.
 */
export function rms(signal: Float32Array, start = 0, end?: number): number {
  const e = end ?? signal.length
  if (e <= start) return 0
  let sum = 0
  for (let i = start; i < e; i++) {
    sum += signal[i] * signal[i]
  }
  return Math.sqrt(sum / (e - start))
}

/**
 * Compute chroma features (12 pitch classes) from a mono signal using FFT.
 * Returns a Float32Array of 12 values representing energy per pitch class.
 */
export function computeChroma(mono: Float32Array, sampleRate: number): Float32Array {
  const chroma = new Float32Array(12)
  const fftSize = 4096
  const numFrames = Math.floor(mono.length / (fftSize / 2)) - 1

  if (numFrames <= 0) {
    // Too short for analysis, return uniform
    chroma.fill(1 / 12)
    return chroma
  }

  const ctx = getAudioContext()
  const analyser = ctx.createAnalyser()
  analyser.fftSize = fftSize
  const freqBins = analyser.frequencyBinCount

  // Manual DFT-based chroma extraction for offline processing
  // We use a simplified approach: bin each FFT frequency to nearest pitch class
  const hopSize = fftSize / 2
  const window = new Float32Array(fftSize)
  // Hanning window
  for (let i = 0; i < fftSize; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)))
  }

  for (let frame = 0; frame < numFrames; frame++) {
    const offset = frame * hopSize
    // Apply window and compute power spectrum
    const real = new Float32Array(fftSize)
    const imag = new Float32Array(fftSize)
    for (let i = 0; i < fftSize && offset + i < mono.length; i++) {
      real[i] = mono[offset + i] * window[i]
    }

    // Simple DFT for the relevant frequency range (we only need magnitude)
    // For performance, we compute only for bins that map to musical notes
    const minFreq = 65.0  // C2
    const maxFreq = 4200.0 // C8 roughly
    const minBin = Math.floor(minFreq * fftSize / sampleRate)
    const maxBin = Math.min(Math.ceil(maxFreq * fftSize / sampleRate), fftSize / 2)

    for (let k = minBin; k < maxBin; k++) {
      let re = 0, im = 0
      const freq = k * sampleRate / fftSize
      for (let n = 0; n < fftSize && offset + n < mono.length; n++) {
        const angle = -2 * Math.PI * k * n / fftSize
        re += real[n] * Math.cos(angle)
        im += real[n] * Math.sin(angle)
      }
      const magnitude = Math.sqrt(re * re + im * im)

      // Map frequency to pitch class
      if (freq > 0) {
        const pitchClass = Math.round(12 * Math.log2(freq / 440)) % 12
        const normalizedPitch = ((pitchClass % 12) + 12) % 12
        chroma[normalizedPitch] += magnitude * magnitude
      }
    }
  }

  return chroma
}

/**
 * Fast chroma computation using autocorrelation-based approach.
 * Much faster than full DFT - suitable for per-beat analysis.
 */
export function computeChromaFast(mono: Float32Array, sampleRate: number): Float32Array {
  const chroma = new Float32Array(12)

  if (mono.length < 512) {
    chroma.fill(1 / 12)
    return chroma
  }

  // Use a simplified energy-band approach with Goertzel algorithm
  // for each of the 12 pitch classes across multiple octaves
  const referenceFreqs = [
    261.63, 277.18, 293.66, 311.13, 329.63, 349.23,
    369.99, 392.00, 415.30, 440.00, 466.16, 493.88
  ] // C4 through B4

  const octaves = [0.5, 1.0, 2.0, 4.0] // C2-C6 range

  for (let pc = 0; pc < 12; pc++) {
    let totalEnergy = 0
    for (const octave of octaves) {
      const freq = referenceFreqs[pc] * octave
      if (freq < sampleRate / 2) {
        totalEnergy += goertzelMagnitude(mono, sampleRate, freq)
      }
    }
    chroma[pc] = totalEnergy
  }

  return chroma
}

/**
 * Goertzel algorithm - efficient single-frequency DFT computation.
 */
function goertzelMagnitude(signal: Float32Array, sampleRate: number, targetFreq: number): number {
  const N = Math.min(signal.length, 8192) // Limit for performance
  const k = Math.round(N * targetFreq / sampleRate)
  const w = (2 * Math.PI * k) / N
  const coeff = 2 * Math.cos(w)
  let s0 = 0, s1 = 0, s2 = 0

  for (let i = 0; i < N; i++) {
    s0 = signal[i] + coeff * s1 - s2
    s2 = s1
    s1 = s0
  }

  return s1 * s1 + s2 * s2 - coeff * s1 * s2
}

/**
 * Beat detection using onset detection function and peak picking.
 * Returns an array of beat times in seconds.
 */
export function detectBeats(mono: Float32Array, sampleRate: number): { tempo: number; beatTimes: number[] } {
  const hopSize = 512
  const frameSize = 1024

  // Compute onset strength envelope using spectral flux
  const numFrames = Math.floor((mono.length - frameSize) / hopSize)
  if (numFrames < 4) {
    return { tempo: 120, beatTimes: [] }
  }

  const onset = new Float32Array(numFrames)
  let prevSpectrum: Float32Array | null = null

  for (let frame = 0; frame < numFrames; frame++) {
    const offset = frame * hopSize
    // Simple magnitude spectrum
    const spectrum = new Float32Array(frameSize / 2)
    for (let i = 0; i < frameSize && offset + i < mono.length; i++) {
      // Simplified: use absolute values of windowed signal bands
      const bin = Math.floor(i / 2)
      if (bin < spectrum.length) {
        const windowed = mono[offset + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / frameSize))
        spectrum[bin] += Math.abs(windowed)
      }
    }

    if (prevSpectrum) {
      let flux = 0
      for (let i = 0; i < spectrum.length; i++) {
        const diff = spectrum[i] - prevSpectrum[i]
        if (diff > 0) flux += diff
      }
      onset[frame] = flux
    }
    prevSpectrum = spectrum
  }

  // Normalize onset envelope
  let maxOnset = 0
  for (let i = 0; i < onset.length; i++) {
    if (onset[i] > maxOnset) maxOnset = onset[i]
  }
  if (maxOnset > 0) {
    for (let i = 0; i < onset.length; i++) {
      onset[i] /= maxOnset
    }
  }

  // Tempo estimation via autocorrelation of onset envelope
  const minBPM = 60
  const maxBPM = 200
  const minLag = Math.floor((60 / maxBPM) * sampleRate / hopSize)
  const maxLag = Math.floor((60 / minBPM) * sampleRate / hopSize)

  let bestLag = minLag
  let bestCorr = -Infinity

  for (let lag = minLag; lag <= Math.min(maxLag, onset.length - 1); lag++) {
    let corr = 0
    const limit = Math.min(onset.length - lag, onset.length)
    for (let i = 0; i < limit; i++) {
      corr += onset[i] * onset[i + lag]
    }
    // Weight towards common tempos (around 120 BPM)
    const bpmForLag = (60 * sampleRate) / (lag * hopSize)
    const tempoWeight = 1.0 - 0.3 * Math.abs(bpmForLag - 120) / 120
    corr *= tempoWeight

    if (corr > bestCorr) {
      bestCorr = corr
      bestLag = lag
    }
  }

  const tempo = Math.round((60 * sampleRate) / (bestLag * hopSize))
  const beatPeriodSamples = bestLag * hopSize
  const beatPeriodSeconds = beatPeriodSamples / sampleRate

  // Generate beat grid aligned to onset peaks
  const beatTimes: number[] = []

  // Find the strongest onset peak in the first few seconds to anchor beat grid
  let bestStartFrame = 0
  let bestStartVal = 0
  const searchFrames = Math.min(Math.floor(2 * sampleRate / hopSize), onset.length)
  for (let i = 0; i < searchFrames; i++) {
    if (onset[i] > bestStartVal) {
      bestStartVal = onset[i]
      bestStartFrame = i
    }
  }

  const firstBeatTime = (bestStartFrame * hopSize) / sampleRate
  const duration = mono.length / sampleRate

  // Generate beat grid
  let t = firstBeatTime
  while (t < duration) {
    if (t >= 0) {
      beatTimes.push(t)
    }
    t += beatPeriodSeconds
  }

  // Also fill backwards from first beat
  t = firstBeatTime - beatPeriodSeconds
  const prependBeats: number[] = []
  while (t >= 0) {
    prependBeats.unshift(t)
    t -= beatPeriodSeconds
  }
  beatTimes.unshift(...prependBeats)

  return { tempo, beatTimes }
}

/**
 * Detect sections by analyzing energy changes over time.
 * Returns array of [startTime, endTime] tuples.
 */
export function detectSections(mono: Float32Array, sampleRate: number): [number, number][] {
  const duration = mono.length / sampleRate
  const windowSec = 0.5
  const hopSec = 0.25
  const windowSamples = Math.floor(windowSec * sampleRate)
  const hopSamples = Math.floor(hopSec * sampleRate)

  const energies: number[] = []
  for (let i = 0; i + windowSamples < mono.length; i += hopSamples) {
    energies.push(rms(mono, i, i + windowSamples))
  }

  if (energies.length < 4) {
    return [[0, duration]]
  }

  // Smooth energies
  const smoothed = new Float32Array(energies.length)
  const smoothWindow = 4
  for (let i = 0; i < energies.length; i++) {
    let sum = 0
    let count = 0
    for (let j = Math.max(0, i - smoothWindow); j <= Math.min(energies.length - 1, i + smoothWindow); j++) {
      sum += energies[j]
      count++
    }
    smoothed[i] = sum / count
  }

  // Detect significant changes in energy as section boundaries
  const boundaries: number[] = [0]
  const threshold = 0.15
  const minSectionFrames = Math.floor(4 / hopSec) // At least 4 seconds per section

  let lastBoundary = 0
  for (let i = 1; i < smoothed.length; i++) {
    if (i - lastBoundary < minSectionFrames) continue
    const change = Math.abs(smoothed[i] - smoothed[i - 1]) / (Math.max(smoothed[i], smoothed[i - 1]) + 0.001)
    if (change > threshold) {
      boundaries.push(i)
      lastBoundary = i
    }
  }

  // Convert frame indices to time-based sections
  const sections: [number, number][] = []
  for (let i = 0; i < boundaries.length; i++) {
    const startTime = boundaries[i] * hopSec
    const endTime = i + 1 < boundaries.length
      ? boundaries[i + 1] * hopSec
      : duration
    if (endTime > startTime) {
      sections.push([startTime, endTime])
    }
  }

  // Ensure we have at least one section
  if (sections.length === 0) {
    sections.push([0, duration])
  }

  return sections
}

/**
 * Full audio analysis: tempo, beats, sections, key (tonic).
 */
export function analyzeAudio(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number
): AudioAnalysis {
  const mono = toMono(left, right)
  const duration = mono.length / sampleRate

  // Beat detection
  const { tempo, beatTimes } = detectBeats(mono, sampleRate)

  // Section detection
  const sections = detectSections(mono, sampleRate)

  // Bar detection (group beats into bars of 4)
  const barTimes: [number, number][] = []
  const beatsPerBar = 4
  const beatDuration = 60.0 / tempo
  for (let i = 0; i < beatTimes.length; i += beatsPerBar) {
    const barStart = beatTimes[i]
    const barEnd = i + beatsPerBar < beatTimes.length
      ? beatTimes[i + beatsPerBar]
      : beatTimes[beatTimes.length - 1] + beatDuration
    barTimes.push([barStart, Math.min(barEnd, duration)])
  }

  // Key detection via chroma
  const chromaEnergies = computeChromaFast(mono, sampleRate)
  let tonic = 0
  let maxEnergy = 0
  for (let i = 0; i < 12; i++) {
    if (chromaEnergies[i] > maxEnergy) {
      maxEnergy = chromaEnergies[i]
      tonic = i
    }
  }

  return {
    tempo,
    beatTimes,
    barTimes,
    sections,
    tonic,
    sampleRate,
    duration,
    chromaEnergies,
  }
}

// =============================================================================
// DSP Operations
// =============================================================================

/**
 * Extract a segment from stereo audio by time range.
 */
export function extractSegment(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
  startTime: number,
  endTime: number
): { left: Float32Array; right: Float32Array } {
  const startSample = Math.max(0, Math.floor(startTime * sampleRate))
  const endSample = Math.min(left.length, Math.floor(endTime * sampleRate))
  if (endSample <= startSample) {
    return { left: new Float32Array(1), right: new Float32Array(1) }
  }
  return {
    left: left.slice(startSample, endSample),
    right: right.slice(startSample, endSample),
  }
}

/**
 * Concatenate multiple stereo audio segments.
 */
export function concatenateSegments(
  segments: { left: Float32Array; right: Float32Array }[]
): { left: Float32Array; right: Float32Array } {
  if (segments.length === 0) {
    return { left: new Float32Array(0), right: new Float32Array(0) }
  }
  const totalLength = segments.reduce((sum, s) => sum + s.left.length, 0)
  const left = new Float32Array(totalLength)
  const right = new Float32Array(totalLength)
  let offset = 0
  for (const seg of segments) {
    left.set(seg.left, offset)
    right.set(seg.right, offset)
    offset += seg.left.length
  }
  return { left, right }
}

/**
 * Truncate-mix two stereo audio buffers.
 * mix: 0-1, where 1 means full audio A, 0 means full audio B.
 */
export function truncateMix(
  aLeft: Float32Array,
  aRight: Float32Array,
  bLeft: Float32Array,
  bRight: Float32Array,
  mix: number
): { left: Float32Array; right: Float32Array } {
  const len = aLeft.length
  const left = new Float32Array(len)
  const right = new Float32Array(len)
  const mixB = 1 - mix
  const bLen = bLeft.length

  for (let i = 0; i < len; i++) {
    const bSample = i < bLen ? bLeft[i] : 0
    left[i] = aLeft[i] * mix + bSample * mixB
  }
  for (let i = 0; i < len; i++) {
    const bSample = i < bLen ? bRight[i] : 0
    right[i] = aRight[i] * mix + bSample * mixB
  }

  return { left, right }
}

/**
 * Phase vocoder tempo shifting.
 * Stretches audio by ratio without changing pitch.
 * ratio > 1 = faster, ratio < 1 = slower.
 */
export function shiftTempo(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
  ratio: number
): { left: Float32Array; right: Float32Array } {
  if (ratio <= 0 || ratio > 10) {
    throw new Error("Ratio must be between 0 and 10")
  }
  if (Math.abs(ratio - 1) < 0.01) {
    return { left: new Float32Array(left), right: new Float32Array(right) }
  }

  // Phase vocoder implementation
  const fftSize = 2048
  const hopIn = fftSize / 4
  const hopOut = Math.round(hopIn / ratio)
  const outputLength = Math.round(left.length / ratio)

  const processChannel = (input: Float32Array): Float32Array => {
    const output = new Float32Array(outputLength)
    const window = new Float32Array(fftSize)
    for (let i = 0; i < fftSize; i++) {
      window[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (fftSize - 1)))
    }

    const prevPhase = new Float32Array(fftSize)
    const sumPhase = new Float32Array(fftSize)
    const freqPerBin = sampleRate / fftSize
    const expectedPhaseAdvance = 2 * Math.PI * hopIn / fftSize

    let outputPos = 0
    for (let inputPos = 0; inputPos + fftSize < input.length; inputPos += hopIn) {
      if (outputPos + fftSize >= outputLength) break

      // Window the input frame
      const frame = new Float32Array(fftSize)
      for (let i = 0; i < fftSize; i++) {
        frame[i] = input[inputPos + i] * window[i]
      }

      // Forward FFT (simplified real FFT using sine/cosine)
      const real = new Float32Array(fftSize / 2 + 1)
      const imag = new Float32Array(fftSize / 2 + 1)
      for (let k = 0; k <= fftSize / 2; k++) {
        for (let n = 0; n < fftSize; n++) {
          const angle = -2 * Math.PI * k * n / fftSize
          real[k] += frame[n] * Math.cos(angle)
          imag[k] += frame[n] * Math.sin(angle)
        }
      }

      // Analysis: compute magnitude and phase
      const magnitude = new Float32Array(fftSize / 2 + 1)
      const phase = new Float32Array(fftSize / 2 + 1)
      for (let k = 0; k <= fftSize / 2; k++) {
        magnitude[k] = Math.sqrt(real[k] * real[k] + imag[k] * imag[k])
        phase[k] = Math.atan2(imag[k], real[k])
      }

      // Phase difference and accumulation
      for (let k = 0; k <= fftSize / 2; k++) {
        let phaseDiff = phase[k] - prevPhase[k] - k * expectedPhaseAdvance
        // Wrap to [-PI, PI]
        phaseDiff = phaseDiff - 2 * Math.PI * Math.round(phaseDiff / (2 * Math.PI))
        const trueFreq = k * freqPerBin + phaseDiff * freqPerBin / expectedPhaseAdvance

        sumPhase[k] += 2 * Math.PI * trueFreq * hopOut / sampleRate
        prevPhase[k] = phase[k]
      }

      // Inverse FFT with new phases
      const outFrame = new Float32Array(fftSize)
      for (let n = 0; n < fftSize; n++) {
        let val = 0
        for (let k = 0; k <= fftSize / 2; k++) {
          const angle = 2 * Math.PI * k * n / fftSize
          val += magnitude[k] * Math.cos(sumPhase[k] + angle)
        }
        outFrame[n] = val * window[n] / (fftSize / 2)
      }

      // Overlap-add to output
      for (let i = 0; i < fftSize && outputPos + i < outputLength; i++) {
        output[outputPos + i] += outFrame[i]
      }
      outputPos += hopOut
    }

    return output
  }

  return {
    left: processChannel(left),
    right: processChannel(right),
  }
}

/**
 * Simplified tempo shifting using linear interpolation (resampling).
 * Much faster than phase vocoder, acceptable quality for rhythm-focused remixes.
 * ratio > 1 = faster (shorter output), ratio < 1 = slower.
 */
export function shiftTempoFast(
  left: Float32Array,
  right: Float32Array,
  ratio: number
): { left: Float32Array; right: Float32Array } {
  if (ratio <= 0 || ratio > 10) {
    throw new Error("Ratio must be between 0 and 10")
  }
  if (Math.abs(ratio - 1) < 0.001) {
    return { left: new Float32Array(left), right: new Float32Array(right) }
  }

  const outputLength = Math.floor(left.length / ratio)
  const outLeft = new Float32Array(outputLength)
  const outRight = new Float32Array(outputLength)

  for (let i = 0; i < outputLength; i++) {
    const srcPos = i * ratio
    const srcIndex = Math.floor(srcPos)
    const frac = srcPos - srcIndex

    if (srcIndex + 1 < left.length) {
      outLeft[i] = left[srcIndex] * (1 - frac) + left[srcIndex + 1] * frac
      outRight[i] = right[srcIndex] * (1 - frac) + right[srcIndex + 1] * frac
    } else if (srcIndex < left.length) {
      outLeft[i] = left[srcIndex]
      outRight[i] = right[srcIndex]
    }
  }

  return { left: outLeft, right: outRight }
}

/**
 * Create silence of a given duration.
 */
export function createSilence(sampleRate: number, durationSec: number): { left: Float32Array; right: Float32Array } {
  const samples = Math.floor(sampleRate * durationSec)
  return { left: new Float32Array(samples), right: new Float32Array(samples) }
}

/**
 * Mix two stereo signals by adding them together (with optional gain per signal).
 * Output length matches the longer signal.
 */
export function mixSignals(
  aL: Float32Array, aR: Float32Array, gainA: number,
  bL: Float32Array, bR: Float32Array, gainB: number,
): { left: Float32Array; right: Float32Array } {
  const len = Math.max(aL.length, bL.length)
  const left = new Float32Array(len)
  const right = new Float32Array(len)

  for (let i = 0; i < len; i++) {
    const aVal = i < aL.length ? aL[i] : 0
    const bVal = i < bL.length ? bL[i] : 0
    left[i] = aVal * gainA + bVal * gainB
  }
  for (let i = 0; i < len; i++) {
    const aVal = i < aR.length ? aR[i] : 0
    const bVal = i < bR.length ? bR[i] : 0
    right[i] = aVal * gainA + bVal * gainB
  }

  return { left, right }
}

/**
 * Pad or trim a stereo signal to a specific length in samples.
 */
export function padOrTrim(
  left: Float32Array,
  right: Float32Array,
  targetSamples: number
): { left: Float32Array; right: Float32Array } {
  if (left.length >= targetSamples) {
    return {
      left: left.slice(0, targetSamples),
      right: right.slice(0, targetSamples),
    }
  }
  const newLeft = new Float32Array(targetSamples)
  const newRight = new Float32Array(targetSamples)
  newLeft.set(left)
  newRight.set(right)
  return { left: newLeft, right: newRight }
}

/**
 * Fetch and decode a WAV sample file from a URL.
 */
export async function loadSample(url: string, targetSr?: number): Promise<{ left: Float32Array; right: Float32Array; sampleRate: number }> {
  const ctx = getAudioContext()
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to load sample: ${url}`)
  const arrayBuffer = await response.arrayBuffer()
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer)

  const left = new Float32Array(audioBuffer.getChannelData(0))
  const right = audioBuffer.numberOfChannels >= 2
    ? new Float32Array(audioBuffer.getChannelData(1))
    : new Float32Array(left)

  return { left, right, sampleRate: audioBuffer.sampleRate }
}

/**
 * Compute dominant pitch class (0-11) for a mono signal segment.
 */
export function dominantPitchClass(mono: Float32Array, sampleRate: number): number {
  const chroma = computeChromaFast(mono, sampleRate)
  let best = 0
  let bestVal = 0
  for (let i = 0; i < 12; i++) {
    if (chroma[i] > bestVal) {
      bestVal = chroma[i]
      best = i
    }
  }
  return best
}

/**
 * Compute mixfactor based on RMS loudness of a segment.
 * Higher RMS = less overlay (lower mixfactor).
 * Returns a value between 0.3 and 0.8.
 */
export function computeMixfactor(left: Float32Array, right: Float32Array): number {
  const mono = toMono(left, right)
  const segRms = rms(mono)

  const rmsLow = 0.0
  const wubHigh = 0.8
  const rmsHigh = 0.5
  const wubLow = 0.3

  if (segRms <= rmsLow) return wubHigh
  if (segRms >= rmsHigh) return wubLow

  return wubHigh + (segRms - rmsLow) * (wubLow - wubHigh) / (rmsHigh - rmsLow)
}

// =============================================================================
// MP3 Encoding
// =============================================================================

/**
 * Encode stereo Float32Array data to MP3 using lamejs.
 * Returns a Blob containing the MP3.
 */
export async function encodeToMp3(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
  onProgress?: (p: number) => void
): Promise<Blob> {
  // Dynamic import lamejs
  const lamejs = await import("lamejs")
  const mp3encoder = new lamejs.Mp3Encoder(2, sampleRate, 192) // stereo, 192 kbps

  const mp3Data: Int8Array[] = []
  const blockSize = 1152

  // Convert Float32 [-1, 1] to Int16 [-32768, 32767]
  const leftInt16 = new Int16Array(left.length)
  const rightInt16 = new Int16Array(right.length)
  for (let i = 0; i < left.length; i++) {
    leftInt16[i] = Math.max(-32768, Math.min(32767, Math.round(left[i] * 32767)))
    rightInt16[i] = Math.max(-32768, Math.min(32767, Math.round(right[i] * 32767)))
  }

  const totalBlocks = Math.ceil(leftInt16.length / blockSize)
  for (let i = 0; i < leftInt16.length; i += blockSize) {
    const leftChunk = leftInt16.subarray(i, i + blockSize)
    const rightChunk = rightInt16.subarray(i, i + blockSize)
    const mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk)
    if (mp3buf.length > 0) {
      mp3Data.push(new Int8Array(mp3buf))
    }
    if (onProgress) {
      onProgress(Math.min(i / leftInt16.length, 0.99))
    }
  }

  const lastBuf = mp3encoder.flush()
  if (lastBuf.length > 0) {
    mp3Data.push(new Int8Array(lastBuf))
  }

  if (onProgress) onProgress(1)

  return new Blob(mp3Data, { type: "audio/mpeg" })
}

/**
 * Encode stereo Float32Array data to WAV.
 * Returns a Blob containing the WAV.
 */
export function encodeToWav(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number
): Blob {
  const numChannels = 2
  const bitsPerSample = 16
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8)
  const blockAlign = numChannels * (bitsPerSample / 8)
  const dataSize = left.length * numChannels * (bitsPerSample / 8)
  const headerSize = 44
  const buffer = new ArrayBuffer(headerSize + dataSize)
  const view = new DataView(buffer)

  // RIFF header
  writeString(view, 0, "RIFF")
  view.setUint32(4, 36 + dataSize, true)
  writeString(view, 8, "WAVE")

  // fmt sub-chunk
  writeString(view, 12, "fmt ")
  view.setUint32(16, 16, true) // sub-chunk size
  view.setUint16(20, 1, true) // PCM format
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)

  // data sub-chunk
  writeString(view, 36, "data")
  view.setUint32(40, dataSize, true)

  let offset = 44
  for (let i = 0; i < left.length; i++) {
    const leftSample = Math.max(-32768, Math.min(32767, Math.round(left[i] * 32767)))
    const rightSample = Math.max(-32768, Math.min(32767, Math.round(right[i] * 32767)))
    view.setInt16(offset, leftSample, true)
    offset += 2
    view.setInt16(offset, rightSample, true)
    offset += 2
  }

  return new Blob([buffer], { type: "audio/wav" })
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i))
  }
}

// =============================================================================
// Metadata extraction
// =============================================================================

/**
 * Extract metadata from an audio file using music-metadata-browser.
 */
export async function extractMetadata(file: File): Promise<SongMetadata> {
  try {
    const mm = await import("music-metadata-browser")
    const metadata = await mm.parseBlob(file)
    const tag: SongMetadata = {}

    if (metadata.common.title) tag.title = metadata.common.title
    if (metadata.common.artist) tag.artist = metadata.common.artist
    if (metadata.common.album) tag.album = metadata.common.album
    if (metadata.format.duration) tag.duration = metadata.format.duration
    if (metadata.format.sampleRate) tag.sampleRate = metadata.format.sampleRate
    if (metadata.format.numberOfChannels) tag.channels = metadata.format.numberOfChannels

    // Extract artwork
    if (metadata.common.picture && metadata.common.picture.length > 0) {
      const pic = metadata.common.picture[0]
      const blob = new Blob([pic.data], { type: pic.format })
      tag.artwork = URL.createObjectURL(blob)
    }

    return tag
  } catch {
    return {}
  }
}

// =============================================================================
// Audio Playback
// =============================================================================

/**
 * Create an AudioBuffer from stereo Float32Array data for Web Audio API playback.
 */
export function createAudioBuffer(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number
): AudioBuffer {
  const ctx = getAudioContext()
  const buffer = ctx.createBuffer(2, left.length, sampleRate)
  buffer.copyToChannel(left, 0)
  buffer.copyToChannel(right, 1)
  return buffer
}

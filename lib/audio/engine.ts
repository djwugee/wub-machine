/**
 * Wub Machine — real client-side audio DSP engine.
 *
 * Everything here runs in the browser using the native Web Audio API.
 * No backend, no WASM toolchain. Decoding, tempo/beat analysis, remixing
 * (Dubstep + ElectroHouse) and WAV export are all performed locally.
 */

export type RemixStyle = "dubstep" | "electrohouse"

export interface DubstepParams {
  /** Wobble cycles per beat (LFO sync). */
  wobbleRate: number
  /** Sub/bass emphasis, 0–1. */
  bassBoost: number
  /** Waveshaper drive for bass grit, 0–1. */
  grit: number
  /** Wet/dry balance of the processed signal, 0–1. */
  wetMix: number
}

export interface ElectroHouseParams {
  /** Sidechain pump depth, 0–1. */
  pump: number
  /** Synth kick level, 0–1. */
  kickLevel: number
  /** Off-beat hat level, 0–1. */
  hatLevel: number
  /** Wet/dry balance, 0–1. */
  wetMix: number
}

export type RemixParams = {
  dubstep: DubstepParams
  electrohouse: ElectroHouseParams
}

export const DEFAULT_PARAMS: RemixParams = {
  dubstep: { wobbleRate: 1, bassBoost: 0.7, grit: 0.35, wetMix: 0.85 },
  electrohouse: { pump: 0.7, kickLevel: 0.6, hatLevel: 0.4, wetMix: 0.85 },
}

export interface AnalysisResult {
  tempo: number
  beats: number[]
  duration: number
  sampleRate: number
  /** Normalized peak envelope (−1..1 magnitude) for waveform rendering. */
  peaks: number[]
}

/** Lazily-created shared AudioContext for decoding + playback. */
let sharedCtx: AudioContext | null = null
export function getAudioContext(): AudioContext {
  if (typeof window === "undefined") {
    throw new Error("AudioContext is only available in the browser")
  }
  if (!sharedCtx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    sharedCtx = new Ctor()
  }
  return sharedCtx
}

/** Decode an uploaded file into an AudioBuffer. */
export async function decodeAudioFile(file: File): Promise<AudioBuffer> {
  const arrayBuffer = await file.arrayBuffer()
  const ctx = getAudioContext()
  // decodeAudioData copies the buffer; clone to be safe across browsers.
  return await ctx.decodeAudioData(arrayBuffer.slice(0))
}

/** Mixdown an AudioBuffer to a single mono Float32Array. */
function toMono(buffer: AudioBuffer): Float32Array {
  const channels = buffer.numberOfChannels
  const length = buffer.length
  const mono = new Float32Array(length)
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c)
    for (let i = 0; i < length; i++) mono[i] += data[i]
  }
  if (channels > 1) {
    for (let i = 0; i < length; i++) mono[i] /= channels
  }
  return mono
}

/**
 * Real tempo + beat detection.
 *
 * 1. Build an onset-strength envelope from short-time energy flux.
 * 2. Estimate tempo via autocorrelation of the envelope (70–180 BPM).
 * 3. Place beats on the strongest onset phase, refined to local maxima.
 */
export function analyzeBuffer(buffer: AudioBuffer): AnalysisResult {
  const sampleRate = buffer.sampleRate
  const mono = toMono(buffer)
  const duration = buffer.duration

  const hop = 512
  const frame = 1024
  const numFrames = Math.max(1, Math.floor((mono.length - frame) / hop))

  // Short-time RMS energy
  const energy = new Float32Array(numFrames)
  for (let f = 0; f < numFrames; f++) {
    const start = f * hop
    let sum = 0
    for (let i = 0; i < frame; i++) {
      const s = mono[start + i]
      sum += s * s
    }
    energy[f] = Math.sqrt(sum / frame)
  }

  // Onset envelope = half-wave rectified energy flux, then smoothed
  const onset = new Float32Array(numFrames)
  for (let f = 1; f < numFrames; f++) {
    const diff = energy[f] - energy[f - 1]
    onset[f] = diff > 0 ? diff : 0
  }
  smoothInPlace(onset, 3)
  normalizeInPlace(onset)

  const framesPerSecond = sampleRate / hop

  // Autocorrelation for tempo (period in frames)
  const minBpm = 70
  const maxBpm = 180
  const minLag = Math.floor((60 / maxBpm) * framesPerSecond)
  const maxLag = Math.ceil((60 / minBpm) * framesPerSecond)

  let bestLag = minLag
  let bestScore = -Infinity
  for (let lag = minLag; lag <= maxLag; lag++) {
    let score = 0
    for (let f = lag; f < numFrames; f++) {
      score += onset[f] * onset[f - lag]
    }
    // Slight preference for mid-range tempi to avoid octave errors
    const bpm = 60 / (lag / framesPerSecond)
    const centerBias = 1 - Math.abs(bpm - 124) / 400
    score *= centerBias
    if (score > bestScore) {
      bestScore = score
      bestLag = lag
    }
  }

  let tempo = 60 / (bestLag / framesPerSecond)
  // Fold extreme tempi into a musical range
  while (tempo < 90) tempo *= 2
  while (tempo > 180) tempo /= 2

  const beatPeriodSec = 60 / tempo
  const beatPeriodFrames = beatPeriodSec * framesPerSecond

  // Find best starting phase by testing offsets across one beat period
  let bestPhase = 0
  let bestPhaseScore = -Infinity
  const phaseSteps = Math.max(1, Math.floor(beatPeriodFrames))
  for (let p = 0; p < phaseSteps; p++) {
    let score = 0
    for (let f = p; f < numFrames; f += beatPeriodFrames) {
      score += onset[Math.round(f)] || 0
    }
    if (score > bestPhaseScore) {
      bestPhaseScore = score
      bestPhase = p
    }
  }

  // Place beats, refining each to the nearest local onset peak
  const beats: number[] = []
  const refineWindow = Math.max(1, Math.floor(beatPeriodFrames * 0.12))
  for (let f = bestPhase; f < numFrames; f += beatPeriodFrames) {
    const center = Math.round(f)
    let peakIdx = center
    let peakVal = -Infinity
    for (let w = -refineWindow; w <= refineWindow; w++) {
      const idx = center + w
      if (idx < 0 || idx >= numFrames) continue
      if (onset[idx] > peakVal) {
        peakVal = onset[idx]
        peakIdx = idx
      }
    }
    const t = peakIdx / framesPerSecond
    if (t <= duration) beats.push(Number(t.toFixed(4)))
  }

  const peaks = computePeaks(mono, 1200)

  return { tempo: Number(tempo.toFixed(2)), beats, duration, sampleRate, peaks }
}

/** Downsample to a fixed number of absolute-peak buckets for waveform UI. */
function computePeaks(mono: Float32Array, buckets: number): number[] {
  const out = new Array<number>(buckets).fill(0)
  const bucketSize = Math.floor(mono.length / buckets) || 1
  let max = 0
  for (let b = 0; b < buckets; b++) {
    let peak = 0
    const start = b * bucketSize
    for (let i = 0; i < bucketSize; i++) {
      const v = Math.abs(mono[start + i] || 0)
      if (v > peak) peak = v
    }
    out[b] = peak
    if (peak > max) max = peak
  }
  if (max > 0) {
    for (let b = 0; b < buckets; b++) out[b] /= max
  }
  return out
}

function smoothInPlace(arr: Float32Array, radius: number) {
  const copy = arr.slice()
  for (let i = 0; i < arr.length; i++) {
    let sum = 0
    let count = 0
    for (let w = -radius; w <= radius; w++) {
      const idx = i + w
      if (idx < 0 || idx >= arr.length) continue
      sum += copy[idx]
      count++
    }
    arr[i] = sum / count
  }
}

function normalizeInPlace(arr: Float32Array) {
  let max = 0
  for (let i = 0; i < arr.length; i++) if (arr[i] > max) max = arr[i]
  if (max > 0) for (let i = 0; i < arr.length; i++) arr[i] /= max
}

/** Build a one-shot white-noise buffer (for hats). */
function makeNoiseBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds)
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
  return buffer
}

/** Waveshaper curve for harmonic grit/distortion. */
function makeDistortionCurve(amount: number): Float32Array {
  const k = amount * 100
  const n = 1024
  const curve = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1
    curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x))
  }
  return curve
}

/**
 * Render a Dubstep remix offline.
 *
 * Signal flow:
 *   source ─┬─ highpass (keeps melody/percussion) ─────────────┐
 *           └─ lowpass(LFO wobble) ─ waveshaper(grit) ─ subGain ┤─ wetGain ─ master ─ limiter
 *   source ───────────────────────────────────────── dryGain ──┘
 * Master gain is sidechained (ducked) on every beat for the classic pump.
 */
async function renderDubstep(
  buffer: AudioBuffer,
  analysis: AnalysisResult,
  params: DubstepParams,
): Promise<AudioBuffer> {
  const { sampleRate } = analysis
  const ctx = new OfflineAudioContext(2, Math.ceil(buffer.duration * sampleRate), sampleRate)

  const source = ctx.createBufferSource()
  source.buffer = buffer

  // Dry path
  const dryGain = ctx.createGain()
  dryGain.gain.value = 1 - params.wetMix

  // Wet melody/highs
  const highpass = ctx.createBiquadFilter()
  highpass.type = "highpass"
  highpass.frequency.value = 320

  // Wobble bass path
  const lowpass = ctx.createBiquadFilter()
  lowpass.type = "lowpass"
  lowpass.frequency.value = 600
  lowpass.Q.value = 8

  const shaper = ctx.createWaveShaper()
  shaper.curve = makeDistortionCurve(0.1 + params.grit * 0.9)
  shaper.oversample = "4x"

  const subGain = ctx.createGain()
  subGain.gain.value = 0.6 + params.bassBoost * 1.1

  // LFO modulating the lowpass cutoff (the "wub")
  const lfo = ctx.createOscillator()
  lfo.type = "sine"
  const wobbleHz = (analysis.tempo / 60) * params.wobbleRate
  lfo.frequency.value = wobbleHz
  const lfoDepth = ctx.createGain()
  lfoDepth.gain.value = 700 // Hz of modulation
  lfo.connect(lfoDepth)
  lfoDepth.connect(lowpass.frequency)

  const wetGain = ctx.createGain()
  wetGain.gain.value = params.wetMix

  const master = ctx.createGain()
  master.gain.value = 1

  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -3
  limiter.knee.value = 0
  limiter.ratio.value = 20
  limiter.attack.value = 0.002
  limiter.release.value = 0.15

  // Wiring
  source.connect(dryGain)
  dryGain.connect(master)

  source.connect(highpass)
  highpass.connect(wetGain)

  source.connect(lowpass)
  lowpass.connect(shaper)
  shaper.connect(subGain)
  subGain.connect(wetGain)

  wetGain.connect(master)
  master.connect(limiter)
  limiter.connect(ctx.destination)

  // Sidechain duck on every other beat (half-time dubstep feel)
  scheduleSidechain(master.gain, analysis.beats, 0.85, buffer.duration, 2)

  lfo.start(0)
  source.start(0)
  lfo.stop(buffer.duration)

  return await ctx.startRendering()
}

/**
 * Render an ElectroHouse remix offline.
 *
 * Adds a four-on-the-floor synth kick, off-beat hats, mid emphasis and a
 * strong sidechain pump synced to the detected tempo.
 */
async function renderElectroHouse(
  buffer: AudioBuffer,
  analysis: AnalysisResult,
  params: ElectroHouseParams,
): Promise<AudioBuffer> {
  const { sampleRate, tempo } = analysis
  const ctx = new OfflineAudioContext(2, Math.ceil(buffer.duration * sampleRate), sampleRate)

  const source = ctx.createBufferSource()
  source.buffer = buffer

  const dryGain = ctx.createGain()
  dryGain.gain.value = 1 - params.wetMix

  // Mid presence boost
  const presence = ctx.createBiquadFilter()
  presence.type = "peaking"
  presence.frequency.value = 2200
  presence.Q.value = 1.2
  presence.gain.value = 4

  const wetGain = ctx.createGain()
  wetGain.gain.value = params.wetMix

  // Pump bus carries the harmonic material that gets sidechained
  const pumpBus = ctx.createGain()
  pumpBus.gain.value = 1

  const master = ctx.createGain()
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -3
  limiter.knee.value = 0
  limiter.ratio.value = 20
  limiter.attack.value = 0.002
  limiter.release.value = 0.12

  source.connect(dryGain)
  source.connect(presence)
  presence.connect(wetGain)
  wetGain.connect(pumpBus)
  dryGain.connect(pumpBus)
  pumpBus.connect(master)

  // Build a regular 4-on-the-floor grid from the detected tempo + first beat
  const beatPeriod = 60 / tempo
  const firstBeat = analysis.beats.length > 0 ? analysis.beats[0] : 0
  const grid: number[] = []
  for (let t = firstBeat; t < buffer.duration; t += beatPeriod) grid.push(t)

  // Sidechain pump on every grid beat
  scheduleSidechain(pumpBus.gain, grid, params.pump, buffer.duration, 1)

  // Synth kick on each beat
  if (params.kickLevel > 0.001) {
    const kickBus = ctx.createGain()
    kickBus.gain.value = params.kickLevel * 1.4
    kickBus.connect(master)
    for (const t of grid) scheduleKick(ctx, kickBus, t)
  }

  // Off-beat hats
  if (params.hatLevel > 0.001) {
    const noise = makeNoiseBuffer(ctx, 0.05)
    const hatBus = ctx.createGain()
    hatBus.gain.value = params.hatLevel * 0.6
    hatBus.connect(master)
    for (const t of grid) {
      scheduleHat(ctx, hatBus, noise, t + beatPeriod / 2)
    }
  }

  master.connect(limiter)
  limiter.connect(ctx.destination)

  source.start(0)
  return await ctx.startRendering()
}

/** Automate a gain param to duck at each beat and recover (sidechain pump). */
function scheduleSidechain(
  param: AudioParam,
  beats: number[],
  depth: number,
  duration: number,
  everyN: number,
) {
  const floor = Math.max(0.05, 1 - depth)
  param.setValueAtTime(1, 0)
  for (let i = 0; i < beats.length; i += everyN) {
    const t = beats[i]
    if (t >= duration) break
    const recover = Math.min(duration, t + (beats[i + everyN] ? beats[i + everyN] - t : 0.4) * 0.9)
    param.setValueAtTime(floor, t)
    param.linearRampToValueAtTime(1, recover)
  }
}

/** Synthesize a punchy kick (pitch + amp envelope) at time t. */
function scheduleKick(ctx: BaseAudioContext, dest: AudioNode, t: number) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = "sine"
  osc.frequency.setValueAtTime(150, t)
  osc.frequency.exponentialRampToValueAtTime(48, t + 0.12)
  gain.gain.setValueAtTime(1, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18)
  osc.connect(gain)
  gain.connect(dest)
  osc.start(t)
  osc.stop(t + 0.2)
}

/** Synthesize a hi-hat (filtered noise burst) at time t. */
function scheduleHat(ctx: BaseAudioContext, dest: AudioNode, noise: AudioBuffer, t: number) {
  const src = ctx.createBufferSource()
  src.buffer = noise
  const hp = ctx.createBiquadFilter()
  hp.type = "highpass"
  hp.frequency.value = 7000
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.8, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04)
  src.connect(hp)
  hp.connect(gain)
  gain.connect(dest)
  src.start(t)
  src.stop(t + 0.05)
}

/** Public entry point: render a remix for the chosen style. */
export async function renderRemix(
  buffer: AudioBuffer,
  analysis: AnalysisResult,
  style: RemixStyle,
  params: RemixParams,
): Promise<AudioBuffer> {
  if (style === "dubstep") {
    return renderDubstep(buffer, analysis, params.dubstep)
  }
  return renderElectroHouse(buffer, analysis, params.electrohouse)
}

/** Encode an AudioBuffer to a 16-bit PCM WAV Blob (stereo or mono). */
export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const numFrames = buffer.length
  const bytesPerSample = 2
  const blockAlign = numChannels * bytesPerSample
  const dataSize = numFrames * blockAlign
  const arrayBuffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(arrayBuffer)

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }

  writeString(0, "RIFF")
  view.setUint32(4, 36 + dataSize, true)
  writeString(8, "WAVE")
  writeString(12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true)
  writeString(36, "data")
  view.setUint32(40, dataSize, true)

  const channels: Float32Array[] = []
  for (let c = 0; c < numChannels; c++) channels.push(buffer.getChannelData(c))

  let offset = 44
  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < numChannels; c++) {
      let sample = channels[c][i]
      sample = Math.max(-1, Math.min(1, sample))
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
      offset += 2
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" })
}

/** Hash audio bytes (SHA-256) for analysis caching keys. */
export async function hashFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const digest = await crypto.subtle.digest("SHA-256", buf)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

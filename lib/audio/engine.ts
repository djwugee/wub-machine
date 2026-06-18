/**
 * Wub Machine — real client-side audio DSP engine.
 *
 * Everything here runs in the browser using the native Web Audio API.
 * No backend, no WASM toolchain. Decoding, tempo/beat analysis, drum-kit
 * slicing, remixing (7 styles) and WAV export are all performed locally.
 */

export type RemixStyle =
  | "dubstep"
  | "electrohouse"
  | "boombap"
  | "trap"
  | "lofi"
  | "dnb"
  | "futurebass"

export type Accent = "primary" | "secondary"

export interface StyleMeta {
  id: RemixStyle
  label: string
  description: string
  accent: Accent
}

/** Central registry so labels/accents stay consistent across the app. */
export const STYLE_META: Record<RemixStyle, StyleMeta> = {
  dubstep: {
    id: "dubstep",
    label: "Dubstep",
    description: "Half-time wobble bass, gritty sub & heavy sidechain",
    accent: "primary",
  },
  electrohouse: {
    id: "electrohouse",
    label: "ElectroHouse",
    description: "Four-on-the-floor kick, off-beat hats & pumping mix",
    accent: "secondary",
  },
  boombap: {
    id: "boombap",
    label: "Boom Bap",
    description: "Swung 90s hip-hop drums, punchy kick/snare & vinyl warmth",
    accent: "secondary",
  },
  trap: {
    id: "trap",
    label: "Trap",
    description: "Booming 808 sub, half-time snares & rapid hi-hat rolls",
    accent: "primary",
  },
  lofi: {
    id: "lofi",
    label: "Lo-Fi",
    description: "Slowed & warmed with wow/flutter, tape hiss & soft drums",
    accent: "secondary",
  },
  dnb: {
    id: "dnb",
    label: "Drum & Bass",
    description: "Double-time breakbeat, rolling reese bass & fast hats",
    accent: "primary",
  },
  futurebass: {
    id: "futurebass",
    label: "Future Bass",
    description: "Deep sidechain pump, octave shimmer & wide chorus",
    accent: "secondary",
  },
}

export const STYLE_ORDER: RemixStyle[] = [
  "dubstep",
  "electrohouse",
  "boombap",
  "trap",
  "lofi",
  "dnb",
  "futurebass",
]

// ---- Per-style parameter interfaces --------------------------------------

export interface DubstepParams {
  wobbleRate: number
  bassBoost: number
  grit: number
  wetMix: number
}
export interface ElectroHouseParams {
  pump: number
  kickLevel: number
  hatLevel: number
  wetMix: number
}
export interface BoomBapParams {
  swing: number
  vinyl: number
  kickLevel: number
  snareLevel: number
  wetMix: number
}
export interface TrapParams {
  sub808: number
  hatRolls: number
  kickLevel: number
  wetMix: number
}
export interface LoFiParams {
  slowdown: number
  warmth: number
  vinyl: number
  wetMix: number
}
export interface DnbParams {
  breakIntensity: number
  reese: number
  kickLevel: number
  wetMix: number
}
export interface FutureBassParams {
  pump: number
  width: number
  shimmer: number
  wetMix: number
}

export interface RemixParams {
  dubstep: DubstepParams
  electrohouse: ElectroHouseParams
  boombap: BoomBapParams
  trap: TrapParams
  lofi: LoFiParams
  dnb: DnbParams
  futurebass: FutureBassParams
}

export const DEFAULT_PARAMS: RemixParams = {
  dubstep: { wobbleRate: 1, bassBoost: 0.7, grit: 0.35, wetMix: 0.85 },
  electrohouse: { pump: 0.7, kickLevel: 0.6, hatLevel: 0.4, wetMix: 0.85 },
  boombap: { swing: 0.55, vinyl: 0.35, kickLevel: 0.85, snareLevel: 0.7, wetMix: 0.8 },
  trap: { sub808: 0.8, hatRolls: 0.6, kickLevel: 0.75, wetMix: 0.8 },
  lofi: { slowdown: 0.5, warmth: 0.6, vinyl: 0.4, wetMix: 0.9 },
  dnb: { breakIntensity: 0.7, reese: 0.6, kickLevel: 0.7, wetMix: 0.85 },
  futurebass: { pump: 0.8, width: 0.6, shimmer: 0.5, wetMix: 0.85 },
}

export interface AnalysisResult {
  tempo: number
  beats: number[]
  duration: number
  sampleRate: number
  /** Normalized peak envelope (−1..1 magnitude) for waveform rendering. */
  peaks: number[]
}

/** A single sliced drum hit extracted from the source, as mono PCM. */
export interface DrumSlice {
  data: Float32Array
  sampleRate: number
}

/** Drum kit chopped from the user's own audio. */
export interface DrumKit {
  kick: DrumSlice | null
  snare: DrumSlice | null
  hat: DrumSlice | null
}

export interface RenderOptions {
  /** Use drums sliced from the source track instead of synthesized ones. */
  useSlicedDrums?: boolean
  drumKit?: DrumKit | null
}

/** Lazily-created shared AudioContext for decoding + playback. */
let sharedCtx: AudioContext | null = null
export function getAudioContext(): AudioContext {
  if (typeof window === "undefined") {
    throw new Error("AudioContext is only available in the browser")
  }
  if (!sharedCtx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    sharedCtx = new Ctor()
  }
  return sharedCtx
}

/** Decode an uploaded file into an AudioBuffer. */
export async function decodeAudioFile(file: File): Promise<AudioBuffer> {
  const arrayBuffer = await file.arrayBuffer()
  const ctx = getAudioContext()
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

  const onset = new Float32Array(numFrames)
  for (let f = 1; f < numFrames; f++) {
    const diff = energy[f] - energy[f - 1]
    onset[f] = diff > 0 ? diff : 0
  }
  smoothInPlace(onset, 3)
  normalizeInPlace(onset)

  const framesPerSecond = sampleRate / hop

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
    const bpm = 60 / (lag / framesPerSecond)
    const centerBias = 1 - Math.abs(bpm - 124) / 400
    score *= centerBias
    if (score > bestScore) {
      bestScore = score
      bestLag = lag
    }
  }

  let tempo = 60 / (bestLag / framesPerSecond)
  while (tempo < 90) tempo *= 2
  while (tempo > 180) tempo /= 2

  const beatPeriodSec = 60 / tempo
  const beatPeriodFrames = beatPeriodSec * framesPerSecond

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

/**
 * Slice a real drum kit (kick / snare / hat) out of the source audio.
 *
 * Detects onset transients, extracts a short window at each, then classifies
 * every slice by low/high band energy and zero-crossing rate. The strongest
 * representative of each drum class is returned, normalized and de-clicked.
 */
export function extractDrumKit(buffer: AudioBuffer): DrumKit {
  const sampleRate = buffer.sampleRate
  const mono = toMono(buffer)

  const hop = 512
  const frame = 1024
  const numFrames = Math.max(1, Math.floor((mono.length - frame) / hop))
  const framesPerSecond = sampleRate / hop

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
  const onset = new Float32Array(numFrames)
  for (let f = 1; f < numFrames; f++) {
    const d = energy[f] - energy[f - 1]
    onset[f] = d > 0 ? d : 0
  }
  smoothInPlace(onset, 2)

  // Threshold from running statistics
  let mean = 0
  for (let f = 0; f < numFrames; f++) mean += onset[f]
  mean /= numFrames || 1
  let variance = 0
  for (let f = 0; f < numFrames; f++) variance += (onset[f] - mean) ** 2
  variance /= numFrames || 1
  const std = Math.sqrt(variance)
  const threshold = mean + std * 1.0

  const minGapFrames = Math.floor(0.08 * framesPerSecond) // ≥80ms between hits
  const onsetSamples: number[] = []
  let lastFrame = -minGapFrames
  for (let f = 2; f < numFrames - 2; f++) {
    if (
      onset[f] > threshold &&
      onset[f] >= onset[f - 1] &&
      onset[f] >= onset[f + 1] &&
      f - lastFrame >= minGapFrames
    ) {
      onsetSamples.push(f * hop)
      lastFrame = f
    }
    if (onsetSamples.length >= 400) break
  }

  // Candidate scoring per class
  let bestKick: { score: number; start: number } | null = null
  let bestSnare: { score: number; start: number } | null = null
  let bestHat: { score: number; start: number } | null = null

  const winLen = Math.floor(0.3 * sampleRate)
  for (const start of onsetSamples) {
    const end = Math.min(mono.length, start + winLen)
    if (end - start < Math.floor(0.02 * sampleRate)) continue

    const { lowE, highE, zcr, peak } = classifySlice(mono, start, end, sampleRate)
    const total = lowE + highE + 1e-9
    const brightness = highE / total

    if (brightness < 0.4) {
      const score = lowE * peak
      if (!bestKick || score > bestKick.score) bestKick = { score, start }
    } else if (brightness > 0.66) {
      const score = highE * peak
      if (!bestHat || score > bestHat.score) bestHat = { score, start }
    } else {
      const score = (lowE + highE) * peak * (0.5 + zcr)
      if (!bestSnare || score > bestSnare.score) bestSnare = { score, start }
    }
  }

  return {
    kick: bestKick ? makeSlice(mono, bestKick.start, 0.3, sampleRate) : null,
    snare: bestSnare ? makeSlice(mono, bestSnare.start, 0.24, sampleRate) : null,
    hat: bestHat ? makeSlice(mono, bestHat.start, 0.12, sampleRate) : null,
  }
}

function classifySlice(mono: Float32Array, start: number, end: number, sampleRate: number) {
  // One-pole low/high split around ~180 Hz
  const fc = 180
  const rc = 1 / (2 * Math.PI * fc)
  const dt = 1 / sampleRate
  const a = dt / (rc + dt)

  let lp = mono[start]
  let lowSum = 0
  let highSum = 0
  let zc = 0
  let peak = 0
  let prevSign = 0
  for (let i = start; i < end; i++) {
    const x = mono[i]
    lp = lp + a * (x - lp)
    const hp = x - lp
    lowSum += lp * lp
    highSum += hp * hp
    const av = Math.abs(x)
    if (av > peak) peak = av
    const sign = x >= 0 ? 1 : -1
    if (prevSign !== 0 && sign !== prevSign) zc++
    prevSign = sign
  }
  const n = end - start
  return {
    lowE: Math.sqrt(lowSum / n),
    highE: Math.sqrt(highSum / n),
    zcr: zc / n,
    peak,
  }
}

function makeSlice(mono: Float32Array, start: number, seconds: number, sampleRate: number): DrumSlice {
  const len = Math.min(Math.floor(seconds * sampleRate), mono.length - start)
  const data = new Float32Array(len)
  let peak = 0
  for (let i = 0; i < len; i++) {
    const v = mono[start + i]
    data[i] = v
    const av = Math.abs(v)
    if (av > peak) peak = av
  }
  // Normalize to ~0.98 and apply short fades to de-click
  const norm = peak > 0 ? 0.98 / peak : 1
  const fadeIn = Math.min(64, Math.floor(len * 0.02))
  const fadeOut = Math.floor(len * 0.25)
  for (let i = 0; i < len; i++) {
    let g = norm
    if (i < fadeIn) g *= i / fadeIn
    if (i > len - fadeOut) g *= (len - i) / fadeOut
    data[i] *= g
  }
  return { data, sampleRate }
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

// ---- Shared synthesis / routing helpers ----------------------------------

function makeNoiseBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds)
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
  return buffer
}

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

function makeMaster(ctx: OfflineAudioContext): GainNode {
  const master = ctx.createGain()
  master.gain.value = 1
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -3
  limiter.knee.value = 0
  limiter.ratio.value = 20
  limiter.attack.value = 0.002
  limiter.release.value = 0.14
  master.connect(limiter)
  limiter.connect(ctx.destination)
  return master
}

/** Build a regular grid of beat times from tempo + first detected beat. */
function regularGrid(tempo: number, firstBeat: number, duration: number): number[] {
  const period = 60 / tempo
  const grid: number[] = []
  for (let t = firstBeat; t < duration; t += period) grid.push(t)
  return grid
}

function sliceToBuffer(ctx: OfflineAudioContext, slice: DrumSlice | null): AudioBuffer | null {
  if (!slice) return null
  const buf = ctx.createBuffer(1, slice.data.length, slice.sampleRate)
  buf.copyToChannel(slice.data, 0)
  return buf
}

function playSample(
  ctx: OfflineAudioContext,
  dest: AudioNode,
  buf: AudioBuffer,
  t: number,
  gain: number,
  rate = 1,
) {
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.playbackRate.value = rate
  const g = ctx.createGain()
  g.gain.value = gain
  src.connect(g)
  g.connect(dest)
  src.start(t)
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
    const next = beats[i + everyN]
    const recover = Math.min(duration, t + (next ? next - t : 0.4) * 0.9)
    param.setValueAtTime(floor, t)
    param.linearRampToValueAtTime(1, recover)
  }
}

/** Synthesize a punchy kick (pitch + amp envelope) at time t. */
function scheduleKick(ctx: OfflineAudioContext, dest: AudioNode, t: number, level: number, decay = 0.18) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = "sine"
  osc.frequency.setValueAtTime(150, t)
  osc.frequency.exponentialRampToValueAtTime(48, t + decay * 0.7)
  gain.gain.setValueAtTime(level, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + decay)
  osc.connect(gain)
  gain.connect(dest)
  osc.start(t)
  osc.stop(t + decay + 0.02)
}

/** Long booming 808 with pitch glide and saturation. */
function schedule808(ctx: OfflineAudioContext, dest: AudioNode, t: number, level: number, decay: number) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  const shaper = ctx.createWaveShaper()
  shaper.curve = makeDistortionCurve(0.15)
  osc.type = "sine"
  osc.frequency.setValueAtTime(140, t)
  osc.frequency.exponentialRampToValueAtTime(42, t + 0.18)
  gain.gain.setValueAtTime(level, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + decay)
  osc.connect(shaper)
  shaper.connect(gain)
  gain.connect(dest)
  osc.start(t)
  osc.stop(t + decay + 0.02)
}

/** Synthesize a snare (noise + tonal body) at time t. */
function scheduleSnare(ctx: OfflineAudioContext, dest: AudioNode, noise: AudioBuffer, t: number, level: number) {
  const src = ctx.createBufferSource()
  src.buffer = noise
  const bp = ctx.createBiquadFilter()
  bp.type = "bandpass"
  bp.frequency.value = 1800
  bp.Q.value = 0.7
  const ng = ctx.createGain()
  ng.gain.setValueAtTime(level, t)
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.16)
  src.connect(bp)
  bp.connect(ng)
  ng.connect(dest)
  src.start(t)
  src.stop(t + 0.18)

  const tone = ctx.createOscillator()
  const tg = ctx.createGain()
  tone.type = "triangle"
  tone.frequency.setValueAtTime(190, t)
  tg.gain.setValueAtTime(level * 0.5, t)
  tg.gain.exponentialRampToValueAtTime(0.001, t + 0.1)
  tone.connect(tg)
  tg.connect(dest)
  tone.start(t)
  tone.stop(t + 0.12)
}

/** Synthesize a hi-hat (filtered noise burst) at time t. */
function scheduleHat(
  ctx: OfflineAudioContext,
  dest: AudioNode,
  noise: AudioBuffer,
  t: number,
  level: number,
  decay = 0.04,
) {
  const src = ctx.createBufferSource()
  src.buffer = noise
  const hp = ctx.createBiquadFilter()
  hp.type = "highpass"
  hp.frequency.value = 7000
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(level, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + decay)
  src.connect(hp)
  hp.connect(gain)
  gain.connect(dest)
  src.start(t)
  src.stop(t + decay + 0.01)
}

/** Continuous lo-fi vinyl hiss/crackle texture. */
function addVinyl(ctx: OfflineAudioContext, dest: AudioNode, amount: number, duration: number) {
  if (amount <= 0.001) return
  const noise = makeNoiseBuffer(ctx, 2)
  const src = ctx.createBufferSource()
  src.buffer = noise
  src.loop = true
  const bp = ctx.createBiquadFilter()
  bp.type = "bandpass"
  bp.frequency.value = 3200
  bp.Q.value = 0.6
  const g = ctx.createGain()
  g.gain.value = amount * 0.05
  src.connect(bp)
  bp.connect(g)
  g.connect(dest)
  src.start(0)
  src.stop(duration)
}

// Resolve which kick/snare/hat buffers a renderer should use.
function resolveKit(ctx: OfflineAudioContext, opts: RenderOptions | undefined) {
  const useSliced = !!opts?.useSlicedDrums && !!opts?.drumKit
  const kit = opts?.drumKit
  return {
    useSliced,
    kickBuf: useSliced ? sliceToBuffer(ctx, kit!.kick) : null,
    snareBuf: useSliced ? sliceToBuffer(ctx, kit!.snare) : null,
    hatBuf: useSliced ? sliceToBuffer(ctx, kit!.hat) : null,
  }
}

// ---- Renderers ------------------------------------------------------------

async function renderDubstep(
  buffer: AudioBuffer,
  analysis: AnalysisResult,
  params: DubstepParams,
  opts?: RenderOptions,
): Promise<AudioBuffer> {
  const { sampleRate } = analysis
  const ctx = new OfflineAudioContext(2, Math.ceil(buffer.duration * sampleRate), sampleRate)
  const master = makeMaster(ctx)

  const source = ctx.createBufferSource()
  source.buffer = buffer

  const dryGain = ctx.createGain()
  dryGain.gain.value = 1 - params.wetMix

  const highpass = ctx.createBiquadFilter()
  highpass.type = "highpass"
  highpass.frequency.value = 320

  const lowpass = ctx.createBiquadFilter()
  lowpass.type = "lowpass"
  lowpass.frequency.value = 600
  lowpass.Q.value = 8

  const shaper = ctx.createWaveShaper()
  shaper.curve = makeDistortionCurve(0.1 + params.grit * 0.9)
  shaper.oversample = "4x"

  const subGain = ctx.createGain()
  subGain.gain.value = 0.6 + params.bassBoost * 1.1

  const lfo = ctx.createOscillator()
  lfo.type = "sine"
  lfo.frequency.value = (analysis.tempo / 60) * params.wobbleRate
  const lfoDepth = ctx.createGain()
  lfoDepth.gain.value = 700
  lfo.connect(lfoDepth)
  lfoDepth.connect(lowpass.frequency)

  const wetGain = ctx.createGain()
  wetGain.gain.value = params.wetMix

  source.connect(dryGain)
  dryGain.connect(master)
  source.connect(highpass)
  highpass.connect(wetGain)
  source.connect(lowpass)
  lowpass.connect(shaper)
  shaper.connect(subGain)
  subGain.connect(wetGain)
  wetGain.connect(master)

  scheduleSidechain(master.gain, analysis.beats, 0.85, buffer.duration, 2)

  // Optional sliced-kick reinforcement on every other beat
  const { useSliced, kickBuf } = resolveKit(ctx, opts)
  if (useSliced && kickBuf) {
    const kickBus = ctx.createGain()
    kickBus.gain.value = 0.9
    kickBus.connect(master)
    const grid = regularGrid(analysis.tempo, analysis.beats[0] ?? 0, buffer.duration)
    for (let i = 0; i < grid.length; i += 2) playSample(ctx, kickBus, kickBuf, grid[i], 1)
  }

  lfo.start(0)
  source.start(0)
  lfo.stop(buffer.duration)
  return await ctx.startRendering()
}

async function renderElectroHouse(
  buffer: AudioBuffer,
  analysis: AnalysisResult,
  params: ElectroHouseParams,
  opts?: RenderOptions,
): Promise<AudioBuffer> {
  const { sampleRate, tempo } = analysis
  const ctx = new OfflineAudioContext(2, Math.ceil(buffer.duration * sampleRate), sampleRate)
  const master = makeMaster(ctx)

  const source = ctx.createBufferSource()
  source.buffer = buffer

  const dryGain = ctx.createGain()
  dryGain.gain.value = 1 - params.wetMix
  const presence = ctx.createBiquadFilter()
  presence.type = "peaking"
  presence.frequency.value = 2200
  presence.Q.value = 1.2
  presence.gain.value = 4
  const wetGain = ctx.createGain()
  wetGain.gain.value = params.wetMix
  const pumpBus = ctx.createGain()
  pumpBus.gain.value = 1

  source.connect(dryGain)
  source.connect(presence)
  presence.connect(wetGain)
  wetGain.connect(pumpBus)
  dryGain.connect(pumpBus)
  pumpBus.connect(master)

  const beatPeriod = 60 / tempo
  const grid = regularGrid(tempo, analysis.beats[0] ?? 0, buffer.duration)
  scheduleSidechain(pumpBus.gain, grid, params.pump, buffer.duration, 1)

  const { useSliced, kickBuf, hatBuf } = resolveKit(ctx, opts)
  const noise = makeNoiseBuffer(ctx, 0.05)

  if (params.kickLevel > 0.001) {
    const kickBus = ctx.createGain()
    kickBus.gain.value = params.kickLevel * 1.4
    kickBus.connect(master)
    for (const t of grid) {
      if (useSliced && kickBuf) playSample(ctx, kickBus, kickBuf, t, 1)
      else scheduleKick(ctx, kickBus, t, 1)
    }
  }

  if (params.hatLevel > 0.001) {
    const hatBus = ctx.createGain()
    hatBus.gain.value = params.hatLevel * 0.6
    hatBus.connect(master)
    for (const t of grid) {
      const tt = t + beatPeriod / 2
      if (useSliced && hatBuf) playSample(ctx, hatBus, hatBuf, tt, 0.8)
      else scheduleHat(ctx, hatBus, noise, tt, 0.8)
    }
  }

  source.start(0)
  return await ctx.startRendering()
}

async function renderBoomBap(
  buffer: AudioBuffer,
  analysis: AnalysisResult,
  params: BoomBapParams,
  opts?: RenderOptions,
): Promise<AudioBuffer> {
  const { sampleRate, tempo } = analysis
  const ctx = new OfflineAudioContext(2, Math.ceil(buffer.duration * sampleRate), sampleRate)
  const master = makeMaster(ctx)

  const source = ctx.createBufferSource()
  source.buffer = buffer

  // Warm, slightly dusty sample bed
  const warmth = ctx.createBiquadFilter()
  warmth.type = "lowpass"
  warmth.frequency.value = 6500
  const lowShelf = ctx.createBiquadFilter()
  lowShelf.type = "lowshelf"
  lowShelf.frequency.value = 200
  lowShelf.gain.value = 3
  const wetGain = ctx.createGain()
  wetGain.gain.value = params.wetMix
  const dryGain = ctx.createGain()
  dryGain.gain.value = 1 - params.wetMix

  source.connect(dryGain)
  dryGain.connect(master)
  source.connect(warmth)
  warmth.connect(lowShelf)
  lowShelf.connect(wetGain)
  wetGain.connect(master)

  addVinyl(ctx, master, params.vinyl, buffer.duration)

  const beatPeriod = 60 / tempo
  const eighth = beatPeriod / 2
  const grid = regularGrid(tempo, analysis.beats[0] ?? 0, buffer.duration)
  const swingOffset = params.swing * eighth * 0.6

  const { useSliced, kickBuf, snareBuf, hatBuf } = resolveKit(ctx, opts)
  const noise = makeNoiseBuffer(ctx, 0.3)

  const kickBus = ctx.createGain()
  kickBus.gain.value = params.kickLevel * 1.5
  kickBus.connect(master)
  const snareBus = ctx.createGain()
  snareBus.gain.value = params.snareLevel * 1.3
  snareBus.connect(master)
  const hatBus = ctx.createGain()
  hatBus.gain.value = 0.45
  hatBus.connect(master)

  const trigKick = (t: number) =>
    useSliced && kickBuf ? playSample(ctx, kickBus, kickBuf, t, 1) : scheduleKick(ctx, kickBus, t, 1, 0.22)
  const trigSnare = (t: number) =>
    useSliced && snareBuf ? playSample(ctx, snareBus, snareBuf, t, 1) : scheduleSnare(ctx, snareBus, noise, t, 0.9)
  const trigHat = (t: number, lvl: number) =>
    useSliced && hatBuf ? playSample(ctx, hatBus, hatBuf, t, lvl) : scheduleHat(ctx, hatBus, noise, t, lvl, 0.05)

  // Classic boom-bap: kick on 1 and the "and" of 3, snare on 2 & 4, swung 8th hats
  grid.forEach((t, i) => {
    const beatInBar = i % 4
    if (beatInBar === 0) trigKick(t)
    if (beatInBar === 2) trigKick(t + eighth) // "and" of 3
    if (beatInBar === 1 || beatInBar === 3) trigSnare(t)

    // Hats: downbeat straight, off-beat swung
    if (t < buffer.duration) trigHat(t, 0.7)
    const off = t + eighth + swingOffset
    if (off < buffer.duration) trigHat(off, 0.5)
  })

  source.start(0)
  return await ctx.startRendering()
}

async function renderTrap(
  buffer: AudioBuffer,
  analysis: AnalysisResult,
  params: TrapParams,
  opts?: RenderOptions,
): Promise<AudioBuffer> {
  const { sampleRate, tempo } = analysis
  const ctx = new OfflineAudioContext(2, Math.ceil(buffer.duration * sampleRate), sampleRate)
  const master = makeMaster(ctx)

  const source = ctx.createBufferSource()
  source.buffer = buffer
  const presence = ctx.createBiquadFilter()
  presence.type = "peaking"
  presence.frequency.value = 3000
  presence.Q.value = 1
  presence.gain.value = 3
  const wetGain = ctx.createGain()
  wetGain.gain.value = params.wetMix
  const dryGain = ctx.createGain()
  dryGain.gain.value = 1 - params.wetMix

  source.connect(dryGain)
  dryGain.connect(master)
  source.connect(presence)
  presence.connect(wetGain)
  wetGain.connect(master)

  const beatPeriod = 60 / tempo
  const sixteenth = beatPeriod / 4
  const grid = regularGrid(tempo, analysis.beats[0] ?? 0, buffer.duration)

  const { useSliced, kickBuf, snareBuf, hatBuf } = resolveKit(ctx, opts)
  const noise = makeNoiseBuffer(ctx, 0.3)

  // 808 / kick bus
  const kickBus = ctx.createGain()
  kickBus.gain.value = params.kickLevel * 1.4
  kickBus.connect(master)
  const subBus = ctx.createGain()
  subBus.gain.value = params.sub808 * 1.2
  subBus.connect(master)
  const snareBus = ctx.createGain()
  snareBus.gain.value = 0.9
  snareBus.connect(master)
  const hatBus = ctx.createGain()
  hatBus.gain.value = 0.5
  hatBus.connect(master)

  grid.forEach((t, i) => {
    const beatInBar = i % 4
    // Kick on 1 and syncopated "and" of 2
    if (beatInBar === 0) {
      if (useSliced && kickBuf) playSample(ctx, kickBus, kickBuf, t, 1)
      else scheduleKick(ctx, kickBus, t, 1, 0.2)
      schedule808(ctx, subBus, t, 1, beatPeriod * 0.9)
    }
    if (beatInBar === 1) schedule808(ctx, subBus, t + sixteenth * 2, 0.9, beatPeriod * 0.7)
    // Half-time snare/clap on beat 3
    if (beatInBar === 2) {
      if (useSliced && snareBuf) playSample(ctx, snareBus, snareBuf, t, 1)
      else scheduleSnare(ctx, snareBus, noise, t, 0.9)
    }
  })

  // Hi-hat 16ths with rolls
  const rollChance = params.hatRolls
  for (let t = grid[0] ?? 0, k = 0; t < buffer.duration; t += sixteenth, k++) {
    const trig = (tt: number, lvl: number) =>
      useSliced && hatBuf ? playSample(ctx, hatBus, hatBuf, tt, lvl) : scheduleHat(ctx, hatBus, noise, tt, lvl, 0.035)
    trig(t, 0.6)
    // Every 4th 16th, optionally insert a triplet roll
    if (k % 4 === 3 && rollChance > 0.001) {
      const sub = sixteenth / 3
      const rolls = 1 + Math.round(rollChance * 2)
      for (let r = 1; r <= rolls; r++) trig(t + sub * r, 0.4 + 0.15 * r)
    }
  }

  source.start(0)
  return await ctx.startRendering()
}

async function renderLoFi(
  buffer: AudioBuffer,
  analysis: AnalysisResult,
  params: LoFiParams,
  opts?: RenderOptions,
): Promise<AudioBuffer> {
  const { sampleRate, tempo } = analysis
  const rate = 1 - params.slowdown * 0.25 // 0.75×–1.0× (pitched down when slowed)
  const outDuration = buffer.duration / rate
  const ctx = new OfflineAudioContext(2, Math.ceil(outDuration * sampleRate), sampleRate)
  const master = makeMaster(ctx)

  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.playbackRate.value = rate

  // Wow/flutter: slow LFO modulating detune (in cents)
  const flutter = ctx.createOscillator()
  flutter.type = "sine"
  flutter.frequency.value = 0.6
  const flutterDepth = ctx.createGain()
  flutterDepth.gain.value = 6 + params.slowdown * 10
  flutter.connect(flutterDepth)
  flutterDepth.connect(source.detune)

  // Warmth: lowpass + gentle high cut
  const warmth = ctx.createBiquadFilter()
  warmth.type = "lowpass"
  warmth.frequency.value = 4000 - params.warmth * 2400 // 4000→1600 Hz
  warmth.Q.value = 0.5
  const lowShelf = ctx.createBiquadFilter()
  lowShelf.type = "lowshelf"
  lowShelf.frequency.value = 250
  lowShelf.gain.value = 2

  const wetGain = ctx.createGain()
  wetGain.gain.value = params.wetMix
  const dryGain = ctx.createGain()
  dryGain.gain.value = 1 - params.wetMix

  source.connect(dryGain)
  dryGain.connect(master)
  source.connect(warmth)
  warmth.connect(lowShelf)
  lowShelf.connect(wetGain)
  wetGain.connect(master)

  addVinyl(ctx, master, Math.max(params.vinyl, 0.25), outDuration)

  // Soft drums on the slowed grid
  const slowedPeriod = (60 / tempo) / rate
  const grid: number[] = []
  for (let t = (analysis.beats[0] ?? 0) / rate; t < outDuration; t += slowedPeriod) grid.push(t)

  const { useSliced, kickBuf, snareBuf } = resolveKit(ctx, opts)
  const noise = makeNoiseBuffer(ctx, 0.3)
  const kickBus = ctx.createGain()
  kickBus.gain.value = 0.8
  kickBus.connect(master)
  const snareBus = ctx.createGain()
  snareBus.gain.value = 0.6
  snareBus.connect(master)

  grid.forEach((t, i) => {
    const beatInBar = i % 4
    if (beatInBar === 0 || beatInBar === 2) {
      if (useSliced && kickBuf) playSample(ctx, kickBus, kickBuf, t, 1, rate)
      else scheduleKick(ctx, kickBus, t, 0.9, 0.26)
    }
    if (beatInBar === 1 || beatInBar === 3) {
      if (useSliced && snareBuf) playSample(ctx, snareBus, snareBuf, t, 0.9, rate)
      else scheduleSnare(ctx, snareBus, noise, t, 0.6)
    }
  })

  flutter.start(0)
  source.start(0)
  flutter.stop(outDuration)
  return await ctx.startRendering()
}

async function renderDnb(
  buffer: AudioBuffer,
  analysis: AnalysisResult,
  params: DnbParams,
  opts?: RenderOptions,
): Promise<AudioBuffer> {
  const { sampleRate, tempo } = analysis
  const ctx = new OfflineAudioContext(2, Math.ceil(buffer.duration * sampleRate), sampleRate)
  const master = makeMaster(ctx)

  const source = ctx.createBufferSource()
  source.buffer = buffer
  const highpass = ctx.createBiquadFilter()
  highpass.type = "highpass"
  highpass.frequency.value = 250 // leave room for reese sub
  const wetGain = ctx.createGain()
  wetGain.gain.value = params.wetMix
  const dryGain = ctx.createGain()
  dryGain.gain.value = 1 - params.wetMix

  source.connect(dryGain)
  dryGain.connect(master)
  source.connect(highpass)
  highpass.connect(wetGain)
  wetGain.connect(master)

  // Reese bass: heavily lowpassed + gritty source layer with rolling tremolo
  if (params.reese > 0.001) {
    const reeseSrc = ctx.createBufferSource()
    reeseSrc.buffer = buffer
    const lp = ctx.createBiquadFilter()
    lp.type = "lowpass"
    lp.frequency.value = 220
    lp.Q.value = 6
    const shaper = ctx.createWaveShaper()
    shaper.curve = makeDistortionCurve(0.4)
    const reeseGain = ctx.createGain()
    reeseGain.gain.value = params.reese * 1.2
    const trem = ctx.createOscillator()
    trem.type = "sine"
    trem.frequency.value = (tempo / 60) * 2 // rolling movement
    const tremDepth = ctx.createGain()
    tremDepth.gain.value = params.reese * 0.4
    trem.connect(tremDepth)
    tremDepth.connect(reeseGain.gain)
    reeseSrc.connect(lp)
    lp.connect(shaper)
    shaper.connect(reeseGain)
    reeseGain.connect(master)
    trem.start(0)
    reeseSrc.start(0)
    trem.stop(buffer.duration)
  }

  const beatPeriod = 60 / tempo
  const eighth = beatPeriod / 2
  const sixteenth = beatPeriod / 4
  const grid = regularGrid(tempo, analysis.beats[0] ?? 0, buffer.duration)

  const { useSliced, kickBuf, snareBuf, hatBuf } = resolveKit(ctx, opts)
  const noise = makeNoiseBuffer(ctx, 0.3)
  const kickBus = ctx.createGain()
  kickBus.gain.value = params.kickLevel * 1.4
  kickBus.connect(master)
  const snareBus = ctx.createGain()
  snareBus.gain.value = 1
  snareBus.connect(master)
  const hatBus = ctx.createGain()
  hatBus.gain.value = 0.4
  hatBus.connect(master)

  const trigKick = (t: number) =>
    useSliced && kickBuf ? playSample(ctx, kickBus, kickBuf, t, 1) : scheduleKick(ctx, kickBus, t, 1, 0.16)
  const trigSnare = (t: number) =>
    useSliced && snareBuf ? playSample(ctx, snareBus, snareBuf, t, 1) : scheduleSnare(ctx, snareBus, noise, t, 0.9)

  // Amen-style break: kick on 1 & "and" of 2, snare on 2 & 4, ghost hits scale with intensity
  grid.forEach((t, i) => {
    const beatInBar = i % 4
    if (beatInBar === 0) trigKick(t)
    if (beatInBar === 1) trigSnare(t)
    if (beatInBar === 2) {
      trigKick(t + eighth)
      if (params.breakIntensity > 0.5) trigKick(t)
    }
    if (beatInBar === 3) {
      trigSnare(t)
      if (params.breakIntensity > 0.7) trigSnare(t + eighth)
    }
  })

  // Fast hats on 16ths
  for (let t = grid[0] ?? 0; t < buffer.duration; t += sixteenth) {
    if (useSliced && hatBuf) playSample(ctx, hatBus, hatBuf, t, 0.5)
    else scheduleHat(ctx, hatBus, noise, t, 0.5, 0.03)
  }

  source.start(0)
  return await ctx.startRendering()
}

async function renderFutureBass(
  buffer: AudioBuffer,
  analysis: AnalysisResult,
  params: FutureBassParams,
  opts?: RenderOptions,
): Promise<AudioBuffer> {
  const { sampleRate, tempo } = analysis
  const ctx = new OfflineAudioContext(2, Math.ceil(buffer.duration * sampleRate), sampleRate)
  const master = makeMaster(ctx)

  const source = ctx.createBufferSource()
  source.buffer = buffer

  const presence = ctx.createBiquadFilter()
  presence.type = "peaking"
  presence.frequency.value = 2600
  presence.Q.value = 1
  presence.gain.value = 5
  const wetGain = ctx.createGain()
  wetGain.gain.value = params.wetMix
  const dryGain = ctx.createGain()
  dryGain.gain.value = 1 - params.wetMix
  const pumpBus = ctx.createGain()
  pumpBus.gain.value = 1

  source.connect(dryGain)
  source.connect(presence)
  presence.connect(wetGain)
  wetGain.connect(pumpBus)
  dryGain.connect(pumpBus)
  pumpBus.connect(master)

  // Octave-up shimmer: a second playback an octave higher, high-passed
  if (params.shimmer > 0.001) {
    const shimmerSrc = ctx.createBufferSource()
    shimmerSrc.buffer = buffer
    shimmerSrc.playbackRate.value = 2
    const hp = ctx.createBiquadFilter()
    hp.type = "highpass"
    hp.frequency.value = 2500
    const sg = ctx.createGain()
    sg.gain.value = params.shimmer * 0.35
    shimmerSrc.connect(hp)
    hp.connect(sg)
    sg.connect(pumpBus)
    shimmerSrc.start(0)
  }

  // Wide chorus: two modulated delays panned hard L/R
  if (params.width > 0.001) {
    for (const side of [-1, 1]) {
      const delay = ctx.createDelay()
      delay.delayTime.value = 0.018 + (side > 0 ? 0.006 : 0)
      const mod = ctx.createOscillator()
      mod.type = "sine"
      mod.frequency.value = side > 0 ? 0.7 : 0.5
      const modDepth = ctx.createGain()
      modDepth.gain.value = 0.004 * params.width
      mod.connect(modDepth)
      modDepth.connect(delay.delayTime)
      const pan = ctx.createStereoPanner()
      pan.pan.value = side
      const wg = ctx.createGain()
      wg.gain.value = params.width * 0.5
      presence.connect(delay)
      delay.connect(pan)
      pan.connect(wg)
      wg.connect(master)
      mod.start(0)
      mod.stop(buffer.duration)
    }
  }

  const grid = regularGrid(tempo, analysis.beats[0] ?? 0, buffer.duration)
  scheduleSidechain(pumpBus.gain, grid, params.pump, buffer.duration, 1)

  // Soft four-on-the-floor foundation
  const { useSliced, kickBuf } = resolveKit(ctx, opts)
  const kickBus = ctx.createGain()
  kickBus.gain.value = 0.9
  kickBus.connect(master)
  for (const t of grid) {
    if (useSliced && kickBuf) playSample(ctx, kickBus, kickBuf, t, 1)
    else scheduleKick(ctx, kickBus, t, 0.9, 0.2)
  }

  source.start(0)
  return await ctx.startRendering()
}

/** Public entry point: render a remix for the chosen style. */
export async function renderRemix(
  buffer: AudioBuffer,
  analysis: AnalysisResult,
  style: RemixStyle,
  params: RemixParams,
  opts?: RenderOptions,
): Promise<AudioBuffer> {
  switch (style) {
    case "dubstep":
      return renderDubstep(buffer, analysis, params.dubstep, opts)
    case "electrohouse":
      return renderElectroHouse(buffer, analysis, params.electrohouse, opts)
    case "boombap":
      return renderBoomBap(buffer, analysis, params.boombap, opts)
    case "trap":
      return renderTrap(buffer, analysis, params.trap, opts)
    case "lofi":
      return renderLoFi(buffer, analysis, params.lofi, opts)
    case "dnb":
      return renderDnb(buffer, analysis, params.dnb, opts)
    case "futurebass":
      return renderFutureBass(buffer, analysis, params.futurebass, opts)
    default:
      return renderDubstep(buffer, analysis, params.dubstep, opts)
  }
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

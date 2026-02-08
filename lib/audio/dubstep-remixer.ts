/**
 * Dubstep Remixer - Client-side port of remixers/dubstep.py
 *
 * Turns a song into a dubstep remix at 140 BPM using:
 *   - Beat/section analysis for sample selection
 *   - Chroma-based pitch matching
 *   - Tempo shifting to match 140 BPM
 *   - Wub, splash, hat layering with mixfactor
 *   - Beat stuttering intro compilation
 */

import {
  type AudioAnalysis,
  type ProgressCallback,
  analyzeAudio,
  extractSegment,
  concatenateSegments,
  truncateMix,
  shiftTempoFast,
  loadSample,
  computeChromaFast,
  toMono,
  computeMixfactor,
  mixSignals,
  padOrTrim,
  createSilence,
} from "./engine"
import { DUBSTEP_TEMPLATE, resolveSamplePath, getKeyedSample } from "./samples"

const TEMPLATE = DUBSTEP_TEMPLATE
const TARGET_TEMPO = TEMPLATE.tempo // 140 BPM

interface StereoAudio {
  left: Float32Array
  right: Float32Array
}

// Cache for loaded samples
const sampleCache = new Map<string, StereoAudio>()

async function getCachedSample(path: string): Promise<StereoAudio> {
  if (sampleCache.has(path)) return sampleCache.get(path)!
  const result = await loadSample(path)
  const stereo: StereoAudio = { left: result.left, right: result.right }
  sampleCache.set(path, stereo)
  return stereo
}

/**
 * Find beats/bars in a section matching a given pitch class.
 */
function getSamples(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
  beatTimes: number[],
  sectionBounds: [number, number],
  pitchClass: number,
  tempo: number
): [number, number][] {
  const matching: [number, number][] = []
  const [secStart, secEnd] = sectionBounds
  const beatDuration = 60.0 / tempo

  for (let i = 0; i < beatTimes.length; i++) {
    const beatStart = beatTimes[i]
    const beatEnd = i + 1 < beatTimes.length ? beatTimes[i + 1] : beatStart + beatDuration

    if (beatStart >= secStart && beatEnd <= secEnd) {
      const startSample = Math.floor(beatStart * sampleRate)
      const endSample = Math.min(Math.floor(beatEnd * sampleRate), left.length)

      if (endSample > startSample) {
        const mono = toMono(
          left.slice(startSample, endSample),
          right.slice(startSample, endSample)
        )
        if (mono.length > 256) {
          const chroma = computeChromaFast(mono, sampleRate)
          let bestPitch = 0
          let bestVal = 0
          for (let pc = 0; pc < 12; pc++) {
            if (chroma[pc] > bestVal) {
              bestVal = chroma[pc]
              bestPitch = pc
            }
          }
          if (bestPitch === pitchClass) {
            matching.push([beatStart, beatEnd])
          }
        }
      }
    }
  }
  return matching
}

/**
 * Search for samples of a given key in a section, trying fifths then chromatic.
 */
function searchSamples(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
  beatTimes: number[],
  sections: [number, number][],
  sectionIdx: number,
  initialKey: number,
  tempo: number
): [number, number][] {
  if (!sections.length || sectionIdx < 0 || sectionIdx >= sections.length) return []

  const section = sections[sectionIdx]
  let key = initialKey

  // Try initial key
  let found = getSamples(left, right, sampleRate, beatTimes, section, key, tempo)
  if (found.length > 0) return found

  // Try fifths
  for (let t = 0; t < 5; t++) {
    key = (key + 7) % 12
    found = getSamples(left, right, sampleRate, beatTimes, section, key, tempo)
    if (found.length > 0) return found
  }

  // Try chromatic in all sections
  for (let si = 0; si < sections.length; si++) {
    const secIdx = (sectionIdx + si) % sections.length
    key = initialKey
    for (let ct = 0; ct < 12; ct++) {
      found = getSamples(left, right, sampleRate, beatTimes, sections[secIdx], key, tempo)
      if (found.length > 0) return found
      key = (key + 1) % 12
    }
  }

  // Fallback: return any available beats in this section
  const fallback: [number, number][] = []
  const [secStart, secEnd] = section
  const beatDuration = 60.0 / tempo
  for (let i = 0; i < beatTimes.length; i++) {
    const bs = beatTimes[i]
    const be = i + 1 < beatTimes.length ? beatTimes[i + 1] : bs + beatDuration
    if (bs >= secStart && be <= secEnd) {
      fallback.push([bs, be])
    }
  }
  return fallback
}

/**
 * Compile the dubstep intro (8 bars at target tempo).
 * 4 bars of original + beat stuttering pattern.
 */
function compileIntro(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
  analysis: AudioAnalysis
): StereoAudio {
  const { beatTimes, barTimes, tempo } = analysis
  const beatDuration = 60.0 / tempo
  const segments: StereoAudio[] = []

  // Build custom bars (first 4 bars)
  const customBars: [number, number][][] = []
  if (beatTimes.length >= 16 && barTimes.length >= 4) {
    for (let b = 0; b < Math.min(4, barTimes.length); b++) {
      const [barStart, barEnd] = barTimes[b]
      const beatsInBar: [number, number][] = []
      for (let i = 0; i < beatTimes.length; i++) {
        if (beatTimes[i] >= barStart && beatTimes[i] < barEnd) {
          const be = i + 1 < beatTimes.length ? beatTimes[i + 1] : beatTimes[i] + beatDuration
          beatsInBar.push([beatTimes[i], be])
        }
      }
      while (beatsInBar.length < 4) {
        const lastEnd = beatsInBar.length > 0 ? beatsInBar[beatsInBar.length - 1][1] : barStart
        beatsInBar.push([lastEnd, lastEnd + beatDuration])
      }
      customBars.push(beatsInBar.slice(0, 4))
    }
  } else {
    // Synthetic beats
    for (let b = 0; b < 4; b++) {
      const bar: [number, number][] = []
      for (let j = 0; j < 4; j++) {
        const start = (b * 4 + j) * beatDuration
        bar.push([start, start + beatDuration])
      }
      customBars.push(bar)
    }
  }

  while (customBars.length < 4) {
    const lastEnd = customBars.length > 0
      ? customBars[customBars.length - 1][3][1]
      : 0
    const bar: [number, number][] = []
    for (let j = 0; j < 4; j++) {
      bar.push([lastEnd + j * beatDuration, lastEnd + (j + 1) * beatDuration])
    }
    customBars.push(bar)
  }

  // First 4 bars: play each beat in order
  for (const bar of customBars) {
    for (const [bs, be] of bar) {
      segments.push(extractSegment(left, right, sampleRate, bs, be))
    }
  }

  // Stutter patterns
  const fb1 = customBars[0][0] // first beat, first bar
  const fb2 = customBars[1][0] // first beat, second bar
  const fb3 = customBars[2][0] // first beat, third bar
  const fb4 = customBars[3][0] // first beat, fourth bar
  const tb4 = customBars[3][2] // third beat, fourth bar

  // First beat of bar 1 x4 (quarter notes)
  for (let i = 0; i < 4; i++) {
    segments.push(extractSegment(left, right, sampleRate, fb1[0], fb1[1]))
  }
  // First beat of bar 2 x4
  for (let i = 0; i < 4; i++) {
    segments.push(extractSegment(left, right, sampleRate, fb2[0], fb2[1]))
  }

  // First beat of bar 3 x8 (half-beat stutters)
  const halfDur3 = (fb3[1] - fb3[0]) / 2
  for (let i = 0; i < 8; i++) {
    segments.push(extractSegment(left, right, sampleRate, fb3[0], fb3[0] + halfDur3))
  }

  // First beat of bar 4 x8 (quarter-beat stutters)
  const quarterDur4 = (fb4[1] - fb4[0]) / 4
  for (let i = 0; i < 8; i++) {
    segments.push(extractSegment(left, right, sampleRate, fb4[0], fb4[0] + quarterDur4))
  }

  // Third beat of bar 4 x8
  const quarterDur4b = (tb4[1] - tb4[0]) / 4
  for (let i = 0; i < 8; i++) {
    segments.push(extractSegment(left, right, sampleRate, tb4[0], tb4[0] + quarterDur4b))
  }

  // Concatenate all segments
  const concatenated = concatenateSegments(segments)

  // Tempo shift to target
  const tempoRatio = TARGET_TEMPO / (tempo > 0 ? tempo : 120)
  const shifted = shiftTempoFast(concatenated.left, concatenated.right, tempoRatio)

  return shifted
}

/**
 * Compile one section of dubstep.
 * Returns two halves: (wub+splash+original) and (wubBreak+hats+original).
 */
function compileSection(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
  analysis: AudioAnalysis,
  sectionIdx: number,
  sectionBounds: [number, number]
): StereoAudio {
  const { beatTimes, sections, tonic, tempo } = analysis

  // Search for beats matching key patterns
  const s1 = searchSamples(left, right, sampleRate, beatTimes, sections, sectionIdx, tonic, tempo)
  const s2 = searchSamples(left, right, sampleRate, beatTimes, sections, sectionIdx, (tonic + 3) % 12, tempo)
  const s3 = searchSamples(left, right, sampleRate, beatTimes, sections, sectionIdx, (tonic + 9) % 12, tempo)

  // Get the biggest set as fallback
  const allSets = [s1, s2, s3].filter(s => s.length > 0)
  const biggest = allSets.length > 0
    ? allSets.reduce((a, b) => a.length > b.length ? a : b)
    : s1

  const useS1 = s1.length > 0 ? s1 : biggest
  const useS2 = s2.length > 0 ? s2 : biggest
  const useS3 = s3.length > 0 ? s3 : biggest

  if (useS1.length === 0) {
    // No samples found, return silence
    return createSilence(sampleRate, 4 * 60 / TARGET_TEMPO)
  }

  // Build the pattern: 4 beats of s1, 2 beats of s2, 2 beats of s3, repeated twice
  const patternSegments: StereoAudio[] = []
  for (let rep = 0; rep < 2; rep++) {
    for (let i = 0; i < 4; i++) {
      const t = useS1[i % useS1.length]
      patternSegments.push(extractSegment(left, right, sampleRate, t[0], t[1]))
    }
    for (let i = 0; i < 2; i++) {
      const t = useS2[i % useS2.length]
      patternSegments.push(extractSegment(left, right, sampleRate, t[0], t[1]))
    }
    for (let i = 0; i < 2; i++) {
      const t = useS3[i % useS3.length]
      patternSegments.push(extractSegment(left, right, sampleRate, t[0], t[1]))
    }
  }

  const concatenated = concatenateSegments(patternSegments)

  // Tempo shift
  const tempoRatio = TARGET_TEMPO / (tempo > 0 ? tempo : 120)
  const shifted = shiftTempoFast(concatenated.left, concatenated.right, tempoRatio)

  return shifted
}

/**
 * Main Dubstep remix function.
 * Takes decoded audio and returns the full remix as stereo Float32Arrays.
 */
export async function remixDubstep(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
  onProgress: ProgressCallback
): Promise<StereoAudio> {
  // Clear sample cache
  sampleCache.clear()

  onProgress("Analyzing track for tempo, beats, sections, and key...", 0.05)
  const analysis = analyzeAudio(left, right, sampleRate)

  onProgress(
    `Detected: ${analysis.tempo} BPM, Key: ${["C","C#","D","Eb","E","F","F#","G","G#","A","Bb","B"][analysis.tonic]}, ${analysis.sections.length} sections`,
    0.15
  )

  // Load intro sample
  onProgress("Loading dubstep samples...", 0.18)
  const introSample = await getCachedSample(resolveSamplePath(TEMPLATE, TEMPLATE.samples.intro as string))
  const hatsSample = await getCachedSample(resolveSamplePath(TEMPLATE, TEMPLATE.samples.hats as string))
  const wubSample = await getCachedSample(
    resolveSamplePath(TEMPLATE, getKeyedSample(TEMPLATE.samples.wubs as string[], analysis.tonic))
  )
  const wubBreakSample = await getCachedSample(
    resolveSamplePath(TEMPLATE, getKeyedSample(TEMPLATE.samples.wubBreaks as string[], analysis.tonic))
  )

  // Compile intro
  onProgress("Arranging intro...", 0.20)
  const introPieces = compileIntro(left, right, sampleRate, analysis)

  // Mix intro with intro sample
  const introMix = computeMixfactor(introPieces.left, introPieces.right)
  const intro = truncateMix(introSample.left, introSample.right, introPieces.left, introPieces.right, introMix)

  // Collect all encoded parts
  const parts: StereoAudio[] = [intro]

  // Compile sections
  const numSections = analysis.sections.length
  for (let i = 0; i < numSections; i++) {
    const sectionProgress = 0.25 + (0.55 * (i / Math.max(numSections, 1)))
    onProgress(`Arranging section ${i + 1} of ${numSections}...`, sectionProgress)

    const sectionBounds = analysis.sections[i]
    const sectionAudio = compileSection(left, right, sampleRate, analysis, i, sectionBounds)

    // Mix with wub and splash samples
    const splashIdx = (i + 1) % (TEMPLATE.samples.splashes as string[]).length
    const splashSample = await getCachedSample(
      resolveSamplePath(TEMPLATE, (TEMPLATE.samples.splashes as string[])[splashIdx])
    )

    const mf = computeMixfactor(sectionAudio.left, sectionAudio.right)

    // Part A: wub+splash mixed with original section
    const wubSplash = mixSignals(wubSample.left, wubSample.right, 0.5, splashSample.left, splashSample.right, 0.5)
    const partA = truncateMix(wubSplash.left, wubSplash.right, sectionAudio.left, sectionAudio.right, mf)

    // Part B: wubBreak+hats mixed with original section
    const breakHats = mixSignals(wubBreakSample.left, wubBreakSample.right, 0.5, hatsSample.left, hatsSample.right, 0.5)
    const partB = truncateMix(breakHats.left, breakHats.right, sectionAudio.left, sectionAudio.right, mf)

    parts.push(partA)
    parts.push(partB)
  }

  // Add ending splash
  onProgress("Adding ending...", 0.85)
  const endIdx = ((numSections > 0 ? numSections - 1 : 0) + 1) % (TEMPLATE.samples.splashEnds as string[]).length
  const endSplash = await getCachedSample(
    resolveSamplePath(TEMPLATE, (TEMPLATE.samples.splashEnds as string[])[endIdx])
  )
  parts.push(endSplash)

  // Concatenate all parts
  onProgress("Mixing down...", 0.90)
  const finalAudio = concatenateSegments(parts)

  // Normalize
  onProgress("Normalizing...", 0.95)
  let maxVal = 0
  for (let i = 0; i < finalAudio.left.length; i++) {
    maxVal = Math.max(maxVal, Math.abs(finalAudio.left[i]), Math.abs(finalAudio.right[i]))
  }
  if (maxVal > 0.95) {
    const gain = 0.95 / maxVal
    for (let i = 0; i < finalAudio.left.length; i++) {
      finalAudio.left[i] *= gain
      finalAudio.right[i] *= gain
    }
  }

  // Clean up cache
  sampleCache.clear()

  return finalAudio
}

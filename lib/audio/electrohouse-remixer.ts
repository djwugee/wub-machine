/**
 * Electro House Remixer - Client-side port of remixers/electrohouse.py
 *
 * Turns a song into an electro house remix at 128 BPM using:
 *   - Pattern-driven note arrangement from intro.txt / section.txt
 *   - Chroma-based pitch matching for beat selection
 *   - Tempo shifting to 128 BPM
 *   - Body sample layering keyed to song's tonic
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
  createSilence,
} from "./engine"
import { ELECTROHOUSE_TEMPLATE, resolveSamplePath, getKeyedSample } from "./samples"

const TEMPLATE = ELECTROHOUSE_TEMPLATE
const TARGET_TEMPO = TEMPLATE.tempo // 128 BPM

interface StereoAudio {
  left: Float32Array
  right: Float32Array
}

// ============================================================================
// Pattern parsing (port of readPattern from electrohouse.py)
// ============================================================================

interface PatternNote {
  pitch: number | null // 0-11 interval from tonic, null = rest
  lengthKey: number    // 1=16th, 2=8th, 3=dotted8th, 4=quarter
}

/**
 * Parse a pattern text file into an array of notes.
 * Pattern format: every 2 characters = one sixteenth note position.
 * Numbers (0-11) = pitched notes (semitone interval from tonic).
 * "-" = tie/hold (extends previous note).
 * Space = rest.
 */
function parsePattern(text: string): PatternNote[] {
  const lines = text.split("\n")
  const notes: PatternNote[] = []

  for (const line of lines) {
    // Skip comments, separator lines, and empty lines
    if (line.includes("#") || line.includes("+") || line.trim() === "") continue

    // Parse pairs of characters (every 2 chars = one 16th note position)
    for (let i = 0; i < line.length; i += 2) {
      const pair = line.substring(i, Math.min(i + 2, line.length)).trimEnd()

      if (!pair || pair === "  " || pair.trim() === "") {
        // Rest
        notes.push({ pitch: null, lengthKey: 1 })
      } else if (pair.trim() === "-") {
        // Tie: extend previous note
        if (notes.length > 0) {
          const prev = notes[notes.length - 1]
          const newLength = Math.min(prev.lengthKey + 1, 4)
          notes[notes.length - 1] = { pitch: prev.pitch, lengthKey: newLength }
        } else {
          notes.push({ pitch: null, lengthKey: 1 })
        }
      } else {
        // Try parsing as a number (pitch)
        const trimmed = pair.trim()
        const val = parseInt(trimmed, 10)
        if (!isNaN(val)) {
          notes.push({ pitch: val % 12, lengthKey: 1 })
        } else {
          notes.push({ pitch: null, lengthKey: 1 })
        }
      }
    }
  }

  return notes
}

// Hardcoded patterns from the samples/electrohouse/ text files
// Ported directly from the pattern files read earlier

const INTRO_PATTERN = `1 e + a 2 e + a 3 e + a 4 e + a 1 e + a 2 e + a 3 e + a 4 e + a 1 e + a 2 e + a 3 e + a 4 e + a 1 e + a 2 e + a 3 e + a 4 e + a
    0 - - - 0 -     0 - 3 - 5 -     0 -     0 -     10  7 7 5       0 -     0 -     0 - 3 - 5 -     0 - 4   0 - 5   10  7 7 5   
    0 - 5 5 0 -     5 - 7 - 7 6     3       5       10  7 3 5       0 -     0 -     0 - 3 - 5 -     0 - 4   0 - 5   10  7 7 11  
    0 2 3 4 5       0 - 3 - 5 - 10  0 - 6   0 - 6   10  7 6 5     7 0 - 8   0 - 9   0 - 3 4 5 5     0 - 4 4 0 6 5 7 10  3 4 5   
    0 - 5 5 0 -     5 - 7 - 7 6     3       5       10  7 3 5 1   7 0 -   1 0 2   1 0 - 3 - 5 - 0 1 2 3 4 5 6 7 8 9 1011120 0 - 
    0 -     0 -     0 - 3 - 5 -     0 -     0 -     10  7 7 5       0 -     0 -     0 - 3 - 5 -     0 - 4   0 - 5   10  7 7 5   
    0 - 5 5 0 -     5 - 7 - 7 6     3       5       10  7 3 5       0 -     0 -     0 - 3 - 5 -     0 - 4   0 - 5   10  7 7 11  `

const SECTION_PATTERN = `1 e + a 2 e + a 3 e + a 4 e + a 1 e + a 2 e + a 3 e + a 4 e + a 1 e + a 2 e + a 3 e + a 4 e + a 1 e + a 2 e + a 3 e + a 4 e + a
0 - 0 - 2   0 - 11  0 - 3 - 5 -     0 - - - 3 - - - 10  7 7 5 4 -   0 -     0 - - - 0 - 3 - 5 - - - 0 - 4   0 - 5   10  7 7 5   
    0 - 5 5 0 -     5 - 7 - 7 6     3       5       10  7 3 5       0 -     0 -     0 - 3 - 5 -     0 - 4   0 - 5   10  7 7 11  
    0 2 3 4 5       0 - 3 - 5 - 10  0 - 6   0 - 6   10  7 6 5     7 0 - 8   0 - 9   0 - 3 4 5 5     0 - 4 4 0 6 5 7 10  3 4 5   
0 - 0 - 2   0 - 11  0 - 3 - 5 -     0 - - - 3 - - - 10  7 7 5 4 -   0 -     0 - - - 0 - 3 - 5 - - - 0 - 4   0 - 5   10  7 7 5   
    0 -     0 -     0 - 3 - 5 -     0 -     0 -     10  7 7 5       0 -     0 -     0 - 3 - 5 -     0 - 4   0 - 5   10  7 7 5   
    0 - 5 5 0 -     5 - 7 - 7 6     3       5       10  7 3 5       0 -     0 -     0 - 3 - 5 -     0 - 4   0 - 5   10  7 7 11  `

// Cache
const sampleCache = new Map<string, StereoAudio>()

async function getCachedSample(path: string): Promise<StereoAudio> {
  if (sampleCache.has(path)) return sampleCache.get(path)!
  const result = await loadSample(path)
  const stereo: StereoAudio = { left: result.left, right: result.right }
  sampleCache.set(path, stereo)
  return stereo
}

/**
 * Find beats matching a pitch class in a section.
 */
function searchSamples(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
  beatTimes: number[],
  sections: [number, number][],
  sectionIdx: number,
  pitchClass: number,
  tempo: number
): [number, number][] {
  if (!sections.length) return []
  const secIdx = Math.min(sectionIdx, sections.length - 1)
  const section = sections[secIdx]
  const beatDuration = 60.0 / tempo

  // Try the exact pitch class in this section first
  let key = pitchClass
  let found = findMatching(left, right, sampleRate, beatTimes, section, key, beatDuration)
  if (found.length > 0) return found

  // Try fifths
  for (let t = 0; t < 5; t++) {
    key = (key + 7) % 12
    found = findMatching(left, right, sampleRate, beatTimes, section, key, beatDuration)
    if (found.length > 0) return found
  }

  // Try all chromatic keys
  key = pitchClass
  for (let t = 0; t < 12; t++) {
    found = findMatching(left, right, sampleRate, beatTimes, section, key, beatDuration)
    if (found.length > 0) return found
    key = (key + 1) % 12
  }

  // Fallback: any beats in this section
  const fallback: [number, number][] = []
  const [secStart, secEnd] = section
  for (let i = 0; i < beatTimes.length; i++) {
    const bs = beatTimes[i]
    const be = i + 1 < beatTimes.length ? beatTimes[i + 1] : bs + beatDuration
    if (bs >= secStart && be <= secEnd) {
      fallback.push([bs, be])
    }
  }
  return fallback
}

function findMatching(
  left: Float32Array, right: Float32Array, sampleRate: number,
  beatTimes: number[], section: [number, number],
  pitchClass: number, beatDuration: number
): [number, number][] {
  const matching: [number, number][] = []
  const [secStart, secEnd] = section

  for (let i = 0; i < beatTimes.length; i++) {
    const bs = beatTimes[i]
    const be = i + 1 < beatTimes.length ? beatTimes[i + 1] : bs + beatDuration
    if (bs >= secStart && be <= secEnd) {
      const startSample = Math.floor(bs * sampleRate)
      const endSample = Math.min(Math.floor(be * sampleRate), left.length)
      if (endSample > startSample) {
        const mono = toMono(left.slice(startSample, endSample), right.slice(startSample, endSample))
        if (mono.length > 256) {
          const chroma = computeChromaFast(mono, sampleRate)
          let bestPC = 0, bestVal = 0
          for (let pc = 0; pc < 12; pc++) {
            if (chroma[pc] > bestVal) { bestVal = chroma[pc]; bestPC = pc }
          }
          if (bestPC === pitchClass) matching.push([bs, be])
        }
      }
    }
  }
  return matching
}

/**
 * Cut a note to a specific rhythmic length based on lengthKey.
 * Returns the audio data trimmed (or padded) to the right length.
 */
function cutNote(
  audioL: Float32Array,
  audioR: Float32Array,
  sampleRate: number,
  lengthKey: number
): StereoAudio {
  const beatLengthSamples = Math.floor((sampleRate * 60.0) / TARGET_TEMPO)

  let divisionFactor: number
  switch (lengthKey) {
    case 1: divisionFactor = 4; break    // sixteenth
    case 2: divisionFactor = 2; break    // eighth
    case 3: divisionFactor = 1 / 0.75; break // dotted eighth
    case 4: divisionFactor = 1; break    // quarter
    default: divisionFactor = 4; break
  }

  const desiredLength = Math.floor(beatLengthSamples / divisionFactor)
  const actualLength = Math.min(audioL.length, desiredLength)

  const outL = new Float32Array(desiredLength)
  const outR = new Float32Array(desiredLength)
  outL.set(audioL.subarray(0, actualLength))
  outR.set(audioR.subarray(0, actualLength))

  return { left: outL, right: outR }
}

/**
 * Create a rest (silence) of a specific rhythmic length.
 */
function createRest(sampleRate: number, lengthKey: number): StereoAudio {
  const beatLengthSamples = Math.floor((sampleRate * 60.0) / TARGET_TEMPO)
  let divisionFactor: number
  switch (lengthKey) {
    case 1: divisionFactor = 4; break
    case 2: divisionFactor = 2; break
    case 3: divisionFactor = 1 / 0.75; break
    case 4: divisionFactor = 1; break
    default: divisionFactor = 4; break
  }
  const numSamples = Math.floor(beatLengthSamples / divisionFactor)
  return {
    left: new Float32Array(numSamples),
    right: new Float32Array(numSamples),
  }
}

/**
 * Compile a section using a pattern.
 * For each note in the pattern, find matching beat in original audio,
 * tempo-shift it, cut to note length, and concatenate.
 */
function compileWithPattern(
  patternText: string,
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
  analysis: AudioAnalysis,
  sectionIdx: number
): StereoAudio {
  const notes = parsePattern(patternText)
  const { beatTimes, sections, tonic, tempo } = analysis
  const tempoRatio = TARGET_TEMPO / (tempo > 0 ? tempo : 120)

  const outputParts: StereoAudio[] = []
  const shiftCache = new Map<string, StereoAudio>()

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i]

    if (note.pitch === null) {
      // Rest
      outputParts.push(createRest(sampleRate, note.lengthKey))
    } else {
      const pitchClass = (note.pitch + tonic) % 12
      const samples = searchSamples(left, right, sampleRate, beatTimes, sections, sectionIdx, pitchClass, tempo)

      if (samples.length === 0) {
        outputParts.push(createRest(sampleRate, note.lengthKey))
      } else {
        // Select a sample from the matching set
        const [bs, be] = samples[i % samples.length]
        const cacheKey = `${bs.toFixed(4)}-${be.toFixed(4)}`

        let shifted: StereoAudio
        if (shiftCache.has(cacheKey)) {
          shifted = shiftCache.get(cacheKey)!
        } else {
          const seg = extractSegment(left, right, sampleRate, bs, be)
          shifted = shiftTempoFast(seg.left, seg.right, tempoRatio)
          shiftCache.set(cacheKey, shifted)
        }

        // Cut the tempo-shifted sample to the note length
        const cutAudio = cutNote(shifted.left, shifted.right, sampleRate, note.lengthKey)
        outputParts.push(cutAudio)
      }
    }
  }

  return concatenateSegments(outputParts)
}

/**
 * Main Electro House remix function.
 */
export async function remixElectroHouse(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
  onProgress: ProgressCallback
): Promise<StereoAudio> {
  sampleCache.clear()

  onProgress("Analyzing track for tempo, beats, sections, and key...", 0.05)
  const analysis = analyzeAudio(left, right, sampleRate)

  onProgress(
    `Detected: ${analysis.tempo} BPM, Key: ${["C","C#","D","Eb","E","F","F#","G","G#","A","Bb","B"][analysis.tonic]}, ${analysis.sections.length} sections`,
    0.15
  )

  // Load samples
  onProgress("Loading electro house samples...", 0.18)
  const introSample = await getCachedSample(resolveSamplePath(TEMPLATE, TEMPLATE.samples.intro as string))
  const bodySample = await getCachedSample(
    resolveSamplePath(TEMPLATE, getKeyedSample(TEMPLATE.samples.body as string[], analysis.tonic))
  )

  // Compile intro using pattern
  onProgress("Arranging intro...", 0.20)
  const introPieces = compileWithPattern(INTRO_PATTERN, left, right, sampleRate, analysis, 0)

  // Mix intro with intro sample
  const intro = truncateMix(introSample.left, introSample.right, introPieces.left, introPieces.right, 0.3)

  const parts: StereoAudio[] = [intro]

  // Compile sections
  const sections = analysis.sections.length % 2 === 0 ? analysis.sections : analysis.sections.slice(1)
  const numSections = sections.length
  const midpoint = Math.floor(numSections / 2) + 1

  if (numSections > 2) {
    for (let i = 0; i < numSections; i++) {
      const sectionProgress = 0.25 + (0.55 * (i / Math.max(numSections, 1)))
      onProgress(`Arranging section ${i + 1} of ${numSections}...`, sectionProgress)

      if (i === midpoint) {
        // Re-intro at midpoint
        const reIntroPieces = compileWithPattern(INTRO_PATTERN, left, right, sampleRate, analysis, i)
        const reIntro = truncateMix(introSample.left, introSample.right, reIntroPieces.left, reIntroPieces.right, 0.3)
        parts.push(reIntro)
      } else {
        // Normal section with body backing
        const sectionPieces = compileWithPattern(SECTION_PATTERN, left, right, sampleRate, analysis, i)
        const sectionAudio = truncateMix(bodySample.left, bodySample.right, sectionPieces.left, sectionPieces.right, 0.3)
        parts.push(sectionAudio)
      }
    }
  }

  // Add ending splash
  onProgress("Adding ending...", 0.85)
  const endIdx = ((numSections > 0 ? numSections - 1 : 0) + 1) % (TEMPLATE.samples.splashEnds as string[]).length
  const endSplash = await getCachedSample(
    resolveSamplePath(TEMPLATE, (TEMPLATE.samples.splashEnds as string[])[endIdx])
  )
  parts.push(endSplash)

  // Concatenate
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

  sampleCache.clear()
  return finalAudio
}

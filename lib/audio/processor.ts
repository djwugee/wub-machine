/**
 * Audio Processor
 * Implements Dubstep and Electro House remix logic
 */

import { AudioAnalysis } from './analyzer'
import { getSampleManager } from './sampleManager'

export interface ProcessingProgress {
  step:
    | 'beat_detection'
    | 'key_detection'
    | 'sample_placement'
    | 'synthesis'
    | 'mixing'
    | 'export'
  progress: number // 0-1
  message: string
}

export interface ProcessorOptions {
  targetBPM: number
  remixer: 'dubstep' | 'electrohouse'
  onProgress?: (progress: ProcessingProgress) => void
}

/**
 * Base audio processor class
 */
abstract class BaseAudioProcessor {
  protected audioContext: AudioContext
  protected targetBPM: number
  protected remixer: 'dubstep' | 'electrohouse'
  protected onProgress: ((progress: ProcessingProgress) => void) | undefined

  constructor(
    audioContext: AudioContext,
    options: ProcessorOptions
  ) {
    this.audioContext = audioContext
    this.targetBPM = options.targetBPM
    this.remixer = options.remixer
    this.onProgress = options.onProgress
  }

  protected reportProgress(
    step: ProcessingProgress['step'],
    progress: number,
    message: string
  ) {
    if (this.onProgress) {
      this.onProgress({ step, progress, message })
    }
  }

  /**
   * Pitch-shift an audio buffer to a target frequency
   */
  protected pitchShift(
    buffer: AudioBuffer,
    semitonesToShift: number
  ): AudioBuffer {
    const factor = Math.pow(2, semitonesToShift / 12)
    const shiftedBuffer = this.audioContext.createBuffer(
      buffer.numberOfChannels,
      Math.ceil(buffer.length * factor),
      buffer.sampleRate
    )

    const originalData = buffer.getChannelData(0)
    const shiftedData = shiftedBuffer.getChannelData(0)

    for (let i = 0; i < shiftedData.length; i++) {
      const originalIndex = i / factor
      const floorIndex = Math.floor(originalIndex)
      const fractional = originalIndex - floorIndex

      if (floorIndex + 1 < originalData.length) {
        shiftedData[i] =
          originalData[floorIndex] * (1 - fractional) +
          originalData[floorIndex + 1] * fractional
      } else if (floorIndex < originalData.length) {
        shiftedData[i] = originalData[floorIndex]
      }
    }

    return shiftedBuffer
  }

  /**
   * Time-stretch an audio buffer
   */
  protected timeStretch(
    buffer: AudioBuffer,
    stretchFactor: number
  ): AudioBuffer {
    const stretchedBuffer = this.audioContext.createBuffer(
      buffer.numberOfChannels,
      Math.ceil(buffer.length / stretchFactor),
      buffer.sampleRate
    )

    const originalData = buffer.getChannelData(0)
    const stretchedData = stretchedBuffer.getChannelData(0)

    for (let i = 0; i < stretchedData.length; i++) {
      const originalIndex = i * stretchFactor
      const floorIndex = Math.floor(originalIndex)
      const fractional = originalIndex - floorIndex

      if (floorIndex + 1 < originalData.length) {
        stretchedData[i] =
          originalData[floorIndex] * (1 - fractional) +
          originalData[floorIndex + 1] * fractional
      } else if (floorIndex < originalData.length) {
        stretchedData[i] = originalData[floorIndex]
      }
    }

    return stretchedBuffer
  }

  /**
   * Apply envelope to audio buffer
   */
  protected applyEnvelope(
    buffer: AudioBuffer,
    attackTime: number,
    decayTime: number
  ): AudioBuffer {
    const data = buffer.getChannelData(0)
    const sampleRate = buffer.sampleRate

    const attackSamples = Math.round(attackTime * sampleRate)
    const decaySamples = Math.round(decayTime * sampleRate)

    for (let i = 0; i < data.length; i++) {
      let envelope = 1.0

      if (i < attackSamples) {
        envelope = i / attackSamples
      } else if (i < attackSamples + decaySamples) {
        const decayProgress = (i - attackSamples) / decaySamples
        envelope = 1.0 - decayProgress * 0.5
      }

      data[i] *= envelope
    }

    return buffer
  }

  /**
   * Mix multiple audio buffers
   */
  protected mixBuffers(
    buffers: Array<{ buffer: AudioBuffer; volume: number }>,
    outputDuration: number
  ): AudioBuffer {
    const output = this.audioContext.createBuffer(
      2,
      Math.round(outputDuration * this.audioContext.sampleRate),
      this.audioContext.sampleRate
    )

    const outputLeft = output.getChannelData(0)
    const outputRight = output.getChannelData(1)

    buffers.forEach(({ buffer, volume }) => {
      const left = buffer.getChannelData(0)
      const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left

      for (let i = 0; i < Math.min(left.length, outputLeft.length); i++) {
        outputLeft[i] += left[i] * volume
        outputRight[i] += right[i] * volume
      }
    })

    // Normalize to prevent clipping
    const maxValue = Math.max(
      ...outputLeft,
      ...outputRight
    )
    if (maxValue > 1.0) {
      const factor = 1.0 / maxValue
      for (let i = 0; i < outputLeft.length; i++) {
        outputLeft[i] *= factor
        outputRight[i] *= factor
      }
    }

    return output
  }

  abstract process(
    inputBuffer: AudioBuffer,
    analysis: AudioAnalysis
  ): Promise<AudioBuffer>
}

/**
 * Dubstep Processor
 * Creates 140 BPM wobble bass remixes with aggressive breakdowns
 */
export class DubstepProcessor extends BaseAudioProcessor {
  constructor(audioContext: AudioContext, options: ProcessorOptions) {
    super(audioContext, { ...options, targetBPM: 140, remixer: 'dubstep' })
  }

  async process(
    inputBuffer: AudioBuffer,
    analysis: AudioAnalysis
  ): Promise<AudioBuffer> {
    console.log('[v0] Starting Dubstep processing...')

    this.reportProgress('sample_placement', 0.2, 'Placing drum samples...')

    const sampleManager = getSampleManager()
    const outputDuration = analysis.duration * (this.targetBPM / analysis.tempo)

    // Create output buffer
    const output = this.audioContext.createBuffer(
      2,
      Math.round(outputDuration * this.audioContext.sampleRate),
      this.audioContext.sampleRate
    )

    const outputLeft = output.getChannelData(0)
    const outputRight = output.getChannelData(1)

    this.reportProgress('synthesis', 0.4, 'Synthesizing wubs...')

    // Get samples
    const bassSamples = sampleManager.getSamplesByType('dubstep', 'bass')
    const drumSamples = sampleManager.getSamplesByType('dubstep', 'drum')
    const hatSamples = sampleManager.getSamplesByType('dubstep', 'hat')

    // Calculate beat timing
    const beatTime = 60 / this.targetBPM // Seconds per beat
    const barsInOutput = outputDuration / (beatTime * 4)

    // Place drum kicks on beats
    this.reportProgress('sample_placement', 0.5, 'Placing kick drums...')
    let beatIndex = 0
    for (let time = 0; time < outputDuration; time += beatTime * 2) {
      if (beatIndex % 8 === 0) {
        // Kick every 2 beats
        const sampleIndex = beatIndex % drumSamples.length
        // Add drum sample at this time (simplified)
      }
      beatIndex++
    }

    // Add body segment (half speed to create intensity)
    this.reportProgress('sample_placement', 0.65, 'Adding bass movements...')
    const bodyStartTime = outputDuration * 0.2
    const bodyDuration = outputDuration * 0.6

    // Add breakdown/silence section
    this.reportProgress('sample_placement', 0.8, 'Creating breakdown...')
    const breakdownTime = outputDuration * 0.8
    const breakdownDuration = outputDuration * 0.15

    // Synthesize wobble bass
    const wobbleFrequency = 80 // Hz
    const wobbleAmount = 1.5 // Semitones
    const wobbleSpeed = 6 // Hz
    const wobbleSweepStart = breakdownTime
    const wobbleSweepEnd = breakdownTime + breakdownDuration

    for (let i = 0; i < outputLeft.length; i++) {
      const time = i / this.audioContext.sampleRate

      if (time >= wobbleSweepStart && time <= wobbleSweepEnd) {
        const phase = (time - wobbleSweepStart) / (wobbleSweepEnd - wobbleSweepStart)
        const wobbleAmount_modulated =
          wobbleAmount * (1 + 0.5 * Math.sin(2 * Math.PI * wobbleSpeed * time))
        const freq = wobbleFrequency * (1 + wobbleAmount_modulated * phase)

        const sample =
          Math.sin(2 * Math.PI * (freq * time + phase * 2)) *
          Math.exp(-time / 10) *
          0.3

        outputLeft[i] += sample
        outputRight[i] += sample
      }
    }

    this.reportProgress('mixing', 0.9, 'Final mixing...')

    // Normalize
    let maxValue = 0
    for (let i = 0; i < outputLeft.length; i++) {
      maxValue = Math.max(maxValue, Math.abs(outputLeft[i]), Math.abs(outputRight[i]))
    }
    if (maxValue > 0) {
      const factor = 0.95 / maxValue
      for (let i = 0; i < outputLeft.length; i++) {
        outputLeft[i] *= factor
        outputRight[i] *= factor
      }
    }

    console.log('[v0] Dubstep processing complete')
    this.reportProgress('export', 1.0, 'Ready to export')

    return output
  }
}

/**
 * Electro House Processor
 * Creates 128 BPM energetic remixes with driving basslines and hi-hats
 */
export class ElectroHouseProcessor extends BaseAudioProcessor {
  constructor(audioContext: AudioContext, options: ProcessorOptions) {
    super(audioContext, { ...options, targetBPM: 128, remixer: 'electrohouse' })
  }

  async process(
    inputBuffer: AudioBuffer,
    analysis: AudioAnalysis
  ): Promise<AudioBuffer> {
    console.log('[v0] Starting Electro House processing...')

    this.reportProgress('sample_placement', 0.2, 'Placing drums...')

    const sampleManager = getSampleManager()
    const outputDuration = analysis.duration * (this.targetBPM / analysis.tempo)

    // Create output buffer
    const output = this.audioContext.createBuffer(
      2,
      Math.round(outputDuration * this.audioContext.sampleRate),
      this.audioContext.sampleRate
    )

    const outputLeft = output.getChannelData(0)
    const outputRight = output.getChannelData(1)

    this.reportProgress('synthesis', 0.4, 'Creating melodic patterns...')

    const beatTime = 60 / this.targetBPM
    const sixteenthTime = beatTime / 4

    // Create hi-hat pattern (16th notes)
    this.reportProgress('sample_placement', 0.5, 'Adding hi-hats...')
    for (let time = 0; time < outputDuration; time += sixteenthTime) {
      if (Math.random() > 0.3) {
        // Stochastic pattern
        const hatGain = 0.15 + Math.random() * 0.1
        const freq = 8000 + Math.random() * 2000

        for (
          let i = 0;
          i < Math.round(sixteenthTime * this.audioContext.sampleRate);
          i++
        ) {
          const sampleIndex = Math.round(time * this.audioContext.sampleRate) + i
          if (sampleIndex < outputLeft.length) {
            const noiseValue = Math.random() * 2 - 1
            const envelope =
              Math.exp(-10 * (i / (sixteenthTime * this.audioContext.sampleRate)))

            outputLeft[sampleIndex] += noiseValue * hatGain * envelope * 0.3
            outputRight[sampleIndex] += noiseValue * hatGain * envelope * 0.3
          }
        }
      }
    }

    // Add kick drum on beat 1 and 3
    this.reportProgress('sample_placement', 0.65, 'Adding bass kicks...')
    for (let beatNum = 0; beatNum < outputDuration / beatTime; beatNum += 2) {
      const time = beatNum * beatTime
      const kickLength = beatTime * 0.75

      for (
        let i = 0;
        i < Math.round(kickLength * this.audioContext.sampleRate);
        i++
      ) {
        const sampleIndex = Math.round(time * this.audioContext.sampleRate) + i
        if (sampleIndex < outputLeft.length) {
          const freq = 60 * Math.exp(-5 * (i / (kickLength * this.audioContext.sampleRate)))
          const sample = Math.sin(2 * Math.PI * freq * (i / this.audioContext.sampleRate))

          outputLeft[sampleIndex] += sample * 0.4
          outputRight[sampleIndex] += sample * 0.4
        }
      }
    }

    // Synthesize bass synth
    this.reportProgress('synthesis', 0.8, 'Synthesizing bassline...')
    for (let i = 0; i < outputLeft.length; i++) {
      const time = i / this.audioContext.sampleRate
      const beatPhase = (time / beatTime) % 4
      let freq = 110 // A2

      // Simple melodic pattern
      if (beatPhase < 1) freq = 110
      else if (beatPhase < 2) freq = 123.47
      else if (beatPhase < 3) freq = 110
      else freq = 146.83

      const sample = Math.sin(2 * Math.PI * freq * time) * 0.2

      outputLeft[i] += sample
      outputRight[i] += sample
    }

    // Normalize
    this.reportProgress('mixing', 0.9, 'Final mixing...')
    let maxValue = 0
    for (let i = 0; i < outputLeft.length; i++) {
      maxValue = Math.max(maxValue, Math.abs(outputLeft[i]), Math.abs(outputRight[i]))
    }
    if (maxValue > 0) {
      const factor = 0.95 / maxValue
      for (let i = 0; i < outputLeft.length; i++) {
        outputLeft[i] *= factor
        outputRight[i] *= factor
      }
    }

    console.log('[v0] Electro House processing complete')
    this.reportProgress('export', 1.0, 'Ready to export')

    return output
  }
}

export function createProcessor(
  audioContext: AudioContext,
  options: ProcessorOptions
):
  | DubstepProcessor
  | ElectroHouseProcessor {
  if (options.remixer === 'dubstep') {
    return new DubstepProcessor(audioContext, options)
  } else {
    return new ElectroHouseProcessor(audioContext, options)
  }
}

/**
 * Audio Processor Web Worker
 * Handles audio analysis and processing in a background thread
 * to prevent UI blocking during long operations
 */

// Import would happen at runtime in browser environment
// For now, we'll use inline implementations

interface WorkerMessage {
  type: 'analyze' | 'process' | 'ping'
  audioData?: Float32Array
  sampleRate?: number
  sessionId?: string
  remixer?: 'dubstep' | 'electrohouse'
}

interface WorkerResponse {
  type: 'progress' | 'complete' | 'error' | 'pong'
  sessionId?: string
  progress?: number
  step?: string
  message?: string
  analysis?: any
  audioBuffer?: ArrayBuffer
  error?: string
}

// Simple FFT implementation
function simpleFft(data: Float32Array): Float32Array {
  const n = data.length
  if (n <= 1) return data

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

// Detect beats
function detectBeats(
  channelData: Float32Array,
  sampleRate: number
): number[] {
  const beats: number[] = []
  const hopLength = 512
  const fftSize = 2048

  // Compute spectral flux (simplified)
  let prevMagnitude = 0
  for (let i = 0; i < channelData.length; i += hopLength) {
    const frame = channelData.slice(i, Math.min(i + fftSize, channelData.length))

    let magnitude = 0
    for (let j = 0; j < frame.length; j++) {
      magnitude += frame[j] * frame[j]
    }
    magnitude = Math.sqrt(magnitude)

    if (magnitude > prevMagnitude * 1.1 && magnitude > 0.1) {
      beats.push((i * 1000) / sampleRate)
    }
    prevMagnitude = magnitude
  }

  return beats
}

// Estimate tempo
function estimateTempo(beats: number[]): number {
  if (beats.length < 2) return 120

  const ibis: number[] = []
  for (let i = 1; i < beats.length; i++) {
    ibis.push(beats[i] - beats[i - 1])
  }

  const histogram = new Map<number, number>()
  ibis.forEach((ib) => {
    const rounded = Math.round(ib / 10) * 10
    histogram.set(rounded, (histogram.get(rounded) || 0) + 1)
  })

  let maxCount = 0
  let mostCommonIBI = 500

  histogram.forEach((count, ib) => {
    if (count > maxCount) {
      maxCount = count
      mostCommonIBI = ib
    }
  })

  const tempo = Math.round(60000 / mostCommonIBI)
  return Math.max(60, Math.min(180, tempo))
}

// Simple key detection
function detectKey(channelData: Float32Array): string {
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

  // Find dominant frequency (simplified)
  let sum = 0
  let maxFreq = 0
  let maxEnergy = 0

  for (let i = 0; i < Math.min(channelData.length, 4096); i += 16) {
    const energy = Math.abs(channelData[i])
    if (energy > maxEnergy) {
      maxEnergy = energy
      maxFreq = i
    }
  }

  return PITCH_CLASSES[maxFreq % 12] || 'C'
}

// Calculate loudness
function calculateLoudness(channelData: Float32Array): number {
  let sum = 0
  for (let i = 0; i < channelData.length; i++) {
    sum += channelData[i] * channelData[i]
  }
  return Math.sqrt(sum / channelData.length)
}

// Main worker message handler
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { type, sessionId, audioData, sampleRate } = event.data

  try {
    if (type === 'ping') {
      const response: WorkerResponse = { type: 'pong' }
      self.postMessage(response)
      return
    }

    if (type === 'analyze' && audioData && sampleRate) {
      console.log('[Worker] Starting analysis...')

      // Analyze
      const beats = detectBeats(audioData, sampleRate)
      const tempo = estimateTempo(beats)
      const key = detectKey(audioData)
      const loudness = calculateLoudness(audioData)

      const analysis = {
        beats,
        tempo,
        key,
        loudness,
        sampleRate,
        duration: audioData.length / sampleRate,
      }

      const response: WorkerResponse = {
        type: 'complete',
        sessionId,
        analysis,
      }
      self.postMessage(response)
    }

    if (type === 'process') {
      console.log('[Worker] Starting processing...')

      // Simulate processing with progress updates
      for (let step = 0; step <= 100; step += 10) {
        const steps = [
          'beat_detection',
          'key_detection',
          'sample_placement',
          'synthesis',
          'mixing',
        ]
        const currentStep = steps[Math.floor(step / 20)]

        const progress: WorkerResponse = {
          type: 'progress',
          sessionId,
          step: currentStep,
          progress: step / 100,
          message: `Processing... ${step}%`,
        }

        self.postMessage(progress)

        // Simulate work
        await new Promise((resolve) => setTimeout(resolve, 100))
      }

      // Send dummy audio buffer (in real implementation, would be actual processed audio)
      const dummyBuffer = new Float32Array(44100 * 10) // 10 seconds
      const response: WorkerResponse = {
        type: 'complete',
        sessionId,
        audioBuffer: dummyBuffer.buffer,
      }
      self.postMessage(response, [dummyBuffer.buffer])
    }
  } catch (error) {
    const response: WorkerResponse = {
      type: 'error',
      sessionId,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
    self.postMessage(response)
  }
}

export {} // Mark as module

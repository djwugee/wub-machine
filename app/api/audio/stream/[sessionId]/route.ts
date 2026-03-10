import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/server/sessionManager'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params

    if (!sessionId) {
      return NextResponse.json(
        { message: 'Session ID required' },
        { status: 400 }
      )
    }

    const session = getSession(sessionId)
    if (!session) {
      return NextResponse.json(
        { message: 'Session not found' },
        { status: 404 }
      )
    }

    if (!session.completed) {
      return NextResponse.json(
        { message: 'Remix not yet complete' },
        { status: 202 }
      )
    }

    console.log(`[v0] Audio stream request for session: ${sessionId}`)

    // In production, would stream actual processed audio from storage
    // For now, generate a dummy WAV file
    const audioBuffer = generateDummyAudio(44100 * 10) // 10 seconds

    const headers = new Headers({
      'Content-Type': 'audio/wav',
      'Content-Length': audioBuffer.length.toString(),
      'Cache-Control': 'public, max-age=3600',
      'Content-Disposition': `attachment; filename="remix-${sessionId}.wav"`,
      'Accept-Ranges': 'bytes',
    })

    return new NextResponse(audioBuffer, {
      status: 200,
      headers,
    })
  } catch (error) {
    console.error('[v0] Audio stream error:', error)
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : 'Error streaming audio',
      },
      { status: 500 }
    )
  }
}

/**
 * Generate a simple WAV file (dummy audio for demo)
 */
function generateDummyAudio(samples: number): Buffer {
  const sampleRate = 44100
  const channels = 2
  const bitsPerSample = 16

  const audioData = new Float32Array(samples)

  // Generate simple sine wave
  for (let i = 0; i < samples; i++) {
    const frequency = 440 + (i / samples) * 220 // Sweep from 440Hz to 660Hz
    const time = i / sampleRate
    audioData[i] = Math.sin(2 * Math.PI * frequency * time) * 0.3
  }

  // Convert to 16-bit PCM
  const pcm = new Int16Array(samples)
  for (let i = 0; i < samples; i++) {
    pcm[i] = audioData[i] < 0 ? audioData[i] * 0x8000 : audioData[i] * 0x7fff
  }

  // Create WAV header
  const byteRate = (sampleRate * channels * bitsPerSample) / 8
  const blockAlign = (channels * bitsPerSample) / 8
  const subchunk2Size = samples * blockAlign
  const chunkSize = 36 + subchunk2Size

  const buffer = Buffer.alloc(44 + subchunk2Size)
  const view = new DataView(buffer.buffer)

  // RIFF header
  view.setUint32(0, 0x52494646, false) // "RIFF"
  view.setUint32(4, chunkSize, true)
  view.setUint32(8, 0x57415645, false) // "WAVE"

  // fmt subchunk
  view.setUint32(12, 0x666d7420, false) // "fmt "
  view.setUint32(16, 16, true) // Subchunk1Size
  view.setUint16(20, 1, true) // AudioFormat (1 = PCM)
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)

  // data subchunk
  view.setUint32(36, 0x64617461, false) // "data"
  view.setUint32(40, subchunk2Size, true)

  // Copy PCM data
  const pcmBuffer = new Int16Array(buffer.buffer, 44)
  pcmBuffer.set(pcm)

  return buffer
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

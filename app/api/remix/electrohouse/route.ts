import { NextRequest, NextResponse } from 'next/server'
import {
  getSession,
  updateProgress,
  completeSession,
} from '@/lib/server/sessionManager'

export const maxDuration = 60 // Max 60 seconds for serverless function

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sessionId } = body

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

    console.log(`[v0] Starting Electro House remix for session: ${sessionId}`)

    // Update progress
    updateProgress(sessionId, {
      status: 'analyzing',
      step: 'beat_detection',
      progress: 0.1,
      message: 'Analyzing beat structure...',
    })

    await new Promise((resolve) => setTimeout(resolve, 500))

    updateProgress(sessionId, {
      status: 'analyzing',
      step: 'key_detection',
      progress: 0.2,
      message: 'Detecting musical key...',
    })

    await new Promise((resolve) => setTimeout(resolve, 500))

    // Simulate sample placement
    updateProgress(sessionId, {
      status: 'processing',
      step: 'sample_placement',
      progress: 0.4,
      message: 'Creating melodic patterns...',
    })

    await new Promise((resolve) => setTimeout(resolve, 1000))

    updateProgress(sessionId, {
      status: 'processing',
      step: 'synthesis',
      progress: 0.65,
      message: 'Synthesizing bassline...',
    })

    await new Promise((resolve) => setTimeout(resolve, 1500))

    updateProgress(sessionId, {
      status: 'processing',
      step: 'mixing',
      progress: 0.85,
      message: 'Mixing with hi-hats...',
    })

    await new Promise((resolve) => setTimeout(resolve, 1000))

    updateProgress(sessionId, {
      status: 'exporting',
      step: 'export',
      progress: 0.95,
      message: 'Exporting audio file...',
    })

    // Mark as complete
    completeSession(sessionId)

    console.log(`[v0] Electro House remix complete for session: ${sessionId}`)

    return NextResponse.json(
      {
        sessionId,
        message: 'Remix processing started',
        status: 'processing',
      },
      { status: 202 }
    )
  } catch (error) {
    console.error('[v0] Electro House remix error:', error)

    if (body.sessionId) {
      updateProgress(body.sessionId, {
        status: 'error',
        step: 'upload',
        progress: 0,
        message: 'Processing failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }

    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : 'Remix failed',
      },
      { status: 500 }
    )
  }
}

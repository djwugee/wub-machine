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

    console.log(`[v0] Results request for session: ${sessionId}`)

    return NextResponse.json(
      {
        sessionId,
        remixer: session.remixer,
        duration: session.analysis?.duration || 0,
        metadata: {
          detectedBPM: session.analysis?.tempo,
          detectedKey: session.analysis?.key,
          processingTime: Math.round(
            (new Date().getTime() - session.createdAt.getTime()) / 1000
          ),
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[v0] Results endpoint error:', error)
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : 'Error retrieving results',
      },
      { status: 500 }
    )
  }
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

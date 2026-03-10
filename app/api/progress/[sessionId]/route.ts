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

    console.log(`[v0] Progress request for session: ${sessionId}`)

    // Return Server-Sent Events stream
    const encoder = new TextEncoder()
    let closed = false

    const stream = new ReadableStream({
      async start(controller) {
        // Send initial progress
        const initialData = JSON.stringify(session.progress)
        controller.enqueue(
          encoder.encode(`data: ${initialData}\n\n`)
        )

        // Poll for updates every 500ms
        const interval = setInterval(() => {
          if (closed) {
            clearInterval(interval)
            controller.close()
            return
          }

          const updatedSession = getSession(sessionId)
          if (updatedSession) {
            const data = JSON.stringify(updatedSession.progress)
            controller.enqueue(
              encoder.encode(`data: ${data}\n\n`)
            )

            // If processing is complete, close the stream
            if (updatedSession.progress.status === 'complete') {
              clearInterval(interval)
              setTimeout(() => {
                controller.close()
              }, 500)
            }
          }
        }, 500)

        // Set a timeout to close the stream after 30 minutes
        const timeout = setTimeout(() => {
          closed = true
          clearInterval(interval)
          controller.close()
        }, 30 * 60 * 1000)

        request.signal.addEventListener('abort', () => {
          closed = true
          clearInterval(interval)
          clearTimeout(timeout)
          controller.close()
        })
      },
    })

    return new NextResponse(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  } catch (error) {
    console.error('[v0] Progress endpoint error:', error)
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : 'Error retrieving progress',
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

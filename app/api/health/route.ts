import { NextResponse } from 'next/server'
import { getSessionStats } from '@/lib/server/sessionManager'

export async function GET() {
  try {
    const stats = getSessionStats()

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      sessions: stats,
      uptime: process.uptime(),
    })
  } catch (error) {
    console.error('[v0] Health check error:', error)
    return NextResponse.json(
      {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 503 }
    )
  }
}

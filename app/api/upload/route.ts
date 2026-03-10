import { NextRequest, NextResponse } from 'next/server'
import { createSession } from '@/lib/server/sessionManager'

const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100MB
const ALLOWED_FORMATS = [
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/flac',
  'audio/mp4',
]

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const remixer = formData.get('remixer') as
      | 'dubstep'
      | 'electrohouse'
      | null

    // Validation
    if (!file) {
      return NextResponse.json(
        { message: 'No file provided' },
        { status: 400 }
      )
    }

    if (!remixer || !['dubstep', 'electrohouse'].includes(remixer)) {
      return NextResponse.json(
        { message: 'Invalid remixer specified' },
        { status: 400 }
      )
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { message: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 413 }
      )
    }

    if (!ALLOWED_FORMATS.includes(file.type)) {
      return NextResponse.json(
        {
          message: `Unsupported file format: ${file.type}. Allowed: MP3, WAV, OGG, FLAC`,
        },
        { status: 415 }
      )
    }

    // Create session
    const session = createSession(remixer, file.name, file.size)

    console.log(`[v0] Upload request - Session: ${session.sessionId}, File: ${file.name}, Size: ${file.size}`)

    return NextResponse.json(
      {
        sessionId: session.sessionId,
        message: 'File uploaded successfully',
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[v0] Upload error:', error)
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : 'Upload failed',
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
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

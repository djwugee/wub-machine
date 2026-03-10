/**
 * Session Manager
 * Handles remix session state and progress tracking
 */

import { RemixProgress } from '../store'

export interface RemixSession {
  sessionId: string
  createdAt: Date
  uploadedFile: string
  fileSize: number
  remixer: 'dubstep' | 'electrohouse'
  analysis?: {
    beats: number[]
    tempo: number
    key: string
    duration: number
  }
  processedAudio?: Buffer
  progress: RemixProgress
  completed: boolean
}

// In-memory session store (replace with Redis in production)
const sessions = new Map<string, RemixSession>()

// Session cleanup interval (15 minutes)
const SESSION_TTL = 15 * 60 * 1000

setInterval(() => {
  const now = Date.now()
  sessions.forEach((session, sessionId) => {
    if (now - session.createdAt.getTime() > SESSION_TTL) {
      sessions.delete(sessionId)
      console.log(`[v0] Cleaned up expired session: ${sessionId}`)
    }
  })
}, 60000) // Check every minute

export function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

export function createSession(
  remixer: 'dubstep' | 'electrohouse',
  uploadedFile: string,
  fileSize: number
): RemixSession {
  const sessionId = generateSessionId()

  const session: RemixSession = {
    sessionId,
    createdAt: new Date(),
    uploadedFile,
    fileSize,
    remixer,
    progress: {
      status: 'idle',
      step: 'upload',
      progress: 0,
      message: 'Session created',
    },
    completed: false,
  }

  sessions.set(sessionId, session)
  console.log(`[v0] Created session: ${sessionId}`)

  return session
}

export function getSession(sessionId: string): RemixSession | undefined {
  return sessions.get(sessionId)
}

export function updateSession(
  sessionId: string,
  updates: Partial<RemixSession>
): void {
  const session = sessions.get(sessionId)
  if (session) {
    Object.assign(session, updates)
  }
}

export function updateProgress(
  sessionId: string,
  progress: Partial<RemixProgress>
): void {
  const session = sessions.get(sessionId)
  if (session) {
    session.progress = { ...session.progress, ...progress }
  }
}

export function completeSession(sessionId: string): void {
  const session = sessions.get(sessionId)
  if (session) {
    session.completed = true
    session.progress = {
      status: 'complete',
      step: 'export',
      progress: 1.0,
      message: 'Remix complete',
    }
  }
}

export function deleteSession(sessionId: string): void {
  sessions.delete(sessionId)
  console.log(`[v0] Deleted session: ${sessionId}`)
}

export function getAllSessions(): RemixSession[] {
  return Array.from(sessions.values())
}

export function getSessionStats(): {
  total: number
  active: number
  completed: number
} {
  const allSessions = getAllSessions()
  return {
    total: allSessions.length,
    active: allSessions.filter((s) => !s.completed).length,
    completed: allSessions.filter((s) => s.completed).length,
  }
}

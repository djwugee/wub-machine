/**
 * Validation utilities for form inputs and API requests
 */

import { z } from 'zod'

// File upload validation
export const FileUploadSchema = z.object({
  file: z
    .instanceof(File)
    .refine((file) => file.size <= 100 * 1024 * 1024, {
      message: 'File size must be less than 100MB',
    })
    .refine(
      (file) => {
        const allowedTypes = [
          'audio/mpeg',
          'audio/wav',
          'audio/ogg',
          'audio/flac',
          'audio/mp4',
          'audio/m4a',
        ]
        return allowedTypes.includes(file.type)
      },
      {
        message: 'File type must be MP3, WAV, OGG, FLAC, or M4A',
      }
    ),
  remixer: z.enum(['dubstep', 'electrohouse']),
})

// Remix request validation
export const RemixRequestSchema = z.object({
  sessionId: z.string().min(10).max(100),
  remixer: z.enum(['dubstep', 'electrohouse']),
})

// Session ID validation
export const SessionIdSchema = z.string().regex(/^session_/, {
  message: 'Invalid session ID format',
})

// Progress request validation
export const ProgressRequestSchema = z.object({
  sessionId: SessionIdSchema,
})

// Results request validation
export const ResultsRequestSchema = z.object({
  sessionId: SessionIdSchema,
})

/**
 * Validate audio file
 */
export function validateAudioFile(file: File): { valid: boolean; error?: string } {
  const allowedTypes = [
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    'audio/flac',
    'audio/mp4',
  ]

  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `Unsupported file type: ${file.type}. Allowed: MP3, WAV, OGG, FLAC, M4A`,
    }
  }

  const maxSize = 100 * 1024 * 1024 // 100MB
  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File too large. Maximum size is ${maxSize / 1024 / 1024}MB`,
    }
  }

  return { valid: true }
}

/**
 * Validate session ID format
 */
export function validateSessionId(sessionId: string): boolean {
  return /^session_\d+_[a-z0-9]+$/.test(sessionId)
}

/**
 * Validate BPM
 */
export function validateBPM(bpm: number): boolean {
  return bpm >= 60 && bpm <= 180
}

/**
 * Validate musical key
 */
export function validateKey(key: string): boolean {
  const validKeys = [
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
  return validKeys.includes(key)
}

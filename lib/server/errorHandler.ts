/**
 * Error Handler
 * Centralized error handling for API routes
 */

export class AppError extends Error {
  constructor(
    public code: string,
    public statusCode: number,
    message: string,
    public details?: any
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super('VALIDATION_ERROR', 400, message, details)
    this.name = 'ValidationError'
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Not found', details?: any) {
    super('NOT_FOUND', 404, message, details)
    this.name = 'NotFoundError'
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Conflict', details?: any) {
    super('CONFLICT', 409, message, details)
    this.name = 'ConflictError'
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests', details?: any) {
    super('RATE_LIMITED', 429, message, details)
    this.name = 'RateLimitError'
  }
}

export class InternalServerError extends AppError {
  constructor(message: string = 'Internal server error', details?: any) {
    super('INTERNAL_ERROR', 500, message, details)
    this.name = 'InternalServerError'
  }
}

export interface ErrorResponse {
  code: string
  message: string
  details?: any
  timestamp: string
  requestId?: string
}

export function formatErrorResponse(
  error: unknown,
  requestId?: string
): { body: ErrorResponse; statusCode: number } {
  console.error('[v0] Error:', error)

  let statusCode = 500
  let code = 'INTERNAL_ERROR'
  let message = 'An unexpected error occurred'
  let details: any = undefined

  if (error instanceof AppError) {
    statusCode = error.statusCode
    code = error.code
    message = error.message
    details = error.details
  } else if (error instanceof SyntaxError) {
    statusCode = 400
    code = 'PARSE_ERROR'
    message = 'Invalid request format'
  } else if (error instanceof TypeError) {
    statusCode = 400
    code = 'TYPE_ERROR'
    message = error.message
  } else if (error instanceof Error) {
    message = error.message
  }

  const response: ErrorResponse = {
    code,
    message,
    timestamp: new Date().toISOString(),
  }

  if (details) {
    response.details = details
  }

  if (requestId) {
    response.requestId = requestId
  }

  return { body: response, statusCode }
}

export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

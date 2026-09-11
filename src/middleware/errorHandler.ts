import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'

import { CompileError } from '../services/compile/index.ts'
import { UnknownMockError } from '../services/mocks/index.ts'

/**
 * Failures a payload can cause are the normal case here, so they answer with a
 * shape the caller can render — `{ error, messages }` — and never a 500. A 500
 * means this service broke, which is worth paging on.
 */
export const errorHandler = (
  error: unknown,
  _request: Request,
  response: Response,
  next: NextFunction
) => {
  if (response.headersSent) return next(error)

  if (error instanceof CompileError) {
    return response.status(422).json({
      error: 'compile_failed',
      messages: error.messages
    })
  }

  if (error instanceof ZodError) {
    return response.status(400).json({
      error: 'invalid_request',
      messages: error.issues.map((issue) => ({
        text: issue.message,
        path: issue.path.join('.')
      }))
    })
  }

  if (error instanceof UnknownMockError) {
    return response.status(404).json({ error: 'not_found', message: error.message })
  }

  console.error('[compiler] unhandled', error)

  return response.status(500).json({ error: 'internal_error' })
}

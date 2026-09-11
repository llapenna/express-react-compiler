export interface CompileMessage {
  text: string
  /** Absent when esbuild fails before it reaches a location (bad options). */
  line?: number
  column?: number
  /** The offending source line, when esbuild captured one. */
  snippet?: string
}

interface EsbuildLikeFailure {
  errors?: {
    text: string
    location: { line: number; column: number; lineText: string } | null
  }[]
}

/**
 * A failure in the payload, not in this service — every instance maps to 422.
 * The caller gets structured messages so it can point at the offending line
 * instead of re-parsing a formatted string.
 */
export class CompileError extends Error {
  readonly messages: CompileMessage[]

  constructor(messages: CompileMessage[]) {
    super(messages[0]?.text ?? 'Compilation failed')
    this.name = 'CompileError'
    this.messages = messages
  }

  static from(error: unknown): CompileError {
    const errors = (error as EsbuildLikeFailure)?.errors

    if (!Array.isArray(errors) || errors.length === 0) {
      return new CompileError([
        { text: error instanceof Error ? error.message : String(error) }
      ])
    }

    return new CompileError(
      errors.map(({ text, location }) => ({
        text,
        ...(location && {
          line: location.line,
          column: location.column,
          snippet: location.lineText
        })
      }))
    )
  }
}

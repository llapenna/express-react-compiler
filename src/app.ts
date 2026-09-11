import express from 'express'

import { MAX_SOURCE_BYTES, PUBLIC_DIR } from './config.ts'
import { errorHandler } from './middleware/errorHandler.ts'
import { compileRouter } from './routes/compile.routes.ts'

/**
 * Builds the app without listening, so tests can bind an ephemeral port.
 *
 * There is no CORS layer: the consumer is a server that fetches the document
 * and re-serves it. If a browser ever calls this directly, add an explicit
 * allowlist here rather than a wildcard — the response is executable markup.
 */
export const createApp = () => {
  const app = express()

  app.disable('x-powered-by')

  // Headroom over the source cap for the surrounding JSON.
  app.use(express.json({ limit: MAX_SOURCE_BYTES + 64 * 1024 }))

  app.get('/health', (_request, response) => {
    response.json({ status: 'ok', uptime: Math.round(process.uptime()) })
  })

  app.use(compileRouter)

  // The demo harness: a stand-in for the service that embeds the document.
  app.use(express.static(PUBLIC_DIR))

  app.use((_request, response) => {
    response.status(404).json({ error: 'not_found' })
  })

  app.use(errorHandler)

  return app
}

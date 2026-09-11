import { createApp } from './app.ts'
import { PORT } from './config.ts'

const server = createApp().listen(PORT, () => {
  console.log(`[compiler] listening on http://localhost:${PORT}`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)))
}

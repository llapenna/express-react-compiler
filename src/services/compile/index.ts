import { bundleSource } from './bundle.ts'
import { buildDocument } from './document.ts'
import type { CompileOptions, CompileResult } from './types.ts'

export { CompileError } from './errors.ts'
export type { CompileMessage } from './errors.ts'
export type {
  BundleResult,
  CompileOptions,
  CompileResult,
  RenderKind
} from './types.ts'

/** Turns one payload into the finished document. Throws `CompileError`. */
export const compile = async ({
  source,
  kind,
  title = 'Generated app',
  minify = true,
  sourcemap = false
}: CompileOptions): Promise<CompileResult> => {
  const startedAt = performance.now()

  const bundle = await bundleSource({ source, kind, minify, sourcemap })
  const html = buildDocument({ bundle, title })

  return {
    html,
    bytes: Buffer.byteLength(html, 'utf8'),
    durationMs: Math.round(performance.now() - startedAt),
    cdn: bundle.cdn
  }
}

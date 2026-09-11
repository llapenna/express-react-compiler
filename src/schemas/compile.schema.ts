import { z } from 'zod'

import { MAX_SOURCE_BYTES } from '../config.ts'

/**
 * The request body, shaped after the render envelope the consuming app already
 * speaks (`{ kind, source }`), so a payload can be forwarded here unchanged.
 */
export const compileBodySchema = z.object({
  kind: z.enum(['jsx', 'tsx']).default('jsx'),
  source: z
    .string()
    .min(1, 'source is empty')
    .refine(
      (value) => Buffer.byteLength(value, 'utf8') <= MAX_SOURCE_BYTES,
      `source exceeds ${MAX_SOURCE_BYTES} bytes`
    ),
  title: z.string().max(120).optional(),
  minify: z.boolean().optional(),
  sourcemap: z.boolean().optional()
})

/**
 * Query flags shared by every route that returns a document.
 *
 * `download` defaults to on: the consumer fetches the document as a file and
 * injects it, so `Content-Disposition: attachment` is the normal case and
 * `?download=0` is what you use to eyeball it in a browser tab.
 */
export const documentQuerySchema = z.object({
  download: z
    .enum(['0', '1', 'false', 'true'])
    .default('1')
    .transform((value) => value === '1' || value === 'true'),
  minify: z
    .enum(['0', '1', 'false', 'true'])
    .optional()
    .transform((value) => (value ? value === '1' || value === 'true' : true)),
  sourcemap: z
    .enum(['0', '1', 'false', 'true'])
    .optional()
    .transform((value) => (value ? value === '1' || value === 'true' : false))
})

export type CompileBody = z.infer<typeof compileBodySchema>
export type DocumentQuery = z.infer<typeof documentQuerySchema>

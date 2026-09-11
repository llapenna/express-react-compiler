import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { Router, type Response } from 'express'
import { z } from 'zod'

import { BUNDLED_LIBRARIES, CDN_LIBRARIES, ROOT } from '../config.ts'
import {
  compileBodySchema,
  documentQuerySchema
} from '../schemas/compile.schema.ts'
import { compile } from '../services/compile/index.ts'
import type { CompileResult } from '../services/compile/index.ts'
import { listMocks, loadMock } from '../services/mocks/index.ts'

const router = Router()

/** `@scope/pkg/subpath` and `pkg/subpath` both resolve to their package. */
const packageOf = (specifier: string): string =>
  specifier.split('/').slice(0, specifier.startsWith('@') ? 2 : 1).join('/')

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'app'

/**
 * The document is the response body, not a JSON field: the consumer streams it
 * straight to disk or into `srcdoc` without a decode step. Everything a caller
 * might want to log rides along in headers.
 */
const sendDocument = (
  response: Response,
  result: CompileResult,
  { filename, download }: { filename: string; download: boolean }
) => {
  response
    .status(200)
    .type('html')
    .set({
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}.html"`,
      'Cache-Control': 'no-store',
      'X-Compile-Ms': String(result.durationMs),
      'X-Document-Bytes': String(result.bytes),
      // What this document will fetch at runtime. Empty means self-contained.
      'X-Cdn-Libraries': result.cdn.join(', '),
      // The document is meant to be embedded; this is the frame that must not.
      'X-Content-Type-Options': 'nosniff'
    })
    .send(result.html)
}

/** POST /compile — compile a payload sent in the body. */
router.post('/compile', async (request, response) => {
  const body = compileBodySchema.parse(request.body)
  const query = documentQuerySchema.parse(request.query)

  const result = await compile({
    source: body.source,
    kind: body.kind,
    title: body.title ?? 'Generated app',
    minify: body.minify ?? query.minify,
    sourcemap: body.sourcemap ?? query.sourcemap
  })

  sendDocument(response, result, {
    filename: slugify(body.title ?? 'generated-app'),
    download: query.download
  })
})

/**
 * GET /libraries — what a payload is allowed to import.
 *
 * The generating model has to be told this, or it will confidently import
 * something that is not here and get a 422 back.
 */
router.get('/libraries', async (_request, response) => {
  const { dependencies } = JSON.parse(
    await readFile(join(ROOT, 'package.json'), 'utf8')
  ) as { dependencies: Record<string, string> }

  response.json({
    bundled: [...BUNDLED_LIBRARIES].map((specifier) => ({
      specifier,
      version: dependencies[packageOf(specifier)] ?? null,
      transport: 'bundled'
    })),
    cdn: Object.entries(CDN_LIBRARIES).map(([specifier, library]) => ({
      specifier,
      url: library.url,
      global: library.global,
      transport: 'cdn'
    }))
  })
})

/** GET /mocks — the fixtures this service can compile without a body. */
router.get('/mocks', async (_request, response) => {
  response.json({ mocks: await listMocks() })
})

/** GET /mocks/:name — the raw fixture source, for the demo harness. */
router.get('/mocks/:name', async (request, response) => {
  const mock = await loadMock(z.string().parse(request.params.name))

  response.json(mock)
})

/** GET /compile/:name — compile a fixture. The quickest end-to-end check. */
router.get('/compile/:name', async (request, response) => {
  const query = documentQuerySchema.parse(request.query)
  const mock = await loadMock(z.string().parse(request.params.name))

  const result = await compile({
    source: mock.source,
    kind: mock.kind,
    title: mock.name,
    minify: query.minify,
    sourcemap: query.sourcemap
  })

  sendDocument(response, result, {
    filename: mock.name,
    download: query.download
  })
})

export { router as compileRouter }

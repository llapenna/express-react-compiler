import { resolve } from 'node:path'

import { build, type Plugin } from 'esbuild'

import {
  CDN_LIBRARIES,
  ROOT,
  allSpecifiers,
  isBundled,
  isCdn
} from '../../config.ts'
import { CompileError } from './errors.ts'
import type { BundleResult, RenderKind } from './types.ts'

const ENTRY = resolve(ROOT, 'src/services/compile/runtime/entry.js')

/** The specifier `entry.js` imports the payload under. */
const SOURCE_MODULE = 'render:source'

const PAYLOAD_NS = 'render-source'
const CDN_NS = 'render-cdn'

/**
 * Stands in for a library that is not bundled.
 *
 * esbuild sees a normal module, so the payload keeps writing
 * `import Plotly from 'plotly.js'`; at runtime the import reads the global the
 * CDN script defined. The document loads that script before the bundle, so by
 * the time this evaluates the global is there — the throw is for the case
 * where the network, the CDN or the integrity check failed, which would
 * otherwise surface as `undefined is not a function` somewhere in the app.
 */
const globalShim = (specifier: string, global: string): string => `
const value = globalThis[${JSON.stringify(global)}]

if (!value) {
  throw new Error(
    ${JSON.stringify(`"${specifier}" did not load — the ${global} global is missing.`)}
  )
}

export default value
`

/**
 * Feeds the request body to esbuild as a real module and decides, per import,
 * whether the library is compiled in or left to a runtime script.
 *
 * The payload never touches disk: it has no path a relative import could
 * anchor to, so the resolver below is the complete list of what a generated
 * app can pull in.
 */
const sourcePlugin = (
  source: string,
  kind: RenderKind,
  usedCdn: Set<string>
): Plugin => ({
  name: PAYLOAD_NS,
  setup(build) {
    build.onResolve({ filter: /^render:source$/ }, () => ({
      path: SOURCE_MODULE,
      namespace: PAYLOAD_NS
    }))

    build.onResolve({ filter: /.*/, namespace: PAYLOAD_NS }, ({ path }) => {
      // Resolved against this repo's dependencies by esbuild's own resolver.
      if (isBundled(path)) return null

      if (isCdn(path)) {
        usedCdn.add(path)

        return { path, namespace: CDN_NS }
      }

      return {
        errors: [
          {
            text:
              `Import "${path}" is not available. A payload may only import: ` +
              allSpecifiers().join(', ')
          }
        ]
      }
    })

    build.onLoad({ filter: /.*/, namespace: CDN_NS }, ({ path }) => ({
      contents: globalShim(path, CDN_LIBRARIES[path]!.global),
      loader: 'js'
    }))

    build.onLoad({ filter: /.*/, namespace: PAYLOAD_NS }, () => ({
      contents: source,
      loader: kind,
      resolveDir: ROOT
    }))
  }
})

/**
 * Compiles a payload into one IIFE, plus whatever CSS its libraries imported.
 *
 * `sourcemap: 'inline'` is deliberate even though it doubles the document:
 * once the frame is opaque-origin there is no other way to read a stack that
 * points at the author's JSX rather than at bundled output.
 */
export const bundleSource = async ({
  source,
  kind,
  minify = true,
  sourcemap = false
}: {
  source: string
  kind: RenderKind
  minify?: boolean
  sourcemap?: boolean
}): Promise<BundleResult> => {
  const usedCdn = new Set<string>()

  try {
    const result = await build({
      entryPoints: [ENTRY],
      absWorkingDir: ROOT,
      bundle: true,
      write: false,
      // Never written — but without an outdir esbuild names every output
      // "<stdout>", and a stylesheet could not be told from the script.
      outdir: 'virtual',
      format: 'iife',
      platform: 'browser',
      target: ['es2022'],
      jsx: 'automatic',
      minify,
      sourcemap: sourcemap ? 'inline' : false,
      legalComments: 'none',
      logLevel: 'silent',
      // React reads this at module scope; without it the bundle pulls the
      // development build and warns about a missing `process`.
      define: { 'process.env.NODE_ENV': '"production"' },
      plugins: [sourcePlugin(source, kind, usedCdn)]
    })

    // A library that imports a stylesheet produces a second output file.
    // Dropping it would render the app unstyled with nothing to explain why.
    const code = result.outputFiles.find((file) => file.path.endsWith('.js'))
    const css = result.outputFiles.find((file) => file.path.endsWith('.css'))

    if (!code) throw new Error('esbuild produced no script output')

    return {
      code: code.text,
      css: css?.text ?? '',
      cdn: [...usedCdn]
    }
  } catch (error) {
    throw CompileError.from(error)
  }
}

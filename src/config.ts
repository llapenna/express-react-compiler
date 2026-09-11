import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Repo root — esbuild resolves `react` against this `node_modules`. */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const MOCKS_DIR = resolve(ROOT, 'mocks')
export const PUBLIC_DIR = resolve(ROOT, 'public')

export const PORT = Number(process.env.PORT ?? 4000)

/**
 * Source is model output arriving over HTTP. The cap is generous for a single
 * screen and small enough that a runaway payload cannot occupy the bundler.
 */
export const MAX_SOURCE_BYTES = 512 * 1024

/**
 * The bare specifiers a payload may import, and how each one reaches the
 * document. Anything not named here is a 422 — the payload has no path on
 * disk, so this is the complete definition of what a generated app can pull
 * in.
 *
 * Two tiers, because the trade-off differs per library:
 *
 * `bundled` — compiled into the document by esbuild. Self-contained, no
 * network, unchanged CSP, but every byte ships on every render. Right for
 * libraries that tree-shake to tens of KB, and mandatory for anything that
 * calls React hooks: a second React instance means "invalid hook call", so
 * React and its dependants must stay in one module graph.
 *
 * `cdn` — left out of the bundle and loaded at runtime from a pinned URL. The
 * document drops to a few KB and the browser caches one copy across every
 * generated app, at the cost of network reach. Only for libraries that do not
 * touch React.
 */
export const BUNDLED_LIBRARIES = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@radix-ui/react-tabs',
  '@radix-ui/react-popover',
  '@dnd-kit/core',
  '@dnd-kit/sortable',
  '@dnd-kit/utilities',
  'lucide-react'
])

export interface CdnLibrary {
  /** Exact URL, version in the path — a document compiled today must still
   *  render in a year, so this file can never be replaced in place. */
  url: string
  /** The global the script defines; the import is rewritten to read it. */
  global: string
  /** Subresource integrity. The CDN cannot swap the file under us. */
  integrity: string
}

/**
 * `url` is pinned down to the path, and `script-src` in the generated document
 * names that exact URL rather than the origin. An origin-wide grant would let
 * generated code encode data into a request path and read it back out of
 * someone's access log — the same exfiltration channel `img-src` is narrowed
 * to close.
 */
export const CDN_LIBRARIES: Record<string, CdnLibrary> = {
  'plotly.js': {
    url: 'https://cdnjs.cloudflare.com/ajax/libs/plotly.js/4.1.0/plotly-cartesian.min.js',
    global: 'Plotly',
    integrity:
      'sha512-trjO1P/5QuQfjDkUv70wlBG5ExEF0HUytbDIpsIZDd7URdz+sTKlyvZKdyssrFX0fByTmtSmM/WnMA15mZOKJw=='
  }
}

export const isBundled = (specifier: string): boolean =>
  BUNDLED_LIBRARIES.has(specifier)

export const isCdn = (specifier: string): boolean => specifier in CDN_LIBRARIES

/** Every specifier a payload may name, for the error message and `/libraries`. */
export const allSpecifiers = (): string[] => [
  ...BUNDLED_LIBRARIES,
  ...Object.keys(CDN_LIBRARIES)
]

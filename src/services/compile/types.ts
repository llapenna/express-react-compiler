/** JSX, or the same contract with TypeScript syntax stripped. */
export type RenderKind = 'jsx' | 'tsx'

export interface BundleResult {
  code: string
  /** Stylesheets a bundled library imported, concatenated by esbuild. */
  css: string
  /** Specifiers this payload imported that load from a CDN at runtime. */
  cdn: string[]
}

export interface CompileOptions {
  source: string
  kind: RenderKind
  /** Document title, and the basis for the download filename. */
  title?: string
  minify?: boolean
  /** Inline source map — large, but the only way to read a real stack. */
  sourcemap?: boolean
}

export interface CompileResult {
  /** A complete document. Self-contained unless the payload used a CDN library. */
  html: string
  bytes: number
  durationMs: number
  /** What the document will fetch at runtime — empty for a bundled-only payload. */
  cdn: string[]
}

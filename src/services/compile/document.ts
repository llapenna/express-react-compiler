import { CDN_LIBRARIES } from '../../config.ts'
import {
  BOOTSTRAP,
  ERROR_HANDLERS,
  FRAME_STYLES,
  HOST_BRIDGE,
  contentSecurityPolicy
} from './shell.ts'
import type { BundleResult } from './types.ts'

const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[character] as string
  )

/**
 * Classic scripts run in document order, so a library tag placed above the
 * bootstrap has defined its global by the time the bundle evaluates — no
 * readiness handshake needed.
 *
 * `integrity` pins the bytes and `crossorigin` is what makes the check
 * possible: an opaque-origin frame requests with `Origin: null`, so the
 * response must be CORS-enabled for the browser to read it well enough to
 * hash. `referrerpolicy` keeps the embedding page's URL out of the request.
 */
const cdnScripts = (specifiers: readonly string[]): string =>
  specifiers
    .map((specifier) => {
      const { url, integrity } = CDN_LIBRARIES[specifier]!

      return `<script src="${url}" integrity="${integrity}" crossorigin="anonymous" referrerpolicy="no-referrer"></script>`
    })
    .join('\n')

/**
 * Wraps a compiled bundle in the document the frame will load.
 *
 * With no CDN library the result is standalone — no external script, style,
 * font or import map — so the embedder can serve it from anywhere and get the
 * same render. A CDN library trades that for a document small enough to cache
 * the heavy part once across every generated app.
 */
export const buildDocument = ({
  bundle,
  title
}: {
  bundle: BundleResult
  title: string
}): string => {
  const urls = bundle.cdn.map((specifier) => CDN_LIBRARIES[specifier]!.url)

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy(urls)}" />
<title>${escapeHtml(title)}</title>
<style>${FRAME_STYLES}</style>
${bundle.css ? `<style>${bundle.css}</style>` : ''}
</head>
<body>
<pre id="error"></pre>
<div id="root"></div>
<script>${ERROR_HANDLERS}</script>
<script>${HOST_BRIDGE}</script>
${cdnScripts(bundle.cdn)}
<script type="application/json" id="bundle">
${Buffer.from(bundle.code, 'utf8').toString('base64')}
</script>
<script>${BOOTSTRAP}</script>
</body>
</html>
`
}

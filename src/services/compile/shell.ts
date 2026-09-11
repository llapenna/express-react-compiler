/**
 * Everything the generated document contains besides the app bundle.
 *
 * The document is meant to be dropped into `<iframe sandbox="allow-scripts">`
 * with no `allow-same-origin`, so it runs at an opaque origin: no cookies, no
 * storage, no reach into the host DOM. The policy below is the second layer —
 * it holds even if the embedder forgets the sandbox attribute.
 */

/**
 * A bundled-only document needs no network at all, so it runs under
 * `default-src 'none'` and renders identically offline.
 *
 * A payload that imported a CDN library widens exactly one directive, by the
 * full URL rather than the origin: `script-src` names the single file it is
 * allowed to load. Granting the origin would let generated code encode data
 * into a request path and read it back from an access log — a live
 * exfiltration channel, and the same one `img-src` is narrowed to close.
 * `connect-src` stays `'none'` either way, so a library that fetches at
 * runtime fails loudly instead of reaching the network.
 *
 * `blob:` in `script-src` is what the bootstrap needs; see `BOOTSTRAP`.
 */
export const contentSecurityPolicy = (scriptUrls: readonly string[]): string =>
  [
    "default-src 'none'",
    ["script-src 'unsafe-inline' blob:", ...scriptUrls].join(' '),
    "style-src 'unsafe-inline'",
    'img-src data: blob:',
    'font-src data:',
    "connect-src 'none'",
    "base-uri 'none'",
    "form-action 'none'"
  ].join('; ')

export const FRAME_STYLES = `
  html, body { margin: 0; min-height: 100%; }
  body {
    font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif;
    color: #16181d;
    background: #fff;
  }
  #error {
    display: none; white-space: pre-wrap; margin: 0; padding: 16px;
    font: 12px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace;
    color: #b42318; background: #fef3f2; border-bottom: 1px solid #fecdc9;
  }
`

/**
 * Installed before anything else so a failure in the bundle is visible rather
 * than a blank frame. Also relayed to the host: at an opaque origin the parent
 * cannot read the frame's console, so a posted message is the only way a
 * failure leaves the sandbox.
 */
export const ERROR_HANDLERS = `
  (() => {
    const errorEl = document.getElementById('error')
    const root = document.getElementById('root')

    window.__renderFail = (stage, error) => {
      const detail = error?.stack || error?.message || String(error)

      root.replaceChildren()
      errorEl.style.display = 'block'
      errorEl.textContent = stage + ': ' + detail
      parent.postMessage({ type: 'render:error', stage, detail }, '*')
    }

    addEventListener('error', (event) =>
      window.__renderFail('Runtime error', event.error ?? event.message)
    )
    addEventListener('unhandledrejection', (event) =>
      window.__renderFail('Unhandled rejection', event.reason)
    )
  })()
`

/**
 * The frame's only way to reach the host: named actions over postMessage, with
 * a correlation id per call. Injected here, never written by the model — so a
 * payload can invoke an action the host published but cannot widen the surface.
 *
 * Nothing here carries a credential. The host runs the real request in its own
 * realm and posts back whatever the action chose to expose.
 */
export const HOST_BRIDGE = `
  (() => {
    const pending = new Map()
    let nextId = 0

    window.host = {
      call(method, params) {
        const id = ++nextId
        return new Promise((resolve, reject) => {
          pending.set(id, { resolve, reject })
          parent.postMessage({ jsonrpc: '2.0', id, method, params }, '*')
          setTimeout(() => {
            if (pending.delete(id)) reject(new Error(method + ' timed out'))
          }, 15000)
        })
      }
    }

    addEventListener('message', (event) => {
      if (event.source !== parent) return

      const { id, result, error } = event.data ?? {}
      const entry = pending.get(id)
      if (!entry) return

      pending.delete(id)
      if (error) entry.reject(new Error(error.message))
      else entry.resolve(result)
    })
  })()
`

/**
 * Runs the bundle from base64 rather than inlining it as script text.
 *
 * The bundle contains model-authored string literals and may legally contain
 * `</script>`. HTML tokenizing runs before JS parsing, so that sequence ends
 * the script element regardless of the JS string context around it — escaping
 * it would mean rewriting bundler output by regex and hoping. The base64
 * alphabet cannot participate in HTML parsing at all.
 *
 * A blob URL rather than `eval`, so the document never needs `unsafe-eval`
 * and stack traces keep a stable script origin.
 */
export const BOOTSTRAP = `
  try {
    const bytes = Uint8Array.from(
      atob(document.getElementById('bundle').textContent.trim()),
      (character) => character.charCodeAt(0)
    )

    const url = URL.createObjectURL(
      new Blob([bytes], { type: 'text/javascript' })
    )

    const script = document.createElement('script')
    script.src = url
    script.onload = () => URL.revokeObjectURL(url)
    script.onerror = () => window.__renderFail('Load failed', 'bundle')
    document.body.append(script)
  } catch (error) {
    window.__renderFail('Bootstrap failed', error)
  }
`

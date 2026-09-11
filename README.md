# express-react-compiler

Takes a JSX or TSX module and returns **one HTML document** — React bundled
in, self-contained by default — meant to be downloaded by another service and
injected into a sandboxed iframe. A payload may also pull in third-party
libraries, bundled or from a pinned CDN URL; see below.

```bash
pnpm install
pnpm dev            # http://localhost:4000
```

```bash
docker build -t react-compiler .
docker run --rm -p 4000:4000 --read-only react-compiler
```

Open `http://localhost:4000/` for the render harness: it stands in for the
embedding service — picks a fixture, compiles it, injects the result into
`<iframe sandbox="allow-scripts">` and answers the payload's bridge calls.

## API

| Route                  | Does                                                       |
| ---------------------- | ---------------------------------------------------------- |
| `POST /compile`        | Compiles `{ kind, source, title?, minify?, sourcemap? }`    |
| `GET /compile/:name`   | Compiles a fixture from `mocks/`                            |
| `GET /mocks`           | Lists fixtures                                              |
| `GET /mocks/:name`     | Raw fixture source                                          |
| `GET /libraries`       | What a payload is allowed to import                         |
| `GET /health`          | Liveness                                                    |

The body mirrors the render envelope the consuming app already speaks
(`{ kind: 'jsx' | 'tsx', source }`), so a payload can be forwarded unchanged.

```bash
curl -X POST localhost:4000/compile \
  -H 'content-type: application/json' \
  -d '{"kind":"jsx","source":"export default () => <h1>hi</h1>","title":"Hi"}' \
  -o app.html
```

The document is the response body, not a JSON field, so the caller streams it
straight to disk or into `srcdoc`. `Content-Disposition` is `attachment` by
default; `?download=0` serves it inline for eyeballing in a browser tab.
`?minify=0` and `?sourcemap=1` are debugging switches — a source map roughly
doubles the document but is the only way to read a stack that points at the
author's JSX.

Headers carry what you'd want to log: `X-Compile-Ms`, `X-Document-Bytes`, and
`X-Cdn-Libraries` — empty when the document fetches nothing at runtime.

**Failures.** A payload that does not compile is a 422, never a 500, with
messages the caller can render against the source:

```json
{
  "error": "compile_failed",
  "messages": [{ "text": "Unexpected \"}\"", "line": 4, "column": 42, "snippet": "…" }]
}
```

A 500 means this service broke.

## The contract the payload must meet

- Default-export a React component. No props are passed.
- Import only what `GET /libraries` lists. Anything else is a 422 — the source
  has no path on disk, so relative imports cannot reach the filesystem either.
- TypeScript syntax is stripped, not checked. `kind: 'tsx'` never type-errors.

## Third-party libraries

Two transports, chosen per library in `src/config.ts`. `GET /libraries`
returns both lists — feed it to whatever generates the payloads, or the model
will import something that is not there and get a 422 back.

**Bundled** (`BUNDLED_LIBRARIES`) — compiled into the document. Self-contained,
no network, CSP untouched, but every byte ships on every render. Mandatory for
anything that calls React hooks: a second React instance means "invalid hook
call", so React and its dependants have to stay in one module graph.
Currently React, `@radix-ui/react-tabs`, `@radix-ui/react-popover`,
`@dnd-kit/*` and `lucide-react` — see `mocks/task-board.jsx`.

**CDN** (`CDN_LIBRARIES`) — left out of the bundle and loaded at runtime. The
import is rewritten to read the global the script defines, so the payload still
writes `import Plotly from 'plotly.js'`. Only for libraries that do not touch
React. Currently `plotly.js` — see `mocks/plotly-explorer.jsx`.

|  | bundled | cdn |
| --- | --- | --- |
| document | 295 KB → 451 KB with Radix + dnd-kit + icons | 297 KB, library cached separately |
| network | none | one pinned URL |
| cached across apps | no | yes |
| may call hooks | yes | no |

Adding one is a `pnpm add` plus a line in the relevant list. For a CDN entry,
pin the version in the URL, keep the SRI hash, and never replace a file in
place — a document compiled today has to still render in a year.

**What breaks inside the sandbox,** regardless of transport: `localStorage`
throws at an opaque origin, Web Workers and `eval` are blocked by the CSP,
`fetch` is blocked by `connect-src 'none'`, remote fonts and images are
blocked, downloads (a save-as-PNG button) do nothing without `allow-downloads`,
and a portalled overlay is clipped by the iframe's box rather than floating
over the host page.

## How the embedder uses the document

```tsx
<iframe sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={html} />
```

No `allow-same-origin`: with it the frame shares the host's origin and can
reach the session. Scripts run, nothing else does.

The frame talks to the host over `postMessage`:

| Message                                  | Direction   | Meaning                          |
| ---------------------------------------- | ----------- | -------------------------------- |
| `{ type: 'render:ready' }`               | frame → host | Mounted                          |
| `{ type: 'render:height', height }`      | frame → host | Content height, on every reflow  |
| `{ type: 'render:error', stage, detail }`| frame → host | Failure — the frame has no console the host can read |
| `{ jsonrpc, id, method, params }`        | frame → host | `host.call(method, params)`      |
| `{ jsonrpc, id, result \| error }`       | host → frame | The answer                       |

`window.host.call(name, params)` is injected by this service, not written by
the payload, so a generated app can invoke an action the host published but
cannot widen the surface. Nothing in the frame carries a credential: the host
runs the real request in its own realm and posts back what the action chose to
expose. `mocks/bridge-demo.jsx` exercises it; the harness answers one action.

## Why the document looks the way it does

- **React is always bundled.** A bundled-only document needs no network, so it
  runs under `default-src 'none'` and renders identically offline. A CDN
  library widens `script-src` by the exact file URL — never the origin, which
  would let generated code exfiltrate through request paths — and carries an
  SRI hash, so a CDN release cannot change what an existing document executes.
- **The bundle is base64 in a `<script type="application/json">`,** run from a
  blob URL. Model output may legally contain `</script>`; HTML tokenizing runs
  before JS parsing, so that sequence would end the script element whatever the
  surrounding JS string context. The base64 alphabet cannot participate in HTML
  parsing. A blob rather than `eval` keeps `unsafe-eval` out of the policy.
- **`img-src` is `data:`/`blob:` only.** Allowing `https:` would let generated
  code encode data into an image URL pointed anywhere, which `connect-src` does
  not cover.
- **Forms are shimmed.** Without `allow-forms`, the browser blocks the form
  submission algorithm *before* firing `submit`, so `<form onSubmit>` never
  runs and a generated search box silently does nothing. The runtime cancels
  the click and dispatches the event itself. Nothing is lost: the document is
  served under `form-action 'none'` and has no origin to post to.
- **Errors surface twice** — an in-frame panel and a `render:error` message.
  An opaque-origin frame's console is unreadable from the host.

## Layout

```
src/
├── main.ts                     # listen
├── app.ts                      # express wiring
├── config.ts                   # paths, limits, library registry
├── routes/compile.routes.ts
├── schemas/compile.schema.ts   # zod request contract
├── middleware/errorHandler.ts  # payload failures → 4xx, never 500
└── services/
    ├── compile/
    │   ├── bundle.ts           # esbuild: payload + React → one IIFE
    │   ├── document.ts         # bundle → finished HTML
    │   ├── shell.ts            # CSP, styles, error panel, host bridge
    │   └── runtime/entry.js    # mount, error boundary, form shim, height
    └── mocks/                  # fixture loading
mocks/                          # counter · todo-list · pricing-form · bridge-demo
                                # task-board (bundled libs) · plotly-explorer (cdn)
public/index.html               # render harness (stands in for the embedder)
```

Node 24 runs the TypeScript sources directly by stripping types — no build
step, and nothing in `src/` may emit runtime code from a type (`tsc --noEmit`
enforces it via `erasableSyntaxOnly`).

```bash
pnpm test           # node:test — 16 cases, no browser needed
pnpm check-types
```

The image is `node:24-slim` with production dependencies only, running as the
`node` user. Nothing is written at runtime — esbuild returns the bundle in
memory — so it runs under `--read-only`. `PORT` is the only variable it reads,
and `HEALTHCHECK` polls `/health`.

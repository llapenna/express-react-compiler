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
| `GET /resources`       | What data a payload can reach through the host              |
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

Run `pnpm measure` for the current numbers: it compiles every fixture plus
synthetic payloads and prints raw, gzipped and per-app bytes against the fixed
floor. The floor is what matters — React plus the runtime shell is **296 KB raw
/ 105 KB gzipped before the app contributes anything**, and an app's own code
is nearly free next to a bundled library.

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

## Reading the host's data

A generated app has no network: `connect-src` is `'none'` and the frame is at
an opaque origin. The only data that reaches it comes from the embedder, and
the embedder answers out of **the TanStack Query cache its own screens use** —
so a generated app sees whatever the surrounding app already has, on the same
invalidation schedule, without a second fetch.

```jsx
import { useHostQuery, useHostMutation } from 'host'

export default function Aging() {
  const { data, isLoading, error } = useHostQuery('workbook.outputList', {
    workbookId: 'wb_ar'
  })
  const followUp = useHostMutation('workbook.sendMessage')
  …
}
```

`host` is not a package — it resolves to a file in this repo, so the hooks
share the bundle's single React instance. It exports `useHostQuery`,
`useHostMutation`, `useHostConnected`, and `host` for the raw bridge. All three
hooks together add ~2 KB to a document; the catalog and transport add 4 KB to
every document whether it uses them or not.

**The frame names a resource; the host decides what that means.** `GET
/resources` is the whole list — `workbook.outputList`, `credential.list`,
`reports.run` and so on, each with its params and whether it is a read or a
write. Three properties follow from doing it this way:

- **No URL, no token, no origin.** The frame cannot construct a request. A
  resource that is not in the catalog fails in the frame before it is even
  posted.
- **`companyId` is never a parameter.** Every path in the host app is
  tenant-scoped and the host fills that in from its own session, so a frame has
  no way to name another tenant.
- **Writes are separated from reads, and fire immediately.** `useHostMutation`
  goes through its own path, so a payload cannot reach a write by asking for a
  read — but once there it runs. What a generated app may write is decided once,
  by which mutations the host puts in its resolver table, not per click.

A `data:changed` push names the exact call — resource *and* params — so three
components reading `workflow.runList` for three different workflows re-read
only their own row. Naming the resource alone makes each of them refetch on
every change, and each refetch pushes again.

Reads are live. When the host's cache changes — a refetch elsewhere in the app,
a websocket push, someone editing a row on another screen — the host posts the
affected resource names and the frame re-reads them. No polling, which it could
not do anyway.

### Wiring it up on the host

`public/host-bridge.js` is the host half, written against TanStack Query's real
API (`fetchQuery`, `invalidateQueries`, `getQueryCache().subscribe`):

```js
createHostBridge({
  frame,                  // the <iframe> element
  queryClient,            // the app's own QueryClient, or there is no sharing
  catalog,                // from GET /resources
  resolvers,              // resource -> { queryKey, queryFn } | { run, invalidates }
  actions                 // extra named actions for host.call()
})
```

`resolvers` is the only file the app has to write, and it is where the existing
`queryKeys.ts` factories and `API_ROUTES` meet: `queryKey` must be the key the
app's own screens use, or the frame gets a private second cache instead of a
shared one. The harness (`public/demo-host.js`) does this against fixtures, and
its **Simulate sync** button pushes a cache change to prove the frame repaints
without asking for anything.

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
| `{ type: 'render:hello' }`               | frame → host | Probe; the host answers `host:hello` |
| `{ type: 'data:changed', resources }`    | host → frame | Those resources changed in the cache |

`window.host` is injected by this service, not written by the payload, so a
generated app can invoke an action the host published but cannot widen the
surface. Nothing in the frame carries a credential: the host runs the real
request in its own realm and posts back what the action chose to expose.
`mocks/bridge-demo.jsx` exercises `host.call`; `mocks/collections-cockpit.jsx`
exercises the data resources. A document with no host answers its own probe in
1.5s and can render an empty state instead of hanging.

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
pnpm test           # node:test — 21 cases, no browser needed
pnpm measure        # size and compile time per fixture
pnpm check-types
```

The image is `node:24-slim` with production dependencies only, running as the
`node` user. Nothing is written at runtime — esbuild returns the bundle in
memory — so it runs under `--read-only`. `PORT` is the only variable it reads,
and `HEALTHCHECK` polls `/health`.

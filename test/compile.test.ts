import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import { after, before, describe, it } from 'node:test'

import { createApp } from '../src/app.ts'

let origin = ''
let server: ReturnType<ReturnType<typeof createApp>['listen']>

const post = (body: unknown, query = '') =>
  fetch(`${origin}/compile${query}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })

before(async () => {
  server = createApp().listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  origin = `http://localhost:${(server.address() as AddressInfo).port}`
})

after(() => server.close())

describe('POST /compile', () => {
  it('returns a self-contained document for a JSX payload', async () => {
    const response = await post({
      kind: 'jsx',
      source: `import { useState } from 'react'
        export default function App() {
          const [n, setN] = useState(0)
          return <button onClick={() => setN(n + 1)}>{n}</button>
        }`,
      title: 'Click me'
    })

    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-type') ?? '', /text\/html/)
    assert.match(
      response.headers.get('content-disposition') ?? '',
      /attachment; filename="click-me.html"/
    )

    const html = await response.text()

    assert.match(html, /<title>Click me<\/title>/)
    assert.match(html, /Content-Security-Policy/)
    assert.match(html, /id="bundle"/)
    // React is bundled in, so the document names no external resource.
    assert.doesNotMatch(html, /https?:\/\//)
    assert.ok(html.length > 100_000, 'React should be inlined')
  })

  it('strips TypeScript syntax for a TSX payload', async () => {
    const response = await post({
      kind: 'tsx',
      source: `interface Props { label: string }
        const Badge = ({ label }: Props) => <span>{label}</span>
        export default function App() { return <Badge label="ok" /> }`
    })

    assert.equal(response.status, 200)
  })

  it('answers 422 with a location when the payload does not parse', async () => {
    const response = await post({
      kind: 'jsx',
      source: 'export default function App() { return <div> }'
    })

    assert.equal(response.status, 422)

    const body = (await response.json()) as {
      error: string
      messages: { text: string; line?: number }[]
    }

    assert.equal(body.error, 'compile_failed')
    assert.ok(body.messages[0]?.text)
    assert.equal(typeof body.messages[0]?.line, 'number')
  })

  it('refuses imports outside the allowlist', async () => {
    const response = await post({
      kind: 'jsx',
      source: `import express from 'express'
        export default function App() { return <div /> }`
    })

    assert.equal(response.status, 422)
    assert.match(JSON.stringify(await response.json()), /not available/)
  })

  it('refuses to read the filesystem through a relative import', async () => {
    const response = await post({
      kind: 'jsx',
      source: `import config from './src/config.ts'
        export default function App() { return <div /> }`
    })

    assert.equal(response.status, 422)
  })

  it('rejects an empty payload with 400', async () => {
    const response = await post({ kind: 'jsx', source: '' })

    assert.equal(response.status, 400)
    assert.match(JSON.stringify(await response.json()), /invalid_request/)
  })

  it('serves the document inline when download is off', async () => {
    const response = await post(
      { kind: 'jsx', source: 'export default () => <p>hi</p>' },
      '?download=0'
    )

    assert.match(response.headers.get('content-disposition') ?? '', /^inline/)
  })

  it('survives a payload containing a closing script tag', async () => {
    const response = await post({
      kind: 'jsx',
      source: `export default () => <p>{'</script><script>alert(1)</script>'}</p>`
    })

    const html = await response.text()

    assert.equal(response.status, 200)
    // Only the shell's own scripts, none smuggled out of the payload.
    assert.equal(html.match(/<script/g)?.length, 4)
    assert.doesNotMatch(html, /alert\(1\)/)
  })
})

describe('libraries', () => {
  it('bundles an allowlisted library into the document', async () => {
    const response = await post({
      kind: 'jsx',
      source: `import { GripVertical } from 'lucide-react'
        export default () => <GripVertical size={16} />`
    })

    assert.equal(response.status, 200)
    assert.equal(response.headers.get('x-cdn-libraries'), '')

    // Bundled means bundled: nothing is fetched at runtime.
    assert.doesNotMatch(await response.text(), /https?:\/\//)
  })

  it('leaves a CDN library out of the bundle and pins it in the CSP', async () => {
    const response = await post({
      kind: 'jsx',
      source: `import Plotly from 'plotly.js'
        export default () => <div>{typeof Plotly}</div>`
    })

    assert.equal(response.status, 200)
    assert.equal(response.headers.get('x-cdn-libraries'), 'plotly.js')

    const html = await response.text()
    const url =
      'https://cdnjs.cloudflare.com/ajax/libs/plotly.js/4.1.0/plotly-cartesian.min.js'

    assert.match(html, new RegExp(`<script src="${url}" integrity="sha512-`))
    // Pinned to the file, not the origin — an origin grant would be an
    // exfiltration channel via request paths.
    assert.match(html, new RegExp(`script-src 'unsafe-inline' blob: ${url};`))
    assert.match(html, /connect-src 'none'/)
  })

  it('keeps the CDN grant out of a document that did not ask for it', async () => {
    const response = await post({
      kind: 'jsx',
      source: 'export default () => <p>plain</p>'
    })

    assert.match(
      await response.text(),
      /script-src 'unsafe-inline' blob:; style-src/
    )
  })

  it('lists what a payload may import', async () => {
    const body = (await (await fetch(`${origin}/libraries`)).json()) as {
      bundled: { specifier: string; version: string | null }[]
      cdn: { specifier: string; url: string; global: string }[]
    }

    assert.ok(body.bundled.some((entry) => entry.specifier === '@dnd-kit/core'))
    assert.ok(body.bundled.every((entry) => entry.version !== undefined))
    assert.equal(body.cdn[0]?.global, 'Plotly')
  })
})

describe('mocks', () => {
  it('lists the fixtures', async () => {
    const body = (await (await fetch(`${origin}/mocks`)).json()) as {
      mocks: { name: string; kind: string }[]
    }

    assert.ok(body.mocks.length >= 6)
    assert.ok(body.mocks.some((mock) => mock.name === 'counter'))
    assert.ok(body.mocks.some((mock) => mock.kind === 'tsx'))
  })

  it('compiles every fixture', async () => {
    const { mocks } = (await (await fetch(`${origin}/mocks`)).json()) as {
      mocks: { name: string }[]
    }

    for (const mock of mocks) {
      const response = await fetch(`${origin}/compile/${mock.name}`)

      assert.equal(response.status, 200, `${mock.name} failed to compile`)
    }
  })

  it('answers 404 for an unknown fixture', async () => {
    const response = await fetch(`${origin}/compile/../package`)

    assert.equal(response.status, 404)
  })
})

describe('GET /health', () => {
  it('reports ok', async () => {
    const response = await fetch(`${origin}/health`)

    assert.equal(response.status, 200)
    assert.equal(((await response.json()) as { status: string }).status, 'ok')
  })
})

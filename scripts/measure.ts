/**
 * Where the bytes go, and where the ceiling is.
 *
 * Compiles every fixture plus a set of synthetic payloads that grow until
 * something gives, and prints raw size, gzipped size and compile time for
 * each. Run it after changing the shell, the allowlist or anything that ships
 * in every document — the interesting number is not any one app but the fixed
 * floor every app pays before it has written a line.
 */
import { gzipSync } from 'node:zlib'

import { MAX_SOURCE_BYTES } from '../src/config.ts'
import { compile } from '../src/services/compile/index.ts'
import { listMocks, loadMock } from '../src/services/mocks/index.ts'

const kb = (bytes: number): string => (bytes / 1024).toFixed(0).padStart(5)

interface Row {
  name: string
  source: number
  raw: number
  gzip: number
  ms: number
  cdn: string
}

const measure = async (
  name: string,
  source: string,
  kind: 'jsx' | 'tsx' = 'jsx'
): Promise<Row> => {
  const result = await compile({ source, kind, title: name })

  return {
    name,
    source: Buffer.byteLength(source),
    raw: result.bytes,
    gzip: gzipSync(result.html).byteLength,
    ms: result.durationMs,
    cdn: result.cdn.join(',')
  }
}

const print = (title: string, rows: Row[], floor?: number) => {
  console.log(`\n${title}`)
  console.log(
    '  ' +
      'payload'.padEnd(24) +
      'source'.padStart(7) +
      'raw'.padStart(7) +
      'gzip'.padStart(7) +
      'app'.padStart(7) +
      'ms'.padStart(6) +
      '  cdn'
  )

  for (const row of rows) {
    console.log(
      '  ' +
        row.name.padEnd(24) +
        kb(row.source) +
        'K' +
        kb(row.raw) +
        'K' +
        kb(row.gzip) +
        'K' +
        (floor === undefined ? '      -' : kb(row.raw - floor) + 'K') +
        String(row.ms).padStart(6) +
        '  ' +
        row.cdn
    )
  }
}

/**
 * A payload that is large because it has a lot of components, which is how a
 * generated app actually gets big — not one enormous function.
 */
const synthetic = (count: number): string => {
  const parts = Array.from(
    { length: count },
    (_, index) => `
const Card${index} = ({ value }) => (
  <section style={{ padding: 8, border: '1px solid #eaecf0', borderRadius: 6 }}>
    <h3 style={{ margin: 0, fontSize: 13 }}>Metric ${index}</h3>
    <p style={{ margin: 0, color: '#667085' }}>{value} · row ${index}</p>
  </section>
)`
  ).join('\n')

  return `${parts}

export default function App() {
  return (
    <main style={{ padding: 16, display: 'grid', gap: 8 }}>
      ${Array.from({ length: count }, (_, index) => `<Card${index} key={${index}} value={${index}} />`).join('\n      ')}
    </main>
  )
}
`
}

const run = async () => {
  // Everything below is measured against this: React plus the runtime shell,
  // which every document pays whether it uses any of it or not.
  const empty = await measure('(floor)', 'export default () => null')
  const floor = empty.raw

  print('Fixed cost', [empty])
  console.log(
    `\n  Every document starts at ${kb(floor).trim()} KB raw / ` +
      `${kb(empty.gzip).trim()} KB gzipped before the app contributes anything.`
  )

  const mocks = await listMocks()
  const fixtures: Row[] = []

  for (const mock of mocks) {
    const { source, kind } = await loadMock(mock.name)

    fixtures.push(await measure(mock.name, source, kind))
  }

  print('Fixtures', fixtures, floor)

  const stress: Row[] = []

  for (const count of [10, 50, 200, 800, 2000]) {
    const source = synthetic(count)

    if (Buffer.byteLength(source) > MAX_SOURCE_BYTES) {
      console.log(
        `\n  ${count} components is ${kb(Buffer.byteLength(source)).trim()} KB of source, ` +
          `over the ${MAX_SOURCE_BYTES / 1024} KB cap — rejected before compiling.`
      )
      break
    }

    stress.push(await measure(`${count} components`, source))
  }

  print('Synthetic payloads', stress, floor)
}

await run()

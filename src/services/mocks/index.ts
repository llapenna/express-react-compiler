import { readFile, readdir } from 'node:fs/promises'
import { extname, join } from 'node:path'

import { MOCKS_DIR } from '../../config.ts'
import type { RenderKind } from '../compile/index.ts'

export interface Mock {
  /** Filename without extension — the id used in `/compile/:name`. */
  name: string
  kind: RenderKind
  source: string
}

const KINDS: Record<string, RenderKind> = { '.jsx': 'jsx', '.tsx': 'tsx' }

/**
 * The fixtures worth looking at first, in the order they make sense in.
 *
 * These are the candidate apps rather than demonstrations of a compiler
 * feature, so they lead the list; alphabetical order would bury them behind
 * `counter` and `bridge-demo`. Anything not named here follows, alphabetically.
 */
const FEATURED = [
  'close-cockpit',
  'collections-cockpit',
  'payment-plan-tracker',
  'budget-variance',
  'close-status'
]

const rank = (name: string): number => {
  const index = FEATURED.indexOf(name)

  return index === -1 ? FEATURED.length : index
}

export class UnknownMockError extends Error {
  constructor(name: string) {
    super(`No mock named "${name}"`)
    this.name = 'UnknownMockError'
  }
}

export const listMocks = async (): Promise<
  { name: string; kind: RenderKind }[]
> => {
  const entries = await readdir(MOCKS_DIR)

  return entries
    .filter((entry) => extname(entry) in KINDS)
    .map((entry) => ({
      name: entry.slice(0, -extname(entry).length),
      kind: KINDS[extname(entry)] as RenderKind
    }))
    .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name))
}

/**
 * Reads one fixture off disk.
 *
 * The name is resolved against the listing rather than joined into a path, so
 * a request can never traverse out of the fixtures directory.
 */
export const loadMock = async (name: string): Promise<Mock> => {
  const match = (await listMocks()).find((mock) => mock.name === name)

  if (!match) throw new UnknownMockError(name)

  const source = await readFile(
    join(MOCKS_DIR, `${match.name}.${match.kind}`),
    'utf8'
  )

  return { ...match, source }
}

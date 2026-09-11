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
    .sort((a, b) => a.name.localeCompare(b.name))
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

/**
 * What a payload gets when it writes `import { useHostQuery } from 'host'`.
 *
 * The privileged half of the bridge — the transport, the resource catalog, the
 * refusal to name a URL — lives in the injected shell (`shell.ts`) where model
 * output cannot reach it. This file is the ergonomic half: it turns
 * `host.query` into something that looks like the `useQuery` a generated app
 * would have written anyway, so the model does not have to invent loading and
 * error handling every time.
 *
 * It is a cache in front of a cache. The host's TanStack cache is the real
 * one; this keeps the frame from asking twice for the same thing in the same
 * paint and gives every subscriber of a resource one shared result.
 */
import { useCallback, useEffect, useReducer, useRef } from 'react'

const bridge = () => globalThis.host

/**
 * Key order in an object literal is whatever the author typed, so two
 * components asking for the same row must not end up in different slots.
 */
const identify = (resource, params) =>
  resource +
  '|' +
  JSON.stringify(params ?? {}, Object.keys(params ?? {}).sort())

const entries = new Map()

const entryFor = (key) => {
  let entry = entries.get(key)

  if (!entry) {
    entry = {
      data: undefined,
      error: null,
      pending: null,
      loaded: false,
      listeners: new Set()
    }
    entries.set(key, entry)
  }

  return entry
}

const emit = (entry) => {
  for (const listener of entry.listeners) listener()
}

const load = (entry, resource, params) => {
  // An in-flight read is shared rather than duplicated: ten rows asking for
  // the same lookup table produce one postMessage.
  if (entry.pending) return entry.pending

  const connection = bridge()

  if (!connection) {
    entry.error = new Error('The host bridge is missing from this document.')
    entry.loaded = true
    emit(entry)

    return Promise.resolve()
  }

  entry.pending = connection
    .query(resource, params)
    .then(
      (data) => {
        entry.data = data
        entry.error = null
      },
      (error) => {
        entry.error = error
      }
    )
    .finally(() => {
      entry.pending = null
      entry.loaded = true
      emit(entry)
    })

  emit(entry)

  return entry.pending
}

/**
 * A push naming `workbook` covers `workbook.list`; naming the leaf covers it
 * exactly.
 *
 * A push may also name the exact call — resource *and* params — and then only
 * the component that made that call re-reads. Without that, three rows reading
 * `workflow.runList` for three different workflows would each refetch every
 * time any one of them changed, and each refetch would push again.
 */
const affects = (changed, resource, key) =>
  changed.some((entry) => {
    const name = typeof entry === 'string' ? entry : entry.resource
    const matchesName = resource === name || resource.startsWith(name + '.')

    if (!matchesName) return false

    return typeof entry === 'string' || !entry.id || entry.id === key
  })

/**
 * Reads one resource from the host's cache.
 *
 * Re-reads whenever the host says that resource changed, so a generated app
 * tracks the surrounding app's data without polling — which it could not do
 * anyway, since `connect-src` is `'none'` inside the frame.
 */
export const useHostQuery = (resource, params, options = {}) => {
  const { enabled = true } = options
  const key = identify(resource, params)
  const latest = useRef(params)
  const [, rerender] = useReducer((count) => count + 1, 0)

  latest.current = params

  const entry = entryFor(key)

  useEffect(() => {
    if (!enabled) return

    const current = entryFor(key)
    current.listeners.add(rerender)

    if (!current.loaded && !current.pending) {
      load(current, resource, latest.current)
    }

    return () => {
      current.listeners.delete(rerender)
    }
    // `key` already encodes resource and params.
  }, [key, enabled])

  useEffect(() => {
    if (!enabled) return

    return bridge()?.subscribe((changed) => {
      if (affects(changed, resource, key)) {
        load(entryFor(key), resource, latest.current)
      }
    })
  }, [key, enabled])

  const refetch = useCallback(
    () => load(entryFor(key), resource, latest.current),
    [key]
  )

  return {
    data: entry.data,
    error: entry.error,
    /** First read only — a background re-read keeps the previous data on screen. */
    isLoading: enabled && !entry.loaded,
    isFetching: Boolean(entry.pending),
    refetch
  }
}

/**
 * Runs a write. It fires as soon as the host receives it; whether the resource
 * is callable at all was decided by the host's resolver table, not here.
 *
 * Nothing is invalidated here either. The host owns the cache, so it decides
 * what the write touched and pushes the result back through `subscribe`.
 */
export const useHostMutation = (resource) => {
  const [, rerender] = useReducer((count) => count + 1, 0)
  const state = useRef({ pending: false, error: null, data: undefined })
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true

    return () => {
      mounted.current = false
    }
  }, [])

  const settle = (next) => {
    state.current = next
    if (mounted.current) rerender()
  }

  const mutate = useCallback(
    async (params) => {
      settle({ pending: true, error: null, data: undefined })

      try {
        const data = await bridge().mutate(resource, params)

        settle({ pending: false, error: null, data })

        return data
      } catch (error) {
        settle({ pending: false, error, data: undefined })

        throw error
      }
    },
    [resource]
  )

  return {
    mutate,
    isPending: state.current.pending,
    error: state.current.error,
    data: state.current.data
  }
}

/**
 * Whether there is a host answering at all. A document opened outside the app
 * has none, and an app that renders an empty state for that is far better than
 * one that shows a spinner forever.
 */
export const useHostConnected = () => {
  const [connected, set] = useReducer((_, value) => value, null)

  useEffect(() => {
    let live = true

    bridge()
      ?.connected.then((value) => live && set(value))

    return () => {
      live = false
    }
  }, [])

  return connected
}

/** The raw bridge, for anything the hooks do not cover. */
export const host = new Proxy(
  {},
  {
    get: (_target, property) => bridge()?.[property]
  }
)

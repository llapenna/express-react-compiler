/**
 * The host half of the bridge: what the embedding React app runs.
 *
 * Written against TanStack Query's real API (`fetchQuery`, `invalidateQueries`,
 * `getQueryCache().subscribe`) so it drops into the app unchanged — the
 * harness in this repo hands it a stand-in with the same surface.
 *
 * The division of labour is the whole point. The frame names a resource; this
 * decides what that means. Query keys, fetchers, the company id and the
 * session all live out here, in the realm that already has them. Nothing about
 * the frame is trusted: not the resource name, not the params, and not the
 * fact that it asked at all.
 *
 * Writes fire as soon as they arrive. The resolver table is the only gate — a
 * mutation the host has not wired up cannot be called at all — so what a
 * generated app is allowed to do is decided once, here, rather than per click.
 */

/**
 * @param frame        the <iframe> element
 * @param queryClient  the app's QueryClient — the same one its screens use, or
 *                     the cache sharing does not happen
 * @param catalog      { resource: 'query' | 'mutation' }, from GET /resources
 * @param resolvers    resource -> { queryKey, queryFn, staleTime } for reads,
 *                     resource -> { run, invalidates } for writes
 * @param actions      extra named actions for host.call()
 * @param onEvent      render:ready | render:height | render:error, for the shell
 */
export const createHostBridge = ({
  frame,
  queryClient,
  catalog,
  resolvers,
  actions = {},
  onEvent = () => {}
}) => {
  /**
   * Serialised query key -> what the frame called it. Only keys this frame has
   * actually read are in here, so a cache event for some unrelated screen
   * never wakes the frame up.
   *
   * The entry carries the frame's own identity for the read — resource plus
   * params — not just the resource name. Resources are parameterised, so three
   * components reading `workflow.runList` for three different workflows share
   * a name and nothing else; notifying by name alone would make every cache
   * event refetch all of them.
   */
  const watching = new Map()
  const identify = (queryKey) => JSON.stringify(queryKey)

  /** Must match `identify` in the frame's `host.js`, or nothing lines up. */
  const callIdentity = (resource, params) =>
    resource +
    '|' +
    JSON.stringify(params ?? {}, Object.keys(params ?? {}).sort())

  const post = (message) => frame.contentWindow?.postMessage(message, '*')

  const resolverFor = (resource, kind) => {
    if (catalog[resource] !== kind) {
      throw new Error(`"${resource}" is not a known ${kind}`)
    }

    const resolver = resolvers[resource]

    if (!resolver) throw new Error(`"${resource}" is not wired up on the host`)

    return resolver
  }

  const read = async ({ resource, params }) => {
    const { queryKey, queryFn, staleTime = 30_000 } = resolverFor(
      resource,
      'query'
    )
    const key = queryKey(params)

    watching.set(identify(key), { resource, id: callIdentity(resource, params) })

    // fetchQuery, not a bare fetch: a fresh entry is served from cache, a
    // stale one refetches, and a concurrent read of the same key is
    // deduplicated — all the behaviour the app already relies on.
    return queryClient.fetchQuery({
      queryKey: key,
      queryFn: () => queryFn(params),
      staleTime
    })
  }

  const write = async ({ resource, params }) => {
    const { run, invalidates = () => [] } = resolverFor(resource, 'mutation')
    const result = await run(params)

    for (const queryKey of invalidates(params)) {
      await queryClient.invalidateQueries({ queryKey })
    }

    return result
  }

  const handle = async (event) => {
    if (event.source !== frame.contentWindow) return

    const { type, id, method, params } = event.data ?? {}

    if (type === 'render:hello') return post({ type: 'host:hello' })

    if (type?.startsWith?.('render:')) return onEvent(event.data)

    if (typeof id !== 'number' || typeof method !== 'string') return

    const reply = (payload) => post({ jsonrpc: '2.0', id, ...payload })

    try {
      if (method === 'data:query') return reply({ result: await read(params) })
      if (method === 'data:mutate') return reply({ result: await write(params) })

      const action = actions[method]

      if (!action) throw new Error(`Unknown action: ${method}`)

      reply({ result: await action(params ?? {}) })
    } catch (error) {
      reply({ error: { message: error.message } })
    }
  }

  /**
   * The live half. Anything that changes the cache — a refetch elsewhere in
   * the app, a websocket push, the user editing a row on another screen —
   * reaches the frame here. Coalesced into one message per tick so a bulk
   * invalidation does not become fifty postMessages.
   */
  let queued = new Set()
  let scheduled = false

  const flush = () => {
    scheduled = false

    const changes = [...queued].map((entry) => JSON.parse(entry))
    queued = new Set()

    if (changes.length) {
      post({
        type: 'data:changed',
        // Names alone, for a host that wants to invalidate a whole resource.
        resources: [...new Set(changes.map((change) => change.resource))],
        changes
      })
    }
  }

  const unsubscribe = queryClient.getQueryCache().subscribe((cacheEvent) => {
    const watched = watching.get(identify(cacheEvent.query?.queryKey))

    if (!watched || !['updated', 'removed'].includes(cacheEvent.type)) return

    queued.add(JSON.stringify(watched))

    if (!scheduled) {
      scheduled = true
      queueMicrotask(flush)
    }
  })

  addEventListener('message', handle)

  return () => {
    removeEventListener('message', handle)
    unsubscribe()
    watching.clear()
  }
}

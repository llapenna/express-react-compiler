/**
 * The data surface a generated app may reach, and the complete definition of
 * it. A frame can name a resource on this list and nothing else.
 *
 * The names and shapes mirror the host app's own `API_ROUTES`, so a resource
 * here has an obvious counterpart there — but the frame never sees a URL. It
 * posts `{ resource, params }` and the host decides which query key that is,
 * which fetcher answers it, and whether the caller is allowed to ask. Two
 * consequences worth being explicit about:
 *
 * - **`companyId` is never a parameter.** Every path in the host app is scoped
 *   by company; the host fills that in from its own session. A frame cannot
 *   ask for another tenant's data because it has no way to name one.
 * - **Reads come from the host's TanStack cache**, not from the network. A
 *   generated app asking for `workbook.list` gets whatever the surrounding app
 *   already has, on the same invalidation schedule, for free.
 *
 * `endpoint` is documentation, not routing: it says which API_ROUTES entry the
 * host adapter is expected to wire this to.
 */
export type ResourceKind = 'query' | 'mutation'

export interface HostResource {
  kind: ResourceKind
  /** Parameters the frame supplies. `companyId` is deliberately never here. */
  params: readonly string[]
  /** The API_ROUTES path this is expected to map to, for the host wiring. */
  endpoint: string
  /** Shown to whoever generates payloads; keep it one line. */
  describe: string
}

/**
 * Reads are cheap and idempotent, so they resolve straight out of the cache.
 * Writes are not, and every one of them is listed separately so the host can
 * decide about them individually: a mutation reaches the API only if the host
 * wired up a resolver for it, which makes this list plus the host's resolver
 * table the complete statement of what a generated app can do.
 *
 * The split by kind is enforced by the bridge rather than left to convention,
 * so a payload cannot reach a write through the read path.
 */
export const HOST_RESOURCES = {
  'user.me': {
    kind: 'query',
    params: ['userId'],
    endpoint: 'user.me',
    describe: 'The signed-in user’s profile.'
  },
  'company.byId': {
    kind: 'query',
    params: [],
    endpoint: 'company.byId',
    describe: 'The company the frame is embedded in.'
  },
  'company.members': {
    kind: 'query',
    params: [],
    endpoint: 'company.members',
    describe: 'Members, for assigning an owner to a row.'
  },
  'company.contacts': {
    kind: 'query',
    params: [],
    endpoint: 'company.contacts',
    describe: 'Company contacts.'
  },
  'teams.list': {
    kind: 'query',
    params: [],
    endpoint: 'teams.list',
    describe: 'Teams, for routing an exception to an owner.'
  },

  'workbook.list': {
    kind: 'query',
    params: [],
    endpoint: 'workbook.list',
    describe: 'Every workbook the user can see.'
  },
  'workbook.byId': {
    kind: 'query',
    params: ['workbookId'],
    endpoint: 'workbook.byId',
    describe: 'One workbook, including its definition.'
  },
  'workbook.outputList': {
    kind: 'query',
    params: ['workbookId'],
    endpoint: 'workbook.output',
    describe: 'Outputs a workbook has produced — the usual source of table data.'
  },
  'workbook.outputById': {
    kind: 'query',
    params: ['workbookId', 'outputId'],
    endpoint: 'workbook.outputById',
    describe: 'One output, rows included.'
  },
  'workbook.messageList': {
    kind: 'query',
    params: ['workbookId'],
    endpoint: 'workbook.message',
    describe: 'The workbook’s chat history.'
  },

  'reports.list': {
    kind: 'query',
    params: [],
    endpoint: 'reports.list',
    describe: 'Saved reports.'
  },
  'reports.byId': {
    kind: 'query',
    params: ['reportId'],
    endpoint: 'reports.byId',
    describe: 'One report and its current contents.'
  },
  'reports.versionList': {
    kind: 'query',
    params: ['reportId'],
    endpoint: 'reports.version',
    describe: 'Past runs of a report — the basis for month-over-month deltas.'
  },

  'credential.list': {
    kind: 'query',
    params: [],
    endpoint: 'credential.list',
    describe: 'Connected sources, with sync state — the tie-out’s “as of”.'
  },
  'credential.warehouseTables': {
    kind: 'query',
    params: ['credentialId'],
    endpoint: 'credential.warehouse',
    describe: 'Tables a connected source exposes.'
  },
  'credential.warehouseTableColumns': {
    kind: 'query',
    params: ['credentialId', 'tableId'],
    endpoint: 'credential.warehouseTableColumns',
    describe: 'Columns of one warehouse table.'
  },
  'credential.warehouseTablePreview': {
    kind: 'query',
    params: ['credentialId', 'tableId'],
    endpoint: 'credential.warehouseTablePreview',
    describe: 'Rows from one warehouse table. The widest read on this list.'
  },

  'memories.list': {
    kind: 'query',
    params: [],
    endpoint: 'memories.list',
    describe: 'Stored context — e.g. last month’s variance commentary.'
  },

  /**
   * Scratch storage for an app that has rows of its own.
   *
   * Everything else on this list reads something the ERP already knows. A
   * read-write mini-app — a tracker with check-offs, a list someone maintains
   * by hand — has rows that exist nowhere upstream, and without somewhere to
   * put them the app can only ever be a view. This is that somewhere: a small
   * per-app document, namespaced by `key`, owned by the host.
   *
   * It has no counterpart in the current API. Wiring it up is a real decision,
   * not a mapping exercise, and it is the thing standing between a dashboard
   * and the tracker a customer already built for herself elsewhere.
   */
  'appState.get': {
    kind: 'query',
    params: ['key'],
    endpoint: '(none yet — needs a document store)',
    describe: 'Rows this app maintains itself, by key.'
  },
  'appState.set': {
    kind: 'mutation',
    params: ['key', 'value'],
    endpoint: '(none yet — needs a document store)',
    describe: 'Replace this app’s rows for a key.'
  },

  'workflow.list': {
    kind: 'query',
    params: [],
    endpoint: 'workflow.list',
    describe: 'Scheduled workflows.'
  },
  'workflow.runList': {
    kind: 'query',
    params: ['workflowId'],
    endpoint: 'workflow.runList',
    describe: 'Runs of one workflow, for a freshness or close-status view.'
  },

  'exports.list': {
    kind: 'query',
    params: [],
    endpoint: 'exports.list',
    describe: 'Exports the user has requested.'
  },

  'reports.run': {
    kind: 'mutation',
    params: ['reportId'],
    endpoint: 'reports.run',
    describe: 'Re-run a report against current data.'
  },
  'workbook.sendMessage': {
    kind: 'mutation',
    params: ['workbookId', 'message'],
    endpoint: 'workbook.message',
    describe: 'Ask a workbook agent something on the user’s behalf.'
  },
  'exports.request': {
    kind: 'mutation',
    params: ['resourceType', 'resourceId'],
    endpoint: 'exports.request',
    describe: 'Queue an export of something the user is looking at.'
  },
  'memories.create': {
    kind: 'mutation',
    params: ['title', 'content'],
    endpoint: 'memories.list',
    describe: 'Save commentary so next month’s report can carry it forward.'
  }
} as const satisfies Record<string, HostResource>

export type ResourceName = keyof typeof HOST_RESOURCES

export const isResource = (name: string): name is ResourceName =>
  Object.hasOwn(HOST_RESOURCES, name)

/** The catalog as a list — for `GET /resources` and for the generating model. */
export const resourceList = (): (HostResource & { resource: string })[] =>
  Object.entries(HOST_RESOURCES).map(([resource, entry]) => ({
    resource,
    ...entry
  }))

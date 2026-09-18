/**
 * Stands in for the embedding app: a cache with the shape of TanStack Query's,
 * fixture data with the shape of the finance API, and the resolver table that
 * maps a resource name to both.
 *
 * In the real app none of this is written — `queryClient` is the app's own,
 * `queryFn` is its `request()` against `API_ROUTES`, and `queryKey` comes from
 * the existing `queryKeys.ts` factories. The resolver table is the only new
 * file, and it is the only place that decides what a generated app can see.
 */

/**
 * The subset of QueryClient the bridge uses. Real enough to exercise the
 * behaviour that matters: a fresh entry is served without refetching, a stale
 * one refetches, and every write notifies subscribers.
 */
export const createQueryClient = () => {
  const entries = new Map()
  const listeners = new Set()
  const identify = (queryKey) => JSON.stringify(queryKey)

  const notify = (type, queryKey) => {
    for (const listener of listeners) listener({ type, query: { queryKey } })
  }

  return {
    async fetchQuery({ queryKey, queryFn, staleTime = 0 }) {
      const id = identify(queryKey)
      const entry = entries.get(id)

      if (entry && Date.now() - entry.at < staleTime) return entry.data

      const data = await queryFn()

      entries.set(id, { data, at: Date.now(), queryKey })
      notify('updated', queryKey)

      return data
    },

    getQueryData(queryKey) {
      return entries.get(identify(queryKey))?.data
    },

    /** How the surrounding app pushes a change the frame should see. */
    setQueryData(queryKey, data) {
      entries.set(identify(queryKey), { data, at: Date.now(), queryKey })
      notify('updated', queryKey)
    },

    async invalidateQueries({ queryKey }) {
      const prefix = identify(queryKey).slice(0, -1)

      for (const [id, entry] of entries) {
        if (!id.startsWith(prefix)) continue

        entries.delete(id)
        notify('removed', entry.queryKey)
      }
    },

    getQueryCache: () => ({
      subscribe(listener) {
        listeners.add(listener)

        return () => listeners.delete(listener)
      }
    })
  }
}

const COMPANY_ID = 'c_8f21'

/** Roughly the shape the real endpoints return, and nothing more. */
const fixtures = {
  company: {
    id: COMPANY_ID,
    name: 'Northwind Manufacturing',
    fiscalYearEnd: '12-31'
  },
  members: [
    { userId: 'u_1', name: 'Katie Alvarez', role: 'Controller' },
    { userId: 'u_2', name: 'Stephen Mbeki', role: 'FP&A' },
    { userId: 'u_3', name: 'Tianna Reyes', role: 'Accounting Manager' }
  ],
  credentials: [
    {
      id: 41,
      provider: 'netsuite',
      label: 'NetSuite (production)',
      status: 'connected',
      lastSyncedAt: '2026-09-15T06:12:00Z'
    },
    {
      id: 42,
      provider: 'quickbooks',
      label: 'QuickBooks',
      status: 'connected',
      lastSyncedAt: '2026-09-15T06:14:00Z'
    }
  ],
  workbooks: [
    { id: 'wb_ar', name: 'AR aging', updatedAt: '2026-09-15T06:20:00Z' },
    { id: 'wb_bva', name: 'Budget vs actual', updatedAt: '2026-09-15T06:21:00Z' },
    { id: 'wb_cash', name: 'Cash position', updatedAt: '2026-09-14T22:02:00Z' }
  ],
  /**
   * Departmental budget against actuals, mid-month. `threshold` is per
   * department because tolerance is not uniform — a 4% swing in COGS is a
   * different conversation from 4% in travel.
   */
  variance: {
    asOf: '2026-09-15',
    period: 'September 2026',
    source: 'NetSuite',
    controlTotal: 3_140_000,
    rows: [
      { id: 'dep_cogs', department: 'Cost of goods', owner: 'u_2', budget: 1_650_000, actual: 1_811_000, threshold: 5 },
      { id: 'dep_sales', department: 'Sales', owner: 'u_1', budget: 480_000, actual: 512_400, threshold: 8 },
      { id: 'dep_mkt', department: 'Marketing', owner: 'u_1', budget: 220_000, actual: 138_500, threshold: 10 },
      { id: 'dep_rd', department: 'R&D', owner: 'u_2', budget: 390_000, actual: 401_200, threshold: 10 },
      { id: 'dep_ga', department: 'G&A', owner: 'u_3', budget: 275_000, actual: 276_900, threshold: 6 }
    ]
  },
  workflows: [
    { id: 'wf_close', name: 'Month-end close pack', schedule: 'Close day 3' },
    { id: 'wf_ar', name: 'AR aging refresh', schedule: 'Daily 06:00' },
    { id: 'wf_board', name: 'Board deck figures', schedule: 'Monthly' }
  ],
  runs: {
    wf_close: [
      { id: 'run_31', status: 'running', startedAt: '2026-09-15T05:40:00Z', owner: 'u_3' },
      { id: 'run_30', status: 'succeeded', startedAt: '2026-08-13T05:40:00Z', owner: 'u_3' }
    ],
    wf_ar: [
      { id: 'run_88', status: 'succeeded', startedAt: '2026-09-15T06:00:00Z', owner: 'u_1' }
    ],
    wf_board: [
      { id: 'run_12', status: 'failed', startedAt: '2026-09-01T07:00:00Z', owner: 'u_2', detail: 'Budgets not loaded for Q3' }
    ]
  },
  /** Last month's explanations, the thing a report should carry forward. */
  memories: [
    { id: 'mem_1', title: 'Cost of goods — August', content: 'Freight surcharge on the Bellweather rush order; one-off, not run-rate.' },
    { id: 'mem_2', title: 'Marketing — August', content: 'Trade show moved to Q4, spend deferred not cancelled.' }
  ],
  /** Twelve months of budget against actuals, for a chart rather than a table. */
  trend: {
    asOf: '2026-09-15',
    source: 'NetSuite',
    months: ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'],
    budget: [2980, 3010, 3120, 2890, 2940, 3050, 3080, 3110, 3090, 3140, 3120, 3140],
    actual: [2941, 3088, 3260, 2812, 2903, 3141, 3202, 3054, 3188, 3301, 3245, 3140]
  },
  /**
   * The rows no upstream system has. In the real app this needs a home; here
   * it is a plain object the resolvers read and replace.
   */
  appState: {
    'close-checklist': [
      { id: 't1', task: 'Bank reconciliations', owner: 'u_3', status: 'done', day: 1 },
      { id: 't2', task: 'AR aging tie-out', owner: 'u_1', status: 'done', day: 2 },
      { id: 't3', task: 'Accrual journal entries', owner: 'u_3', status: 'in-progress', day: 3 },
      { id: 't4', task: 'Intercompany eliminations', owner: 'u_2', status: 'blocked', day: 3 },
      { id: 't5', task: 'Revenue cut-off review', owner: 'u_1', status: 'todo', day: 4 },
      { id: 't6', task: 'Flux analysis and commentary', owner: 'u_2', status: 'todo', day: 5 },
      { id: 't7', task: 'Board pack figures', owner: 'u_2', status: 'todo', day: 6 }
    ],
    'payment-plans': [
      {
        id: 'pp_1',
        customer: 'Corbin Logistics',
        owner: 'u_1',
        total: 288_500,
        agreedOn: '2026-07-02',
        installments: [
          { id: 'i1', dueDate: '2026-07-15', amount: 96_200, status: 'paid' },
          { id: 'i2', dueDate: '2026-08-15', amount: 96_150, status: 'paid' },
          { id: 'i3', dueDate: '2026-09-15', amount: 96_150, status: 'due' }
        ]
      },
      {
        id: 'pp_2',
        customer: 'Harrow Medical',
        owner: 'u_3',
        total: 196_000,
        agreedOn: '2026-08-20',
        installments: [
          { id: 'i1', dueDate: '2026-09-01', amount: 98_000, status: 'paid' },
          { id: 'i2', dueDate: '2026-10-01', amount: 98_000, status: 'scheduled' }
        ]
      }
    ]
  },
  /** The invoice rows, plus the control total the app ties out against. */
  aging: {
    asOf: '2026-09-15',
    source: 'NetSuite',
    controlTotal: 1_284_500,
    rows: [
      { id: 'inv_1041', customer: 'Bellweather Foods', amount: 412_000, daysLate: 63, owner: 'u_1', status: 'escalated' },
      { id: 'inv_1044', customer: 'Corbin Logistics', amount: 288_500, daysLate: 41, owner: 'u_3', status: 'contacted' },
      { id: 'inv_1052', customer: 'Harrow Medical', amount: 196_000, daysLate: 28, owner: 'u_1', status: 'contacted' },
      { id: 'inv_1060', customer: 'Peak Ridge Dairy', amount: 155_000, daysLate: 17, owner: 'u_2', status: 'new' },
      { id: 'inv_1063', customer: 'Sanda Components', amount: 121_000, daysLate: 11, owner: 'u_3', status: 'new' },
      { id: 'inv_1071', customer: 'Verity Tooling', amount: 112_000, daysLate: 4, owner: 'u_2', status: 'new' }
    ]
  }
}

/** Every read pretends to be a network round trip, so loading states are real. */
const slow = (value, ms = 220) =>
  new Promise((resolve) => setTimeout(() => resolve(structuredClone(value)), ms))

/**
 * resource -> query key + fetcher, or -> the write and what it invalidates.
 *
 * The keys below are the ones the app's own `queryKeys.ts` factories produce,
 * which is what makes this cache sharing rather than a second cache: a screen
 * in the app and a generated frame asking for `workbook.list` land on the same
 * entry, and one invalidation moves both.
 */
export const createResolvers = (log) => ({
  'company.byId': {
    queryKey: () => ['company', COMPANY_ID],
    queryFn: () => slow(fixtures.company)
  },
  'company.members': {
    queryKey: () => ['company', COMPANY_ID, 'members'],
    queryFn: () => slow(fixtures.members)
  },
  'credential.list': {
    queryKey: () => ['credentials', 'list'],
    queryFn: () => slow(fixtures.credentials)
  },
  'workbook.list': {
    queryKey: () => ['workbook', 'base', 'list'],
    queryFn: () => slow(fixtures.workbooks)
  },
  'workbook.outputList': {
    queryKey: ({ workbookId }) => ['workbook', 'base', workbookId, 'output'],
    queryFn: ({ workbookId }) =>
      slow(
        { wb_bva: fixtures.variance, wb_trend: fixtures.trend }[workbookId] ??
          fixtures.aging
      )
  },
  'workflow.list': {
    queryKey: () => ['workflow', 'list'],
    queryFn: () => slow(fixtures.workflows)
  },
  'workflow.runList': {
    queryKey: ({ workflowId }) => ['workflow', workflowId, 'run'],
    queryFn: ({ workflowId }) => slow(fixtures.runs[workflowId] ?? [])
  },
  'memories.list': {
    queryKey: () => ['memory', 'list'],
    queryFn: () => slow(fixtures.memories)
  },
  'appState.get': {
    queryKey: ({ key }) => ['appState', key],
    queryFn: ({ key }) => slow(fixtures.appState[key] ?? null, 120)
  },
  'appState.set': {
    run: async ({ key, value }) => {
      fixtures.appState[key] = structuredClone(value)

      return slow({ key, savedAt: new Date().toISOString() }, 150)
    },
    invalidates: ({ key }) => [['appState', key]]
  },

  'workbook.sendMessage': {
    run: async ({ workbookId, message }) => {
      log(`sent to ${workbookId}: ${message}`)

      return slow({ accepted: true, queuedAt: new Date().toISOString() }, 400)
    },
    invalidates: ({ workbookId }) => [['workbook', 'base', workbookId]]
  },
  'exports.request': {
    run: async ({ resourceType, resourceId }) => {
      log(`export queued: ${resourceType}/${resourceId}`)

      return slow({ exportId: 'ex_' + Date.now() }, 400)
    },
    invalidates: () => [['export', 'list']]
  },
  'memories.create': {
    run: async ({ title, content }) => {
      log(`memory saved: ${title}`)
      fixtures.memories = [
        ...fixtures.memories,
        { id: 'mem_' + Date.now(), title, content }
      ]

      return slow({ id: 'mem_' + Date.now() }, 300)
    },
    invalidates: () => [['memory', 'list']]
  }
})

/**
 * Moves the fixture on, so the harness can prove the live path: the frame is
 * not polling and cannot reach the network, yet it repaints.
 */
export const simulateSync = (queryClient) => {
  const next = structuredClone(fixtures.aging)
  const [first] = next.rows

  first.amount = Math.max(0, first.amount - 90_000)
  next.controlTotal = next.rows.reduce((total, row) => total + row.amount, 0)
  next.asOf = new Date().toISOString().slice(0, 10)
  fixtures.aging = next

  queryClient.setQueryData(['workbook', 'base', 'wb_ar', 'output'], next)
}

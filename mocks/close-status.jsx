import { CircleAlert, CircleCheck, Loader, Plug } from 'lucide-react'

import { useHostQuery } from 'host'

/**
 * Where the numbers came from and when — the view that has to exist before any
 * of the others can be trusted.
 *
 * Every dashboard people described was capped by data readiness rather than by
 * missing UI: a source that has not synced, budgets that were never loaded, a
 * scheduled run that failed quietly. This says so plainly instead of rendering
 * stale figures with a confident chart around them.
 *
 * It reads only, and it is the cheapest app on the list: three resources and
 * no state of its own.
 */
const STATUS = {
  succeeded: { Glyph: CircleCheck, color: '#12b76a', label: 'succeeded' },
  running: { Glyph: Loader, color: '#475467', label: 'running' },
  failed: { Glyph: CircleAlert, color: '#b42318', label: 'failed' }
}

const styles = {
  page: { padding: 20, maxWidth: 720 },
  muted: { color: '#667085', fontSize: 12, margin: 0 },
  section: { marginTop: 18 },
  label: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: '#98a2b3',
    margin: '0 0 6px'
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '9px 12px',
    border: '1px solid #eaecf0',
    borderRadius: 8,
    marginBottom: 6,
    fontSize: 13
  },
  when: {
    marginLeft: 'auto',
    fontSize: 12,
    color: '#667085',
    fontVariantNumeric: 'tabular-nums'
  }
}

/** Relative, because "6 hours ago" is the question people are actually asking. */
const since = (iso) => {
  if (!iso) return 'never'

  const hours = (Date.now() - new Date(iso)) / 3_600_000

  if (hours < 1) return 'just now'
  if (hours < 48) return `${Math.round(hours)}h ago`

  return `${Math.round(hours / 24)}d ago`
}

/**
 * One child per workflow, because the run list is per workflow and hooks
 * cannot be called in a loop. It also means each row loads independently
 * rather than the whole board waiting on the slowest one.
 */
function Workflow({ workflow, owners }) {
  const runs = useHostQuery('workflow.runList', { workflowId: workflow.id })
  const [latest] = runs.data ?? []

  if (runs.isLoading) {
    return (
      <div style={styles.row}>
        <span style={styles.muted}>{workflow.name}</span>
      </div>
    )
  }

  const { Glyph, color, label } = STATUS[latest?.status] ?? STATUS.failed

  return (
    <div
      style={{
        ...styles.row,
        ...(latest?.status === 'failed'
          ? { borderColor: '#fecdc9', background: '#fffbfa' }
          : null)
      }}
    >
      <Glyph size={15} color={color} />
      <span>{workflow.name}</span>
      <span style={styles.muted}>
        {workflow.schedule}
        {latest?.owner ? ` · ${owners[latest.owner] ?? ''}` : ''}
        {/* A failure with no reason on screen is a failure someone has to go
            hunting for, which is the thing this view exists to prevent. */}
        {latest?.detail ? ` · ${latest.detail}` : ''}
      </span>
      <span style={{ ...styles.when, color: latest?.status === 'failed' ? '#b42318' : undefined }}>
        {label} · {since(latest?.startedAt)}
      </span>
    </div>
  )
}

export default function CloseStatus() {
  const sources = useHostQuery('credential.list')
  const workflows = useHostQuery('workflow.list')
  const members = useHostQuery('company.members')

  const owners = Object.fromEntries(
    (members.data ?? []).map((member) => [member.userId, member.name])
  )

  if (sources.isLoading || workflows.isLoading) {
    return (
      <main style={styles.page}>
        <p style={styles.muted}>Reading the host cache…</p>
      </main>
    )
  }

  const stale = (sources.data ?? []).filter(
    (source) => (Date.now() - new Date(source.lastSyncedAt)) / 3_600_000 > 24
  )

  return (
    <main style={styles.page}>
      <h1 style={{ fontSize: 16, margin: 0 }}>Close status</h1>
      <p style={styles.muted}>
        {sources.data.length} sources · {workflows.data.length} scheduled jobs
        {stale.length ? ` · ${stale.length} stale` : ' · all synced today'}
      </p>

      <div style={styles.section}>
        <p style={styles.label}>Sources</p>
        {sources.data.map((source) => (
          <div key={source.id} style={styles.row}>
            <Plug size={15} color="#475467" />
            <span>{source.label}</span>
            <span style={styles.muted}>{source.status}</span>
            <span style={styles.when}>synced {since(source.lastSyncedAt)}</span>
          </div>
        ))}
      </div>

      <div style={styles.section}>
        <p style={styles.label}>Scheduled</p>
        {workflows.data.map((workflow) => (
          <Workflow key={workflow.id} workflow={workflow} owners={owners} />
        ))}
      </div>
    </main>
  )
}

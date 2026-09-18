import { useState } from 'react'
import { ArrowDownRight, ArrowUpRight, Check, Send } from 'lucide-react'

import { useHostMutation, useHostQuery } from 'host'

/**
 * Mid-month exception monitor: which departments have already drifted past
 * their own tolerance, who owns each one, and what was said about it last
 * month.
 *
 * Two things here that a chart would not give you:
 *
 * - **Tolerance is per department.** A single global threshold turns this into
 *   noise — 4% on cost of goods is a conversation, 4% on travel is rounding.
 *   The row carries its own threshold and the app only flags what breaches it.
 * - **Last month's explanation is on screen.** Re-researching "why is this
 *   high" every month is the work; the commentary is stored context, so the
 *   report can carry it forward and the analyst can confirm rather than
 *   rediscover.
 */
const WORKBOOK_ID = 'wb_bva'

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
})

const styles = {
  page: { padding: 20, maxWidth: 800 },
  head: { display: 'flex', alignItems: 'baseline', gap: 10 },
  muted: { color: '#667085', fontSize: 12, margin: 0 },
  tie: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    margin: '14px 0',
    padding: '8px 12px',
    borderRadius: 8,
    fontSize: 13
  },
  toggle: {
    marginLeft: 'auto',
    padding: '4px 10px',
    borderRadius: 6,
    border: '1px solid #d0d5dd',
    background: '#fff',
    font: 'inherit',
    fontSize: 12,
    cursor: 'pointer'
  },
  card: {
    padding: '12px 14px',
    borderRadius: 10,
    border: '1px solid #eaecf0',
    marginBottom: 8
  },
  cardHead: { display: 'flex', alignItems: 'center', gap: 8 },
  delta: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums'
  },
  figures: {
    display: 'flex',
    gap: 18,
    marginTop: 6,
    fontSize: 12,
    color: '#475467',
    fontVariantNumeric: 'tabular-nums'
  },
  memo: {
    marginTop: 8,
    padding: '7px 10px',
    borderRadius: 6,
    background: '#f9fafb',
    fontSize: 12,
    color: '#475467'
  },
  actions: { display: 'flex', gap: 8, marginTop: 10 },
  button: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '5px 10px',
    borderRadius: 6,
    border: '1px solid #d0d5dd',
    background: '#fff',
    font: 'inherit',
    fontSize: 12,
    cursor: 'pointer'
  },
  input: {
    flex: 1,
    padding: '5px 9px',
    borderRadius: 6,
    border: '1px solid #d0d5dd',
    font: 'inherit',
    fontSize: 12
  }
}

const withVariance = (row) => {
  const variance = row.actual - row.budget

  return {
    ...row,
    variance,
    // Over budget is the exception people chase, but a large underspend is
    // also a miss, so the breach test is on magnitude.
    variancePct: (variance / row.budget) * 100
  }
}

function Department({ row, owner, memory, onNotify, onExplain, busy }) {
  const [note, setNote] = useState('')
  const over = row.variance > 0
  const Arrow = over ? ArrowUpRight : ArrowDownRight
  const tone = over ? '#b42318' : '#027a48'

  return (
    <section style={styles.card}>
      <div style={styles.cardHead}>
        <strong style={{ fontSize: 14 }}>{row.department}</strong>
        <span style={{ ...styles.delta, color: tone }}>
          <Arrow size={14} />
          {row.variancePct.toFixed(1)}%
        </span>
        <span style={{ ...styles.muted, marginLeft: 'auto' }}>
          {owner ?? 'unassigned'} · tolerance ±{row.threshold}%
        </span>
      </div>

      <div style={styles.figures}>
        <span>budget {money.format(row.budget)}</span>
        <span>actual {money.format(row.actual)}</span>
        <span style={{ color: tone }}>
          {over ? '+' : ''}
          {money.format(row.variance)}
        </span>
      </div>

      {memory && <div style={styles.memo}>Last month: {memory.content}</div>}

      <div style={styles.actions}>
        <button
          style={styles.button}
          type="button"
          disabled={busy}
          onClick={() => onNotify(row)}
        >
          <Send size={12} />
          Notify {owner?.split(' ')[0] ?? 'owner'}
        </button>
        <input
          style={styles.input}
          placeholder="Why is this off?"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        <button
          style={styles.button}
          type="button"
          disabled={busy || !note.trim()}
          onClick={() => {
            onExplain(row, note.trim())
            setNote('')
          }}
        >
          Save reason
        </button>
      </div>
    </section>
  )
}

export default function BudgetVariance() {
  const [onlyBreaches, setOnlyBreaches] = useState(true)
  const [note, setNote] = useState('')

  const report = useHostQuery('workbook.outputList', {
    workbookId: WORKBOOK_ID
  })
  const members = useHostQuery('company.members')
  const memories = useHostQuery('memories.list')

  const notify = useHostMutation('workbook.sendMessage')
  const remember = useHostMutation('memories.create')

  const owners = Object.fromEntries(
    (members.data ?? []).map((member) => [member.userId, member.name])
  )

  const rows = (report.data?.rows ?? []).map(withVariance)
  const breaches = rows.filter(
    (row) => Math.abs(row.variancePct) >= row.threshold
  )
  const shown = onlyBreaches ? breaches : rows

  const actuals = rows.reduce((sum, row) => sum + row.actual, 0)
  const ties = report.data ? actuals === report.data.controlTotal : null

  const memoryFor = (row) =>
    (memories.data ?? []).find((entry) => entry.title.startsWith(row.department))

  const onNotify = async (row) => {
    setNote('')

    try {
      await notify.mutate({
        workbookId: WORKBOOK_ID,
        message: `${row.department} is ${row.variancePct.toFixed(1)}% against budget for ${report.data.period} (${money.format(row.variance)}). Ask ${owners[row.owner] ?? 'the owner'} for an explanation.`
      })
      setNote(`Sent to ${owners[row.owner] ?? 'the owner'}.`)
    } catch (error) {
      setNote(error.message)
    }
  }

  const onExplain = async (row, content) => {
    setNote('')

    try {
      await remember.mutate({
        title: `${row.department} — ${report.data.period}`,
        content
      })
      setNote(`Saved. Next month's report will carry it forward.`)
    } catch (error) {
      setNote(error.message)
    }
  }

  if (report.isLoading) {
    return (
      <main style={styles.page}>
        <p style={styles.muted}>Reading the host cache…</p>
      </main>
    )
  }

  if (report.error) {
    return (
      <main style={styles.page}>
        <p style={{ ...styles.muted, color: '#b42318' }}>
          {report.error.message}
        </p>
      </main>
    )
  }

  return (
    <main style={styles.page}>
      <div style={styles.head}>
        <h1 style={{ fontSize: 16, margin: 0 }}>Budget vs actual</h1>
        <p style={styles.muted}>
          {report.data.period} · as of {report.data.asOf} · {breaches.length} of{' '}
          {rows.length} past tolerance
        </p>
        <button
          style={styles.toggle}
          type="button"
          onClick={() => setOnlyBreaches((value) => !value)}
        >
          {onlyBreaches ? 'Show all' : 'Only exceptions'}
        </button>
      </div>

      <div
        style={{
          ...styles.tie,
          ...(ties
            ? { background: '#ecfdf3', color: '#027a48' }
            : { background: '#fef3f2', color: '#b42318' })
        }}
      >
        <Check size={14} />
        <span>
          {money.format(actuals)} in actuals —{' '}
          {ties
            ? `ties to ${report.data.source}`
            : `does not tie to ${report.data.source} (${money.format(report.data.controlTotal)})`}
        </span>
      </div>

      {shown.map((row) => (
        <Department
          key={row.id}
          row={row}
          owner={owners[row.owner]}
          memory={memoryFor(row)}
          onNotify={onNotify}
          onExplain={onExplain}
          busy={notify.isPending || remember.isPending}
        />
      ))}

      <p style={{ ...styles.muted, minHeight: 18 }}>
        {notify.isPending || remember.isPending ? 'Working…' : note}
      </p>
    </main>
  )
}

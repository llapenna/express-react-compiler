import { useMemo, useState } from 'react'
import { AlertTriangle, Check, RefreshCw, Send } from 'lucide-react'

import { useHostConnected, useHostMutation, useHostQuery } from 'host'

/**
 * A generated app that reads the surrounding app's cache instead of holding
 * its own data.
 *
 * Three things here are the point, and none of them are the table:
 *
 * 1. No URL, no token, no fetch. `connect-src` is `'none'` in this document —
 *    the only data that reaches it came through the host.
 * 2. The tie-out is visible. Everyone interviewed audits by matching a total
 *    to the system of record by hand; the component does it on every render
 *    and says so.
 * 3. The action runs through the host. `useHostMutation` cannot name an
 *    endpoint — it names a write the host chose to wire up, and the host's
 *    resolver table is the whole of what a generated app may do.
 *
 * The workbook id would normally come from whatever prompt generated this app;
 * it is fixed here because the fixture has exactly one.
 */
const WORKBOOK_ID = 'wb_ar'

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
})

const TONE = {
  escalated: { background: '#fef3f2', color: '#b42318' },
  contacted: { background: '#fffaeb', color: '#b54708' },
  new: { background: '#f9fafb', color: '#475467' }
}

const styles = {
  page: { padding: 20, maxWidth: 780 },
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
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    textAlign: 'left',
    padding: '8px 10px',
    borderBottom: '1px solid #eaecf0',
    color: '#667085',
    fontWeight: 500
  },
  td: { padding: '10px', borderBottom: '1px solid #f2f4f7' },
  right: { textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  pill: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 11,
    textTransform: 'capitalize'
  },
  button: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 10px',
    borderRadius: 6,
    border: '1px solid #d0d5dd',
    background: '#fff',
    font: 'inherit',
    fontSize: 12,
    cursor: 'pointer'
  },
  note: { marginTop: 14, fontSize: 12, color: '#667085', minHeight: 18 }
}

export default function CollectionsCockpit() {
  const connected = useHostConnected()
  const [note, setNote] = useState('')

  const aging = useHostQuery('workbook.outputList', { workbookId: WORKBOOK_ID })
  const members = useHostQuery('company.members')
  const sources = useHostQuery('credential.list')

  const followUp = useHostMutation('workbook.sendMessage')

  const owners = useMemo(
    () =>
      Object.fromEntries(
        (members.data ?? []).map((member) => [member.userId, member.name])
      ),
    [members.data]
  )

  const rows = aging.data?.rows ?? []
  const total = rows.reduce((sum, row) => sum + row.amount, 0)
  // The ritual every interview described, done once per render instead of once
  // per person in a spreadsheet.
  const ties = aging.data ? total === aging.data.controlTotal : null

  const source = (sources.data ?? []).find(
    (entry) => entry.provider === 'netsuite'
  )

  const draft = async (row) => {
    setNote('')

    try {
      await followUp.mutate({
        workbookId: WORKBOOK_ID,
        message: `Draft a collections follow-up to ${row.customer} for ${money.format(row.amount)}, ${row.daysLate} days past due.`
      })
      setNote(`Follow-up queued for ${row.customer}.`)
    } catch (error) {
      setNote(error.message)
    }
  }

  if (connected === false) {
    return (
      <main style={styles.page}>
        <h1 style={{ fontSize: 16, margin: 0 }}>Collections</h1>
        <p style={styles.muted}>
          This document is open on its own, so there is no cache to read. Embed
          it in the app to see live data.
        </p>
      </main>
    )
  }

  if (aging.isLoading) {
    return (
      <main style={styles.page}>
        <p style={styles.muted}>Reading the host cache…</p>
      </main>
    )
  }

  if (aging.error) {
    return (
      <main style={styles.page}>
        <p style={{ ...styles.muted, color: '#b42318' }}>{aging.error.message}</p>
      </main>
    )
  }

  return (
    <main style={styles.page}>
      <div style={styles.head}>
        <h1 style={{ fontSize: 16, margin: 0 }}>Collections</h1>
        <p style={styles.muted}>
          {rows.length} open invoices · as of {aging.data.asOf}
          {source ? ` · ${source.label}` : ''}
        </p>
        {aging.isFetching && (
          <RefreshCw size={12} color="#667085" style={{ marginLeft: 'auto' }} />
        )}
      </div>

      <div
        style={{
          ...styles.tie,
          ...(ties
            ? { background: '#ecfdf3', color: '#027a48' }
            : { background: '#fef3f2', color: '#b42318' })
        }}
      >
        {ties ? <Check size={14} /> : <AlertTriangle size={14} />}
        <span>
          {money.format(total)} —{' '}
          {ties
            ? `ties to ${aging.data.source}`
            : `does not tie to ${aging.data.source} (${money.format(aging.data.controlTotal)})`}
        </span>
      </div>

      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Customer</th>
            <th style={{ ...styles.th, ...styles.right }}>Balance</th>
            <th style={{ ...styles.th, ...styles.right }}>Days late</th>
            <th style={styles.th}>Owner</th>
            <th style={styles.th}>Status</th>
            <th style={styles.th} />
          </tr>
        </thead>
        <tbody>
          {[...rows]
            .sort((a, b) => b.daysLate * b.amount - a.daysLate * a.amount)
            .map((row) => (
              <tr key={row.id}>
                <td style={styles.td}>{row.customer}</td>
                <td style={{ ...styles.td, ...styles.right }}>
                  {money.format(row.amount)}
                </td>
                <td style={{ ...styles.td, ...styles.right }}>{row.daysLate}</td>
                <td style={styles.td}>{owners[row.owner] ?? '—'}</td>
                <td style={styles.td}>
                  <span style={{ ...styles.pill, ...TONE[row.status] }}>
                    {row.status}
                  </span>
                </td>
                <td style={{ ...styles.td, ...styles.right }}>
                  <button
                    style={styles.button}
                    type="button"
                    disabled={followUp.isPending}
                    onClick={() => draft(row)}
                  >
                    <Send size={12} />
                    Follow up
                  </button>
                </td>
              </tr>
            ))}
        </tbody>
      </table>

      <p style={styles.note}>
        {followUp.isPending ? 'Sending…' : note}
      </p>
    </main>
  )
}

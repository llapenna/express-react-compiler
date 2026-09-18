import { useState } from 'react'
import { CircleCheck, CircleDashed, Clock, Plus } from 'lucide-react'

import { useHostMutation, useHostQuery } from 'host'

/**
 * A read-write mini-app: the customer built this for herself in Netlify
 * because nothing upstream holds it.
 *
 * That is the point worth noticing here. Every other generated app reads
 * something the ERP already knows; a payment plan is an agreement, and the
 * check-offs against it exist nowhere but in whoever is tracking them. So this
 * one reads and writes `appState`, and how well it works is a question about
 * whether that store exists, not about the UI.
 *
 * `data-as-of` is shown rather than implied. The plan rows are this app's own
 * and are always current; the balances they are reconciled against are only as
 * fresh as the last sync, and conflating the two is how a tracker starts
 * lying.
 */
const KEY = 'payment-plans'

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
})

const ICON = {
  paid: { Glyph: CircleCheck, color: '#12b76a' },
  due: { Glyph: Clock, color: '#b54708' },
  scheduled: { Glyph: CircleDashed, color: '#98a2b3' }
}

const styles = {
  page: { padding: 20, maxWidth: 780 },
  muted: { color: '#667085', fontSize: 12, margin: 0 },
  card: {
    marginTop: 12,
    padding: 14,
    borderRadius: 10,
    border: '1px solid #eaecf0'
  },
  cardHead: { display: 'flex', alignItems: 'baseline', gap: 8 },
  bar: {
    height: 6,
    borderRadius: 999,
    background: '#f2f4f7',
    margin: '10px 0 4px',
    overflow: 'hidden'
  },
  fill: { height: '100%', background: '#12b76a' },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '7px 0',
    borderTop: '1px solid #f2f4f7',
    fontSize: 13
  },
  amount: {
    marginLeft: 'auto',
    fontVariantNumeric: 'tabular-nums',
    color: '#475467'
  },
  check: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 9px',
    borderRadius: 6,
    border: '1px solid #d0d5dd',
    background: '#fff',
    font: 'inherit',
    fontSize: 12,
    cursor: 'pointer'
  },
  form: {
    display: 'flex',
    gap: 8,
    marginTop: 16,
    padding: 12,
    borderRadius: 10,
    background: '#f9fafb',
    border: '1px solid #eaecf0'
  },
  input: {
    padding: '7px 9px',
    borderRadius: 6,
    border: '1px solid #d0d5dd',
    font: 'inherit',
    fontSize: 13,
    minWidth: 0
  }
}

/** Instalments are equal and monthly; the real thing would let you set dates. */
const planFrom = (customer, total, count) => {
  const each = Math.round(total / count)
  const start = new Date()

  return {
    id: 'pp_' + Date.now(),
    customer,
    owner: null,
    total,
    agreedOn: start.toISOString().slice(0, 10),
    installments: Array.from({ length: count }, (_, index) => {
      const due = new Date(start)
      due.setMonth(due.getMonth() + index + 1)

      return {
        id: 'i' + (index + 1),
        dueDate: due.toISOString().slice(0, 10),
        // The last instalment absorbs the rounding, so the parts sum to the whole.
        amount: index === count - 1 ? total - each * (count - 1) : each,
        status: 'scheduled'
      }
    })
  }
}

export default function PaymentPlanTracker() {
  const plans = useHostQuery('appState.get', { key: KEY })
  const members = useHostQuery('company.members')
  const sources = useHostQuery('credential.list')
  const save = useHostMutation('appState.set')

  const [draft, setDraft] = useState({ customer: '', total: '', count: '3' })

  const owners = Object.fromEntries(
    (members.data ?? []).map((member) => [member.userId, member.name])
  )

  const rows = plans.data ?? []
  const outstanding = rows.reduce(
    (sum, plan) =>
      sum +
      plan.installments
        .filter((instalment) => instalment.status !== 'paid')
        .reduce((total, instalment) => total + instalment.amount, 0),
    0
  )

  // Write the whole document back. Fine at this size, and it keeps the frame
  // from having to know anything about how the store merges.
  const write = (next) => save.mutate({ key: KEY, value: next })

  const markPaid = (planId, instalmentId) =>
    write(
      rows.map((plan) =>
        plan.id !== planId
          ? plan
          : {
              ...plan,
              installments: plan.installments.map((instalment) =>
                instalment.id === instalmentId
                  ? { ...instalment, status: 'paid' }
                  : instalment
              )
            }
      )
    )

  const add = (event) => {
    event.preventDefault()

    const total = Number(draft.total)
    const count = Number(draft.count)

    if (!draft.customer.trim() || !total || !count) return

    write([...rows, planFrom(draft.customer.trim(), total, count)])
    setDraft({ customer: '', total: '', count: '3' })
  }

  if (plans.isLoading) {
    return (
      <main style={styles.page}>
        <p style={styles.muted}>Loading plans…</p>
      </main>
    )
  }

  const synced = (sources.data ?? [])[0]?.lastSyncedAt

  return (
    <main style={styles.page}>
      <h1 style={{ fontSize: 16, margin: 0 }}>Payment plans</h1>
      <p style={styles.muted}>
        {rows.length} plans · {money.format(outstanding)} outstanding
        {/* Two different freshnesses, said out loud rather than blurred. */}
        {' · plan data live'}
        {synced ? ` · balances as of ${synced.slice(0, 10)}` : ''}
        {save.isPending ? ' · saving…' : ''}
      </p>

      {rows.map((plan) => {
        const paid = plan.installments
          .filter((instalment) => instalment.status === 'paid')
          .reduce((total, instalment) => total + instalment.amount, 0)

        return (
          <section key={plan.id} style={styles.card}>
            <div style={styles.cardHead}>
              <strong style={{ fontSize: 14 }}>{plan.customer}</strong>
              <span style={styles.muted}>
                {owners[plan.owner] ?? 'unassigned'} · agreed {plan.agreedOn}
              </span>
              <span style={{ ...styles.muted, marginLeft: 'auto' }}>
                {money.format(paid)} of {money.format(plan.total)}
              </span>
            </div>

            <div style={styles.bar}>
              <div
                style={{
                  ...styles.fill,
                  width: `${Math.round((paid / plan.total) * 100)}%`
                }}
              />
            </div>

            {plan.installments.map((instalment) => {
              const { Glyph, color } = ICON[instalment.status]

              return (
                <div key={instalment.id} style={styles.row}>
                  <Glyph size={15} color={color} />
                  <span>{instalment.dueDate}</span>
                  <span style={styles.amount}>
                    {money.format(instalment.amount)}
                  </span>
                  {instalment.status === 'paid' ? (
                    <span style={{ ...styles.muted, width: 92, textAlign: 'right' }}>
                      paid
                    </span>
                  ) : (
                    <button
                      style={{ ...styles.check, width: 92 }}
                      type="button"
                      disabled={save.isPending}
                      onClick={() => markPaid(plan.id, instalment.id)}
                    >
                      Mark paid
                    </button>
                  )}
                </div>
              )
            })}
          </section>
        )
      })}

      {/* Data entry is the feature, not a nicety: this is the half that made
          someone build the app themselves. */}
      <form style={styles.form} onSubmit={add}>
        <input
          style={{ ...styles.input, flex: 2 }}
          placeholder="Customer"
          value={draft.customer}
          onChange={(event) =>
            setDraft({ ...draft, customer: event.target.value })
          }
        />
        <input
          style={{ ...styles.input, flex: 1 }}
          placeholder="Total"
          inputMode="numeric"
          value={draft.total}
          onChange={(event) => setDraft({ ...draft, total: event.target.value })}
        />
        <input
          style={{ ...styles.input, width: 90 }}
          placeholder="Months"
          inputMode="numeric"
          value={draft.count}
          onChange={(event) => setDraft({ ...draft, count: event.target.value })}
        />
        <button style={styles.check} type="submit" disabled={save.isPending}>
          <Plus size={13} />
          Add plan
        </button>
      </form>

      {save.error && (
        <p style={{ ...styles.muted, color: '#b42318' }}>{save.error.message}</p>
      )}
    </main>
  )
}

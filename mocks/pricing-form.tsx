import { useMemo, useState } from 'react'

/** TypeScript payload — the syntax is stripped before bundling. */
interface Plan {
  id: string
  name: string
  monthly: number
  seatsIncluded: number
}

const PLANS: Plan[] = [
  { id: 'starter', name: 'Starter', monthly: 29, seatsIncluded: 3 },
  { id: 'team', name: 'Team', monthly: 79, seatsIncluded: 10 },
  { id: 'scale', name: 'Scale', monthly: 199, seatsIncluded: 40 }
]

const EXTRA_SEAT = 12
const ANNUAL_DISCOUNT = 0.2

type Cadence = 'monthly' | 'annual'

const currency = (value: number): string =>
  value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  })

const styles: Record<string, React.CSSProperties> = {
  page: { padding: 24, maxWidth: 520 },
  plans: { display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr 1fr' },
  field: { display: 'block', marginTop: 20, fontSize: 12, color: '#667085' },
  input: {
    display: 'block',
    width: '100%',
    marginTop: 6,
    padding: '8px 10px',
    borderRadius: 6,
    border: '1px solid #d0d5dd',
    font: 'inherit',
    boxSizing: 'border-box'
  },
  toggle: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 20 },
  total: {
    marginTop: 24,
    padding: 16,
    borderRadius: 8,
    background: '#f9fafb',
    border: '1px solid #eaecf0'
  },
  line: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '4px 0',
    fontSize: 13
  },
  error: { color: '#b42318', fontSize: 12, marginTop: 6 }
}

const planCard = (active: boolean): React.CSSProperties => ({
  padding: 12,
  borderRadius: 8,
  textAlign: 'left',
  cursor: 'pointer',
  font: 'inherit',
  background: active ? '#eef4ff' : '#fff',
  border: `1px solid ${active ? '#3538cd' : '#d0d5dd'}`
})

export default function PricingForm() {
  const [planId, setPlanId] = useState<string>('team')
  const [seats, setSeats] = useState<string>('12')
  const [cadence, setCadence] = useState<Cadence>('annual')

  const plan = PLANS.find((candidate) => candidate.id === planId) as Plan
  const parsedSeats = Number.parseInt(seats, 10)
  const seatsValid = Number.isInteger(parsedSeats) && parsedSeats > 0

  const quote = useMemo(() => {
    const count = seatsValid ? parsedSeats : plan.seatsIncluded
    const extras = Math.max(0, count - plan.seatsIncluded)
    const base = plan.monthly + extras * EXTRA_SEAT
    const months = cadence === 'annual' ? 12 : 1
    const discount = cadence === 'annual' ? base * months * ANNUAL_DISCOUNT : 0

    return { extras, base, months, discount, total: base * months - discount }
  }, [plan, parsedSeats, seatsValid, cadence])

  return (
    <main style={styles.page}>
      <h1 style={{ fontSize: 18, margin: 0 }}>Estimate</h1>

      <div style={{ ...styles.plans, marginTop: 16 }}>
        {PLANS.map((candidate) => (
          <button
            key={candidate.id}
            style={planCard(candidate.id === planId)}
            onClick={() => setPlanId(candidate.id)}
          >
            <strong style={{ display: 'block' }}>{candidate.name}</strong>
            <span style={{ fontSize: 12, color: '#667085' }}>
              {currency(candidate.monthly)}/mo · {candidate.seatsIncluded} seats
            </span>
          </button>
        ))}
      </div>

      <label style={styles.field}>
        Seats
        <input
          style={styles.input}
          value={seats}
          inputMode="numeric"
          onChange={(event) => setSeats(event.target.value)}
        />
      </label>
      {!seatsValid && (
        <p style={styles.error}>Enter a whole number of seats above zero.</p>
      )}

      <div style={styles.toggle}>
        <input
          id="annual"
          type="checkbox"
          checked={cadence === 'annual'}
          onChange={(event) =>
            setCadence(event.target.checked ? 'annual' : 'monthly')
          }
        />
        <label htmlFor="annual" style={{ fontSize: 13 }}>
          Pay annually — save {ANNUAL_DISCOUNT * 100}%
        </label>
      </div>

      <section style={styles.total}>
        <div style={styles.line}>
          <span>{plan.name} base</span>
          <span>{currency(plan.monthly)}/mo</span>
        </div>
        <div style={styles.line}>
          <span>
            {quote.extras} extra {quote.extras === 1 ? 'seat' : 'seats'}
          </span>
          <span>{currency(quote.extras * EXTRA_SEAT)}/mo</span>
        </div>
        {quote.discount > 0 && (
          <div style={{ ...styles.line, color: '#067647' }}>
            <span>Annual discount</span>
            <span>−{currency(quote.discount)}</span>
          </div>
        )}
        <div
          style={{
            ...styles.line,
            fontWeight: 600,
            fontSize: 15,
            borderTop: '1px solid #eaecf0',
            marginTop: 8,
            paddingTop: 10
          }}
        >
          <span>Due {cadence === 'annual' ? 'yearly' : 'monthly'}</span>
          <span>{currency(quote.total)}</span>
        </div>
      </section>
    </main>
  )
}

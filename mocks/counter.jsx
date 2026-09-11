import { useEffect, useState } from 'react'

const styles = {
  page: { padding: 24, maxWidth: 420 },
  row: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 16 },
  button: {
    padding: '8px 14px',
    borderRadius: 6,
    border: '1px solid #d0d5dd',
    background: '#fff',
    font: 'inherit',
    cursor: 'pointer'
  },
  value: { font: '600 32px/1 ui-monospace, Menlo, monospace', minWidth: 64 },
  hint: { color: '#667085', fontSize: 12, marginTop: 20 }
}

export default function Counter() {
  const [count, setCount] = useState(0)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    if (!running) return

    const id = setInterval(() => setCount((value) => value + 1), 500)

    return () => clearInterval(id)
  }, [running])

  return (
    <main style={styles.page}>
      <h1 style={{ fontSize: 18, margin: 0 }}>Counter</h1>

      <div style={styles.row}>
        <span style={styles.value}>{count}</span>
        <button style={styles.button} onClick={() => setCount(count - 1)}>
          −1
        </button>
        <button style={styles.button} onClick={() => setCount(count + 1)}>
          +1
        </button>
        <button style={styles.button} onClick={() => setRunning(!running)}>
          {running ? 'Pause' : 'Auto'}
        </button>
        <button style={styles.button} onClick={() => setCount(0)}>
          Reset
        </button>
      </div>

      <p style={styles.hint}>
        {count === 0
          ? 'At zero.'
          : `${Math.abs(count)} ${count > 0 ? 'up' : 'down'} from zero.`}
      </p>
    </main>
  )
}

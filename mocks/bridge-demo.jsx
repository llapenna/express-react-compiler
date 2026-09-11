import { useState } from 'react'

/**
 * Demonstrates the host bridge: the frame never holds a token and never names
 * a URL, it names an action the embedder published. Anything the embedder did
 * not register comes back as an error.
 */
const styles = {
  page: { padding: 24, maxWidth: 520 },
  form: { display: 'flex', gap: 8, marginTop: 16 },
  input: {
    flex: 1,
    padding: '8px 10px',
    borderRadius: 6,
    border: '1px solid #d0d5dd',
    font: 'inherit'
  },
  button: {
    padding: '8px 14px',
    borderRadius: 6,
    border: '1px solid #16181d',
    background: '#16181d',
    color: '#fff',
    font: 'inherit',
    cursor: 'pointer'
  },
  output: {
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    background: '#f9fafb',
    border: '1px solid #eaecf0',
    font: '12px/1.6 ui-monospace, Menlo, monospace',
    whiteSpace: 'pre-wrap'
  }
}

export default function BridgeDemo() {
  const [query, setQuery] = useState('acme')
  const [state, setState] = useState({ status: 'idle' })

  const run = async (event) => {
    event.preventDefault()
    setState({ status: 'loading' })

    if (!window.host) {
      return setState({
        status: 'error',
        detail: 'No host bridge — this document is not embedded.'
      })
    }

    try {
      const result = await window.host.call('searchCompanies', { query })
      setState({ status: 'done', detail: JSON.stringify(result, null, 2) })
    } catch (error) {
      setState({ status: 'error', detail: error.message })
    }
  }

  return (
    <main style={styles.page}>
      <h1 style={{ fontSize: 18, margin: 0 }}>Host actions</h1>
      <p style={{ color: '#667085', fontSize: 13 }}>
        Calls <code>host.call('searchCompanies')</code> on the embedder.
      </p>

      <form style={styles.form} onSubmit={run}>
        <input
          style={styles.input}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button style={styles.button} type="submit">
          {state.status === 'loading' ? 'Calling…' : 'Call host'}
        </button>
      </form>

      {state.status !== 'idle' && (
        <pre
          style={{
            ...styles.output,
            color: state.status === 'error' ? '#b42318' : '#16181d'
          }}
        >
          {state.detail ?? 'Waiting for the host…'}
        </pre>
      )}
    </main>
  )
}

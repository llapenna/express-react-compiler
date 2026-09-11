/**
 * The CDN path: `plotly.js` is not in the bundle.
 *
 * The import is rewritten to read the global that the pinned CDN script
 * defines, so the document carries React and this component — a few KB — while
 * the ~1 MB library is fetched once and served from the browser cache for
 * every generated app after the first.
 *
 * Plotly can be externalised precisely because it is not a React library. A
 * hook-calling library loaded this way would end up with its own React and
 * fail on the first render.
 */
import Plotly from 'plotly.js'
import { useEffect, useMemo, useRef, useState } from 'react'

const MODES = [
  { id: 'scatter', label: 'Scatter' },
  { id: 'bars', label: 'Bars' },
  { id: 'contour', label: 'Surface' }
]

const styles = {
  page: { padding: 24, maxWidth: 760 },
  controls: { display: 'flex', gap: 8, alignItems: 'center', margin: '16px 0' },
  button: {
    font: 'inherit',
    padding: '6px 12px',
    borderRadius: 6,
    border: '1px solid #d0d5dd',
    background: '#fff',
    cursor: 'pointer'
  },
  active: { background: '#16181d', borderColor: '#16181d', color: '#fff' },
  slider: { marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' },
  plot: { width: '100%', height: 380 },
  note: { color: '#667085', fontSize: 12, marginTop: 12 }
}

/** Deterministic, so a redraw with the same inputs produces the same picture. */
const noise = (seed) => {
  let value = seed

  return () => {
    value = (value * 1103515245 + 12345) % 2147483648

    return value / 2147483648
  }
}

const buildData = (mode, points) => {
  const random = noise(42)
  const x = Array.from({ length: points }, (_, index) => index)

  if (mode === 'bars') {
    return [
      {
        type: 'bar',
        x: MODES.map((entry) => entry.label),
        y: [18, 42, 31],
        marker: { color: ['#3538cd', '#6172f3', '#8098f9'] }
      }
    ]
  }

  if (mode === 'contour') {
    return [
      {
        type: 'contour',
        z: Array.from({ length: 20 }, (_, row) =>
          Array.from(
            { length: 20 },
            (_, column) => Math.sin(row / 3) * Math.cos(column / 4) + random() / 4
          )
        ),
        colorscale: 'Blues',
        showscale: false
      }
    ]
  }

  return [
    {
      type: 'scatter',
      mode: 'markers',
      x,
      y: x.map((value) => Math.sin(value / 6) * 10 + random() * 4),
      marker: { size: 8, color: '#3538cd', opacity: 0.75 }
    }
  ]
}

export default function PlotlyExplorer() {
  const node = useRef(null)
  const [mode, setMode] = useState('scatter')
  const [points, setPoints] = useState(60)

  const data = useMemo(() => buildData(mode, points), [mode, points])

  useEffect(() => {
    const element = node.current
    if (!element) return

    Plotly.react(element, data, {
      margin: { t: 16, r: 16, b: 40, l: 40 },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      font: { family: 'ui-sans-serif, system-ui, sans-serif', size: 12 },
      xaxis: { gridcolor: '#eaecf0' },
      yaxis: { gridcolor: '#eaecf0' }
    }, {
      displaylogo: false,
      // Saving an image is a download, and the sandbox has no allow-downloads,
      // so the button would silently do nothing. Better not to offer it.
      modeBarButtonsToRemove: ['toImage'],
      responsive: true
    })

    return () => Plotly.purge(element)
  }, [data])

  return (
    <main style={styles.page}>
      <h1 style={{ fontSize: 18, margin: 0 }}>Signal explorer</h1>

      <div style={styles.controls}>
        {MODES.map((entry) => (
          <button
            key={entry.id}
            style={{
              ...styles.button,
              ...(mode === entry.id ? styles.active : null)
            }}
            onClick={() => setMode(entry.id)}
          >
            {entry.label}
          </button>
        ))}

        <label style={styles.slider}>
          <span style={{ fontSize: 12, color: '#667085' }}>{points} points</span>
          <input
            type="range"
            min="20"
            max="200"
            step="20"
            value={points}
            disabled={mode !== 'scatter'}
            onChange={(event) => setPoints(Number(event.target.value))}
          />
        </label>
      </div>

      <div ref={node} style={styles.plot} />

      <p style={styles.note}>
        plotly.js is loaded from a version-pinned CDN URL named in this
        document&apos;s <code>script-src</code>, with an integrity hash.
      </p>
    </main>
  )
}

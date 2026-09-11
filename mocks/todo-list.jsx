import { useMemo, useReducer, useState } from 'react'

const initial = [
  { id: 1, label: 'Compile the payload', done: true },
  { id: 2, label: 'Inject the document', done: false },
  { id: 3, label: 'Size the frame', done: false }
]

const reducer = (todos, action) => {
  switch (action.type) {
    case 'add':
      return [...todos, { id: Date.now(), label: action.label, done: false }]
    case 'toggle':
      return todos.map((todo) =>
        todo.id === action.id ? { ...todo, done: !todo.done } : todo
      )
    case 'remove':
      return todos.filter((todo) => todo.id !== action.id)
    case 'clear':
      return todos.filter((todo) => !todo.done)
    default:
      return todos
  }
}

const FILTERS = ['all', 'open', 'done']

const styles = {
  page: { padding: 24, maxWidth: 480 },
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
    border: '1px solid #d0d5dd',
    background: '#fff',
    font: 'inherit',
    cursor: 'pointer'
  },
  filters: { display: 'flex', gap: 6, marginTop: 16 },
  list: { listStyle: 'none', padding: 0, margin: '16px 0 0' },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 0',
    borderBottom: '1px solid #eaecf0'
  },
  remove: {
    marginLeft: 'auto',
    border: 0,
    background: 'none',
    color: '#98a2b3',
    cursor: 'pointer',
    font: 'inherit'
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
    color: '#667085',
    fontSize: 12
  }
}

const chip = (active) => ({
  ...styles.button,
  padding: '4px 10px',
  fontSize: 12,
  background: active ? '#16181d' : '#fff',
  color: active ? '#fff' : '#16181d',
  borderColor: active ? '#16181d' : '#d0d5dd'
})

export default function TodoList() {
  const [todos, dispatch] = useReducer(reducer, initial)
  const [draft, setDraft] = useState('')
  const [filter, setFilter] = useState('all')

  const visible = useMemo(
    () =>
      todos.filter((todo) =>
        filter === 'all' ? true : filter === 'done' ? todo.done : !todo.done
      ),
    [todos, filter]
  )

  const remaining = todos.filter((todo) => !todo.done).length

  const submit = (event) => {
    event.preventDefault()
    const label = draft.trim()
    if (!label) return

    dispatch({ type: 'add', label })
    setDraft('')
  }

  return (
    <main style={styles.page}>
      <h1 style={{ fontSize: 18, margin: 0 }}>Tasks</h1>

      <form style={styles.form} onSubmit={submit}>
        <input
          style={styles.input}
          value={draft}
          placeholder="Add a task…"
          onChange={(event) => setDraft(event.target.value)}
        />
        <button style={styles.button} type="submit">
          Add
        </button>
      </form>

      <div style={styles.filters}>
        {FILTERS.map((option) => (
          <button
            key={option}
            style={chip(option === filter)}
            onClick={() => setFilter(option)}
          >
            {option}
          </button>
        ))}
      </div>

      <ul style={styles.list}>
        {visible.map((todo) => (
          <li key={todo.id} style={styles.item}>
            <input
              type="checkbox"
              checked={todo.done}
              onChange={() => dispatch({ type: 'toggle', id: todo.id })}
            />
            <span
              style={{
                textDecoration: todo.done ? 'line-through' : 'none',
                color: todo.done ? '#98a2b3' : 'inherit'
              }}
            >
              {todo.label}
            </span>
            <button
              style={styles.remove}
              onClick={() => dispatch({ type: 'remove', id: todo.id })}
            >
              ✕
            </button>
          </li>
        ))}
        {visible.length === 0 && (
          <li style={{ ...styles.item, color: '#98a2b3' }}>Nothing here.</li>
        )}
      </ul>

      <div style={styles.footer}>
        <span>{remaining} remaining</span>
        <button
          style={{ ...styles.button, padding: '4px 10px', fontSize: 12 }}
          onClick={() => dispatch({ type: 'clear' })}
        >
          Clear completed
        </button>
      </div>
    </main>
  )
}

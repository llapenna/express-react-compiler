import { useEffect, useMemo, useRef, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import * as Tabs from '@radix-ui/react-tabs'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Ban,
  Check,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  Clock,
  GripVertical,
  Info,
  Loader,
  Plug,
  RefreshCw,
  Send,
  TrendingUp
} from 'lucide-react'
import Plotly from 'plotly.js'

import { useHostMutation, useHostQuery } from 'host'

/**
 * The heaviest app the compiler currently allows: every bundled library at
 * once (Radix tabs and popover, dnd-kit, sixteen lucide icons), a CDN library
 * on top, six host resources and two writes.
 *
 * It exists to find where the document size actually bites, so it is
 * deliberately not factored down — four real views rather than one view shown
 * four ways. What it demonstrates about size is in the README; what it
 * demonstrates about the bridge is that a single app can hold six independent
 * reads without any of them blocking the others.
 */
const CHECKLIST = 'close-checklist'

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
})

const STATUS = {
  done: { Glyph: CircleCheck, color: '#12b76a', label: 'Done' },
  'in-progress': { Glyph: Loader, color: '#475467', label: 'In progress' },
  blocked: { Glyph: Ban, color: '#b42318', label: 'Blocked' },
  todo: { Glyph: CircleDashed, color: '#98a2b3', label: 'To do' }
}

const NEXT = { todo: 'in-progress', 'in-progress': 'done', done: 'todo', blocked: 'todo' }

const styles = {
  page: { padding: 18, maxWidth: 860 },
  head: { display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 },
  muted: { color: '#667085', fontSize: 12, margin: 0 },
  list: { display: 'flex', gap: 4, borderBottom: '1px solid #eaecf0', marginBottom: 14 },
  trigger: {
    padding: '7px 12px',
    border: 'none',
    borderBottom: '2px solid transparent',
    background: 'none',
    font: 'inherit',
    fontSize: 13,
    color: '#667085',
    cursor: 'pointer'
  },
  active: { color: '#16181d', borderBottomColor: '#16181d', fontWeight: 500 },
  banner: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    margin: '0 0 14px',
    padding: '8px 12px',
    borderRadius: 8,
    fontSize: 13
  },
  task: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '9px 12px',
    marginBottom: 6,
    borderRadius: 8,
    border: '1px solid #eaecf0',
    background: '#fff',
    fontSize: 13
  },
  grip: { cursor: 'grab', color: '#98a2b3', display: 'flex', touchAction: 'none' },
  day: {
    marginLeft: 'auto',
    fontSize: 11,
    color: '#667085',
    fontVariantNumeric: 'tabular-nums'
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '3px 9px',
    borderRadius: 999,
    border: '1px solid #eaecf0',
    background: '#fff',
    font: 'inherit',
    fontSize: 11,
    cursor: 'pointer',
    width: 108,
    justifyContent: 'center'
  },
  iconButton: {
    display: 'inline-flex',
    padding: 4,
    borderRadius: 5,
    border: '1px solid transparent',
    background: 'none',
    color: '#98a2b3',
    cursor: 'pointer'
  },
  panel: {
    padding: 12,
    borderRadius: 8,
    border: '1px solid #eaecf0',
    background: '#fff',
    boxShadow: '0 8px 24px rgba(16, 24, 40, 0.12)',
    fontSize: 12,
    maxWidth: 260
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    textAlign: 'left',
    padding: '8px 10px',
    borderBottom: '1px solid #eaecf0',
    color: '#667085',
    fontWeight: 500
  },
  td: { padding: '9px 10px', borderBottom: '1px solid #f2f4f7' },
  right: { textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  chart: { width: '100%', height: 320 },
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
  }
}

const since = (iso) => {
  if (!iso) return 'never'

  const hours = (Date.now() - new Date(iso)) / 3_600_000

  if (hours < 1) return 'just now'
  if (hours < 48) return `${Math.round(hours)}h ago`

  return `${Math.round(hours / 24)}d ago`
}

/** A tie-out banner, since three of the four tabs want one. */
function TieOut({ total, control, source }) {
  const ties = total === control

  return (
    <div
      style={{
        ...styles.banner,
        ...(ties
          ? { background: '#ecfdf3', color: '#027a48' }
          : { background: '#fef3f2', color: '#b42318' })
      }}
    >
      {ties ? <Check size={14} /> : <AlertTriangle size={14} />}
      <span>
        {money.format(total)} —{' '}
        {ties
          ? `ties to ${source}`
          : `does not tie to ${source} (${money.format(control)})`}
      </span>
    </div>
  )
}

function Task({ task, owner, onCycle }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id })
  const { Glyph, color, label } = STATUS[task.status]

  return (
    <div
      ref={setNodeRef}
      style={{
        ...styles.task,
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        borderColor: task.status === 'blocked' ? '#fecdc9' : '#eaecf0'
      }}
    >
      <span style={styles.grip} {...attributes} {...listeners}>
        <GripVertical size={15} />
      </span>

      <button type="button" style={styles.chip} onClick={() => onCycle(task)}>
        <Glyph size={12} color={color} />
        {label}
      </button>

      <span>{task.task}</span>

      {/* A portalled overlay is clipped by the iframe box, so it opens
          downward and the page is padded to leave room for it. */}
      <Popover.Root>
        <Popover.Trigger asChild>
          <button type="button" style={styles.iconButton} aria-label="Detail">
            <Info size={14} />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content side="bottom" align="start" sideOffset={6} style={styles.panel}>
            <strong>{task.task}</strong>
            <p style={{ ...styles.muted, marginTop: 6 }}>
              Owner: {owner ?? 'unassigned'}
              <br />
              Target: close day {task.day}
              <br />
              Status: {label}
            </p>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      <span style={styles.day}>day {task.day}</span>
      <span style={{ ...styles.muted, width: 96, textAlign: 'right' }}>
        {owner ?? '—'}
      </span>
    </div>
  )
}

function Checklist({ owners }) {
  const list = useHostQuery('appState.get', { key: CHECKLIST })
  const save = useHostMutation('appState.set')
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const tasks = list.data ?? []
  const write = (next) => save.mutate({ key: CHECKLIST, value: next })

  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return

    const from = tasks.findIndex((task) => task.id === active.id)
    const to = tasks.findIndex((task) => task.id === over.id)

    write(arrayMove(tasks, from, to))
  }

  const cycle = (task) =>
    write(
      tasks.map((entry) =>
        entry.id === task.id ? { ...entry, status: NEXT[entry.status] } : entry
      )
    )

  if (list.isLoading) return <p style={styles.muted}>Loading checklist…</p>

  const done = tasks.filter((task) => task.status === 'done').length
  const blocked = tasks.filter((task) => task.status === 'blocked')

  return (
    <div>
      <p style={{ ...styles.muted, marginBottom: 10 }}>
        {done} of {tasks.length} complete
        {blocked.length ? ` · ${blocked.length} blocked` : ''}
        {save.isPending ? ' · saving…' : ''}
      </p>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={tasks.map((task) => task.id)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.map((task) => (
            <Task
              key={task.id}
              task={task}
              owner={owners[task.owner]}
              onCycle={cycle}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  )
}

function Variance({ owners, onNotify, busy }) {
  const report = useHostQuery('workbook.outputList', { workbookId: 'wb_bva' })
  const memories = useHostQuery('memories.list')

  if (report.isLoading) return <p style={styles.muted}>Loading variance…</p>

  const rows = (report.data.rows ?? []).map((row) => ({
    ...row,
    variance: row.actual - row.budget,
    variancePct: ((row.actual - row.budget) / row.budget) * 100
  }))
  const actuals = rows.reduce((sum, row) => sum + row.actual, 0)

  return (
    <div>
      <TieOut
        total={actuals}
        control={report.data.controlTotal}
        source={report.data.source}
      />

      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Department</th>
            <th style={{ ...styles.th, ...styles.right }}>Budget</th>
            <th style={{ ...styles.th, ...styles.right }}>Actual</th>
            <th style={{ ...styles.th, ...styles.right }}>Variance</th>
            <th style={styles.th}>Owner</th>
            <th style={styles.th} />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const breach = Math.abs(row.variancePct) >= row.threshold
            const over = row.variance > 0
            const Arrow = over ? ArrowUpRight : ArrowDownRight
            const memory = (memories.data ?? []).find((entry) =>
              entry.title.startsWith(row.department)
            )

            return (
              <tr key={row.id}>
                <td style={styles.td}>
                  {row.department}
                  {memory && (
                    <span style={{ ...styles.muted, display: 'block' }}>
                      {memory.content}
                    </span>
                  )}
                </td>
                <td style={{ ...styles.td, ...styles.right }}>
                  {money.format(row.budget)}
                </td>
                <td style={{ ...styles.td, ...styles.right }}>
                  {money.format(row.actual)}
                </td>
                <td
                  style={{
                    ...styles.td,
                    ...styles.right,
                    color: breach ? (over ? '#b42318' : '#027a48') : '#667085',
                    fontWeight: breach ? 600 : 400
                  }}
                >
                  <Arrow size={12} /> {row.variancePct.toFixed(1)}%
                </td>
                <td style={styles.td}>{owners[row.owner] ?? '—'}</td>
                <td style={{ ...styles.td, ...styles.right }}>
                  {breach && (
                    <button
                      type="button"
                      style={styles.button}
                      disabled={busy}
                      onClick={() => onNotify(row, report.data.period)}
                    >
                      <Send size={12} />
                      Notify
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/**
 * The CDN library. It is loaded by a `<script>` tag above the bundle, so the
 * global exists by the time this runs — but the tab is unmounted until it is
 * opened, which is why the chart is drawn in an effect rather than at mount.
 */
function Trend() {
  const trend = useHostQuery('workbook.outputList', { workbookId: 'wb_trend' })
  const node = useRef(null)

  useEffect(() => {
    if (!trend.data || !node.current) return

    const shared = { x: trend.data.months, type: 'scatter', mode: 'lines+markers' }

    Plotly.react(
      node.current,
      [
        { ...shared, y: trend.data.budget, name: 'Budget', line: { color: '#98a2b3', dash: 'dot' } },
        { ...shared, y: trend.data.actual, name: 'Actual', line: { color: '#16181d' } }
      ],
      {
        margin: { t: 10, r: 10, b: 40, l: 56 },
        yaxis: { title: '$000', gridcolor: '#f2f4f7' },
        xaxis: { gridcolor: '#f2f4f7' },
        legend: { orientation: 'h', y: -0.2 },
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { family: 'ui-sans-serif, system-ui, sans-serif', size: 11 }
      },
      // Save-as-image does nothing without allow-downloads, so it is removed
      // rather than left as a button that silently fails.
      { displaylogo: false, responsive: true, modeBarButtonsToRemove: ['toImage'] }
    )
  }, [trend.data])

  if (trend.isLoading) return <p style={styles.muted}>Loading trend…</p>

  return (
    <div>
      <p style={{ ...styles.muted, marginBottom: 10 }}>
        <TrendingUp size={12} /> Twelve months, {trend.data.source}, as of{' '}
        {trend.data.asOf}
      </p>
      <div ref={node} style={styles.chart} />
    </div>
  )
}

function Sources() {
  const sources = useHostQuery('credential.list')
  const workflows = useHostQuery('workflow.list')

  if (sources.isLoading || workflows.isLoading) {
    return <p style={styles.muted}>Loading sources…</p>
  }

  return (
    <div>
      {sources.data.map((source) => (
        <div key={source.id} style={styles.row}>
          <Plug size={15} color="#475467" />
          <span>{source.label}</span>
          <span style={styles.muted}>{source.status}</span>
          <span style={{ marginLeft: 'auto', ...styles.muted }}>
            synced {since(source.lastSyncedAt)}
          </span>
        </div>
      ))}

      {workflows.data.map((workflow) => (
        <div key={workflow.id} style={styles.row}>
          <Clock size={15} color="#475467" />
          <span>{workflow.name}</span>
          <span style={styles.muted}>{workflow.schedule}</span>
        </div>
      ))}
    </div>
  )
}

const TABS = [
  { value: 'checklist', label: 'Checklist' },
  { value: 'variance', label: 'Variance' },
  { value: 'trend', label: 'Trend' },
  { value: 'sources', label: 'Sources' }
]

export default function CloseCockpit() {
  const [tab, setTab] = useState('checklist')
  const [note, setNote] = useState('')

  const members = useHostQuery('company.members')
  const notify = useHostMutation('workbook.sendMessage')

  const owners = useMemo(
    () =>
      Object.fromEntries(
        (members.data ?? []).map((member) => [member.userId, member.name])
      ),
    [members.data]
  )

  const onNotify = async (row, period) => {
    setNote('')

    try {
      await notify.mutate({
        workbookId: 'wb_bva',
        message: `${row.department} is ${row.variancePct.toFixed(1)}% against budget for ${period}.`
      })
      setNote(`Sent to ${owners[row.owner] ?? 'the owner'}.`)
    } catch (error) {
      setNote(error.message)
    }
  }

  return (
    <main style={styles.page}>
      <div style={styles.head}>
        <h1 style={{ fontSize: 16, margin: 0 }}>Month-end close</h1>
        <p style={styles.muted}>September 2026</p>
        {notify.isPending && (
          <RefreshCw size={12} color="#667085" style={{ marginLeft: 'auto' }} />
        )}
      </div>

      <Tabs.Root value={tab} onValueChange={setTab}>
        <Tabs.List style={styles.list}>
          {TABS.map((entry) => (
            <Tabs.Trigger
              key={entry.value}
              value={entry.value}
              style={{
                ...styles.trigger,
                ...(tab === entry.value ? styles.active : null)
              }}
            >
              {entry.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="checklist">
          <Checklist owners={owners} />
        </Tabs.Content>
        <Tabs.Content value="variance">
          <Variance
            owners={owners}
            onNotify={onNotify}
            busy={notify.isPending}
          />
        </Tabs.Content>
        <Tabs.Content value="trend">
          <Trend />
        </Tabs.Content>
        <Tabs.Content value="sources">
          <Sources />
        </Tabs.Content>
      </Tabs.Root>

      <p style={{ ...styles.muted, minHeight: 18, marginTop: 12 }}>
        {note || <CircleAlert size={0} />}
      </p>
    </main>
  )
}

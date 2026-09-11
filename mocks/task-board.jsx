/**
 * The bundled path: every library here is compiled into the document.
 *
 * dnd-kit, Radix and the icon set all call hooks, so they have to share
 * React's module graph — bundling is not a preference for them, it is the only
 * correct transport. The whole document stays self-contained and runs with no
 * network at all.
 */
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
import * as Popover from '@radix-ui/react-popover'
import { AlertTriangle, Check, GripVertical, Timer } from 'lucide-react'
import { useState } from 'react'

const INITIAL = [
  { id: 'a', title: 'Pin the library versions', owner: 'Ana', effort: 2, risk: 'low' },
  { id: 'b', title: 'Ship the compile route', owner: 'Bo', effort: 5, risk: 'high' },
  { id: 'c', title: 'Size the frame from the host', owner: 'Cass', effort: 3, risk: 'low' },
  { id: 'd', title: 'Audit the sandbox policy', owner: 'Dee', effort: 8, risk: 'medium' },
  { id: 'e', title: 'Write the payload contract', owner: 'Eli', effort: 1, risk: 'low' }
]

const RISK = {
  low: { color: '#067647', background: '#ecfdf3', icon: Check },
  medium: { color: '#b54708', background: '#fffaeb', icon: Timer },
  high: { color: '#b42318', background: '#fef3f2', icon: AlertTriangle }
}

const styles = {
  page: { padding: 24, maxWidth: 560 },
  header: { display: 'flex', alignItems: 'center', gap: 12 },
  hint: { color: '#667085', fontSize: 12, margin: '4px 0 16px' },
  list: { display: 'grid', gap: 8 },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid #eaecf0',
    background: '#fff'
  },
  handle: {
    display: 'flex',
    padding: 2,
    border: 0,
    background: 'none',
    color: '#98a2b3',
    cursor: 'grab',
    touchAction: 'none'
  },
  rank: {
    width: 20,
    color: '#98a2b3',
    font: '12px ui-monospace, Menlo, monospace'
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    marginLeft: 'auto',
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 11,
    textTransform: 'capitalize'
  },
  popoverButton: {
    marginLeft: 'auto',
    font: 'inherit',
    fontSize: 12,
    padding: '6px 12px',
    borderRadius: 6,
    border: '1px solid #d0d5dd',
    background: '#fff',
    cursor: 'pointer'
  },
  popover: {
    width: 250,
    padding: 14,
    borderRadius: 8,
    background: '#fff',
    border: '1px solid #eaecf0',
    boxShadow: '0 12px 32px rgba(16, 24, 40, 0.14)',
    fontSize: 13
  },
  stat: { display: 'flex', justifyContent: 'space-between', padding: '3px 0' }
}

const Row = ({ task, rank }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id })

  const risk = RISK[task.risk]
  const RiskIcon = risk.icon

  return (
    <div
      ref={setNodeRef}
      style={{
        ...styles.row,
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        boxShadow: isDragging ? '0 8px 24px rgba(16, 24, 40, 0.14)' : 'none'
      }}
    >
      <button style={styles.handle} {...attributes} {...listeners}>
        <GripVertical size={16} />
      </button>
      <span style={styles.rank}>{rank}</span>
      <div>
        <div>{task.title}</div>
        <div style={{ color: '#667085', fontSize: 12 }}>
          {task.owner} · {task.effort} pts
        </div>
      </div>
      <span
        style={{ ...styles.badge, color: risk.color, background: risk.background }}
      >
        <RiskIcon size={12} />
        {task.risk}
      </span>
    </div>
  )
}

export default function TaskBoard() {
  const [tasks, setTasks] = useState(INITIAL)

  // Pointer for the mouse, keyboard so the list is still reorderable without
  // one — both work at an opaque origin, neither needs a sandbox permission.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return

    setTasks((current) => {
      const from = current.findIndex((task) => task.id === active.id)
      const to = current.findIndex((task) => task.id === over.id)

      return arrayMove(current, from, to)
    })
  }

  const effort = tasks.reduce((sum, task) => sum + task.effort, 0)

  return (
    <main style={styles.page}>
      <div style={styles.header}>
        <h1 style={{ fontSize: 18, margin: 0 }}>Backlog order</h1>

        {/*
          Radix portals this into the frame's own body. It cannot float over
          the embedding page — an iframe clips its children — so an overlay
          near the bottom edge needs the frame to be tall enough to hold it.
        */}
        <Popover.Root>
          <Popover.Trigger style={styles.popoverButton}>Summary</Popover.Trigger>
          <Popover.Portal>
            <Popover.Content sideOffset={6} style={styles.popover}>
              <strong>This sprint</strong>
              <div style={{ marginTop: 8 }}>
                <div style={styles.stat}>
                  <span style={{ color: '#667085' }}>Items</span>
                  <span>{tasks.length}</span>
                </div>
                <div style={styles.stat}>
                  <span style={{ color: '#667085' }}>Effort</span>
                  <span>{effort} pts</span>
                </div>
                <div style={styles.stat}>
                  <span style={{ color: '#667085' }}>Top of list</span>
                  <span>{tasks[0].owner}</span>
                </div>
              </div>
              <Popover.Arrow fill="#fff" />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>

      <p style={styles.hint}>
        Drag a handle to reorder, or focus one and use space then the arrow keys.
      </p>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={tasks} strategy={verticalListSortingStrategy}>
          <div style={styles.list}>
            {tasks.map((task, index) => (
              <Row key={task.id} task={task} rank={index + 1} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </main>
  )
}

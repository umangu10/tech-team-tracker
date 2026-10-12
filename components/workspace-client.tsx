'use client'

import { useEffect, useState, useTransition } from 'react'
import type { DragEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  CalendarDays,
  Check,
  CircleDot,
  FolderKanban,
  FolderOpen,
  GitBranch,
  History,
  LayoutDashboard,
  Layers3,
  ListChecks,
  Menu,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Settings2,
  Tag,
  Trash2,
  TrendingUp,
  UserMinus,
  UserPlus,
  Users,
  X,
  Zap,
} from 'lucide-react'

import {
  addTaskComment,
  createSubtask,
  createTask,
  deleteSubtask,
  deleteTask,
  getTaskDetails,
  setSubtaskDone,
  updateTask,
} from '@/app/actions/tasks'
import { createEpic, deleteEpic, updateEpic } from '@/app/actions/epics'
import { completeSprint, createSprint, deleteSprint, startSprint } from '@/app/actions/sprints'
import { createProject, deleteProject, updateProject } from '@/app/actions/projects'
import {
  addMemberToTeam,
  createTeam,
  listAllUsers,
  removeMemberFromTeam,
  updateMemberRole,
} from '@/app/actions/teams'
import { authClient } from '@/lib/auth-client'
import type { Epic, Project, Sprint, Task, Team, TeamMember } from '@/lib/db/schema'
import {
  DEFAULT_AREA,
  DEFAULT_AVATAR_COLOR,
  DEFAULT_POINTS,
  EPIC_STATUSES,
  MAX_LABELS_PER_TASK,
  normalizeLabel,
  parseLabels,
  serializeLabels,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_TYPES,
} from '@/lib/constants'

type TaskWithProject = Task & { projectKey: string; projectName: string }

const AREAS = ['Engineering', 'DevOps', 'Security', 'IT']
const POINTS = ['0', '1', '2', '3', '5', '8']

function formatError(e: unknown): string {
  return e instanceof Error ? e.message : 'Failed to save changes'
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function formatDate(value?: Date | string | null): string {
  if (!value) return '—'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function toDateInputValue(value: Date | null): string {
  if (!value) return ''
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function statusRank(status: string): number {
  const idx = (TASK_STATUSES as readonly string[]).indexOf(status)
  return idx === -1 ? TASK_STATUSES.length : idx
}

/* ---------- Shared primitives ---------- */

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('')
}

function Avatar({
  name,
  color,
  size = 26,
}: {
  name: string
  color: string
  size?: number
}) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-medium text-white ring-1 ring-black/5 ${color}`}
      style={{ width: size, height: size, fontSize: Math.max(9, size * 0.38) }}
      title={name}
    >
      {initials(name)}
    </div>
  )
}

function Metric({ label, count }: { label: string; count: number }) {
  return (
    <div className="rounded-lg bg-zinc-50 px-3 py-2">
      <div className="text-lg font-semibold leading-tight tracking-tight text-zinc-900">{count}</div>
      <div className="mt-0.5 text-xs leading-tight text-zinc-500">{label}</div>
    </div>
  )
}

function Empty({
  icon,
  title,
  hint,
  action,
}: {
  icon: ReactNode
  title: string
  hint: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-zinc-200 bg-white px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-100 text-zinc-400">{icon}</div>
      <div className="max-w-xs">
        <div className="text-sm font-medium text-zinc-900">{title}</div>
        <div className="mt-1 text-sm leading-relaxed text-zinc-500">{hint}</div>
      </div>
      {action && (
        <button className={btnPrimary} onClick={action.onClick}>
          <Plus size={15} /> {action.label}
        </button>
      )}
    </div>
  )
}

/** Escape-to-close + background scroll lock for any overlay surface. */
function useDismiss(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])
}

/**
 * Right-side slide-over. Used for create/edit flows that need room to think:
 * wide column, sticky header and footer, scrollable body.
 */
function Drawer({
  title,
  description,
  onClose,
  children,
  footer,
  width = 'md',
}: {
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: 'md' | 'lg' | 'xl'
}) {
  useDismiss(onClose)
  const widths = { md: 'sm:max-w-xl', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' }
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <div className="animate-overlay-in absolute inset-0 bg-zinc-950/25 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={`animate-drawer-in relative flex h-full w-full flex-col bg-white shadow-2xl sm:w-full ${widths[width]}`}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-zinc-200 px-6 py-4">
          <div className="min-w-0">
            <h3 className="text-base font-semibold tracking-tight text-zinc-900">{title}</h3>
            {description && <p className="mt-0.5 text-sm text-zinc-500">{description}</p>}
          </div>
          <button onClick={onClose} className={iconBtn} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-zinc-200 bg-zinc-50/80 px-6 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

/** Centered modal for short, focused forms. */
function Dialog({
  title,
  description,
  onClose,
  children,
  footer,
  wide = false,
}: {
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  useDismiss(onClose)
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="animate-overlay-in absolute inset-0 bg-zinc-950/25 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={`animate-modal-in relative flex max-h-[88vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ${
          wide ? 'max-w-2xl' : 'max-w-lg'
        }`}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-zinc-200 px-6 py-4">
          <div className="min-w-0">
            <h3 className="text-base font-semibold tracking-tight text-zinc-900">{title}</h3>
            {description && <p className="mt-0.5 text-sm text-zinc-500">{description}</p>}
          </div>
          <button onClick={onClose} className={iconBtn} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-zinc-200 bg-zinc-50/80 px-6 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

function Field({
  label,
  children,
  hint,
  className = '',
}: {
  label: string
  children: ReactNode
  hint?: string
  className?: string
}) {
  return (
    <label className={`block ${className}`}>
      <span className={labelCls}>{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-zinc-400">{hint}</span>}
    </label>
  )
}

/* ---------- Labels ---------- */

function LabelChips({
  labels,
  onRemove,
  size = 'sm',
}: {
  labels: string[]
  onRemove?: (label: string) => void
  size?: 'xs' | 'sm'
}) {
  if (labels.length === 0) return null
  const text = size === 'xs' ? 'text-xs' : 'text-xs'
  return (
    <div className="flex flex-wrap items-center gap-1">
      {labels.map((label) => (
        <span
          key={label}
          className={`inline-flex items-center gap-0.5 rounded bg-zinc-100 px-1.5 py-px font-medium text-zinc-600 ${text}`}
        >
          <Tag size={size === 'xs' ? 8 : 9} className="text-zinc-500" />
          {label}
          {onRemove && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onRemove(label)
              }}
              className="ml-0.5 text-zinc-500 hover:text-red-500"
              aria-label={`Remove label ${label}`}
            >
              <X size={size === 'xs' ? 8 : 10} />
            </button>
          )}
        </span>
      ))}
    </div>
  )
}

function LabelEditor({
  value,
  suggestions,
  onChange,
  disabled = false,
}: {
  value: string[]
  suggestions: string[]
  onChange: (labels: string[]) => void
  disabled?: boolean
}) {
  const [text, setText] = useState('')

  const add = (raw: string) => {
    const label = normalizeLabel(raw)
    if (!label || value.includes(label) || value.length >= MAX_LABELS_PER_TASK) {
      setText('')
      return
    }
    onChange([...value, label])
    setText('')
  }

  const remove = (label: string) => onChange(value.filter((l) => l !== label))

  const matches = text.trim()
    ? suggestions
        .filter((s) => s.includes(normalizeLabel(text)) && !value.includes(s))
        .slice(0, 6)
    : []

  return (
    <div className="flex flex-col gap-1.5">
      <LabelChips labels={value} onRemove={disabled ? undefined : remove} />
      {!disabled && (
        <div className="relative">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault()
                add(text)
              } else if (e.key === 'Backspace' && !text && value.length) {
                remove(value[value.length - 1])
              }
            }}
            placeholder={value.length >= MAX_LABELS_PER_TASK ? 'Label limit reached' : 'Add label, press Enter'}
            disabled={value.length >= MAX_LABELS_PER_TASK}
            className={inputCls}
          />
          {matches.length > 0 && (
            <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-zinc-200 bg-white shadow-lg">
              {matches.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => add(s)}
                  className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-100"
                >
                  <Tag size={10} className="text-zinc-500" /> {s}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ---------- Task row / compact task ---------- */

function TaskRow({
  task,
  currentUser,
  members,
  canEdit,
  subtask,
  onSelect,
  onStatus,
  onDelete,
  sprintOptions,
  onAssignSprint,
}: {
  task: TaskWithProject
  currentUser: TeamMember
  members: TeamMember[]
  canEdit: boolean
  subtask?: { done: number; total: number } | null
  onSelect: (task: TaskWithProject) => void
  onStatus: (task: TaskWithProject, status: string) => void
  onDelete: (task: TaskWithProject) => void
  sprintOptions?: { id: string; name: string }[]
  onAssignSprint?: (task: TaskWithProject, sprintId: string) => void
}) {
  const assignee = members.find((m) => m.userId === task.assigneeId)
  const labels = parseLabels(task.labels)
  return (
    <div
      onClick={() => onSelect(task)}
      className="flex cursor-pointer items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 transition-all hover:border-zinc-300 hover:shadow-[0_2px_8px_rgba(24,24,27,0.05)]"
    >
      <span className={keyChip}>{task.key}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-zinc-900">{task.title}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
          <span className="truncate">{task.projectName}</span>
          {task.priority !== 'Medium' && <PriorityTag priority={task.priority} />}
          {task.dueDate && (
            <span className="flex items-center gap-1">
              <CalendarDays size={12} /> {formatDate(task.dueDate)}
            </span>
          )}
          {subtask && subtask.total > 0 && (
            <span className="flex items-center gap-1" title={`${subtask.done} of ${subtask.total} subtasks done`}>
              <GitBranch size={12} /> {subtask.done}/{subtask.total}
            </span>
          )}
          {labels.length > 0 && <LabelChips labels={labels} size="xs" />}
        </div>
      </div>
      {assignee ? (
        <Avatar name={assignee.displayName || '?'} color={assignee.avatarColor} size={26} />
      ) : (
        <div
          className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border border-dashed border-zinc-300 text-[10px] text-zinc-400"
          title="Unassigned"
        >
          ?
        </div>
      )}
      {sprintOptions && onAssignSprint && (
        <select
          value=""
          aria-label="Move to sprint"
          className={`hidden max-w-[130px] sm:block ${selectMini}`}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            if (e.target.value) onAssignSprint(task, e.target.value)
          }}
        >
          <option value="">Move to…</option>
          {sprintOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}
      {canEdit ? (
        <select
          value={task.status}
          aria-label="Change status"
          className={`hidden sm:block ${selectMini}`}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onStatus(task, e.target.value)}
        >
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      ) : (
        <StatusPill status={task.status} />
      )}
      {canEdit && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete(task)
          }}
          className={iconBtn + ' hover:bg-red-50 hover:text-red-600'}
          title="Delete task"
          aria-label={`Delete ${task.key}`}
        >
          <Trash2 size={15} />
        </button>
      )}
    </div>
  )
}

function CompactTask({
  task,
  members,
  currentUser,
  canManage,
  subtask,
  onSelect,
  onStatus,
  onDelete,
}: {
  task: TaskWithProject
  members: TeamMember[]
  currentUser: TeamMember
  canManage: boolean
  subtask?: { done: number; total: number } | null
  onSelect: (task: TaskWithProject) => void
  onStatus: (task: TaskWithProject, status: string) => void
  onDelete: (task: TaskWithProject) => void
}) {
  const assignee = members.find((m) => m.userId === task.assigneeId)
  const labels = parseLabels(task.labels)
  const [dragging, setDragging] = useState(false)
  return (
    <div
      draggable={canManage}
      onDragStart={(e) => {
        if (!canManage) return
        setDragging(true)
        e.dataTransfer.setData('text/plain', task.id)
        e.dataTransfer.dropEffect = 'move'
      }}
      onDragEnd={() => setDragging(false)}
      onClick={() => onSelect(task)}
      className={`group rounded-lg border border-zinc-200 bg-white p-3 shadow-[0_1px_2px_rgba(24,24,27,0.03)] transition-all hover:border-zinc-300 hover:shadow-[0_2px_8px_rgba(24,24,27,0.06)] ${
        dragging ? 'opacity-40' : ''
      } ${canManage ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
    >
      <div className="flex items-center gap-2">
        <span className={keyChip}>{task.key}</span>
        <span className="ml-auto">
          <PriorityTag priority={task.priority} />
        </span>
      </div>
      <div className="mt-2 line-clamp-3 text-sm font-medium leading-snug text-zinc-900">{task.title}</div>
      {labels.length > 0 && (
        <div className="mt-1.5">
          <LabelChips labels={labels} size="xs" />
        </div>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
        {task.dueDate && (
          <span className="flex items-center gap-1">
            <CalendarDays size={10} /> {formatDate(task.dueDate)}
          </span>
        )}
        {subtask && subtask.total > 0 && (
          <span className="flex items-center gap-1" title={`${subtask.done} of ${subtask.total} subtasks done`}>
            <GitBranch size={10} /> {subtask.done}/{subtask.total}
          </span>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between">
        {assignee ? (
          <Avatar name={assignee.displayName || '?'} color={assignee.avatarColor} size={18} />
        ) : (
          <div className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-zinc-100 text-[7px] text-zinc-500">—</div>
        )}
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {task.status !== 'Done' && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onStatus(task, 'Done')
              }}
              className="rounded p-1 text-zinc-500 hover:bg-emerald-50 hover:text-emerald-600"
              title="Mark done"
            >
              <Check size={12} />
            </button>
          )}
          {canManage && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDelete(task)
              }}
              className="rounded p-1 text-zinc-500 hover:bg-red-50 hover:text-red-500"
              title="Delete task"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ---------- Kanban column / sprint board ---------- */

function Column({
  label,
  tasks,
  members,
  currentUser,
  canManage,
  subtaskFor,
  onSelect,
  onStatus,
  onDelete,
  onDrop,
}: {
  label: string
  tasks: TaskWithProject[]
  members: TeamMember[]
  currentUser: TeamMember
  canManage: (task: TaskWithProject) => boolean
  subtaskFor?: (taskId: string) => { done: number; total: number } | null
  onSelect: (task: TaskWithProject) => void
  onStatus: (task: TaskWithProject, status: string) => void
  onDelete: (task: TaskWithProject) => void
  onDrop?: (e: DragEvent<HTMLDivElement>, status: string) => void
}) {
  const [over, setOver] = useState(false)
  const dragging = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }
  const enter = () => setOver(true)
  const leave = () => setOver(false)
  return (
    <div
      className={`flex flex-col gap-2.5 rounded-xl border border-dashed p-2.5 transition-colors ${
        over ? 'border-zinc-400 bg-zinc-100' : 'border-transparent bg-zinc-100/70'
      }`}
      onDragOver={(e) => {
        if (!onDrop) return
        dragging(e)
        enter()
      }}
      onDragLeave={leave}
      onDrop={(e) => {
        if (!onDrop) return
        e.preventDefault()
        leave()
        onDrop(e, label)
      }}
    >
      <div className="flex items-center gap-2 px-1 pt-0.5">
        <StatusPill status={label} />
        <span className="text-xs font-medium text-zinc-400">{tasks.length}</span>
      </div>
      <div className="flex min-h-[80px] flex-col gap-2">
        {tasks.length === 0 ? (
          <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-zinc-300 text-xs text-zinc-400">
            {onDrop ? 'Drop here' : 'Empty'}
          </div>
        ) : (
          tasks.map((task) => (
            <CompactTask
              key={task.id}
              task={task}
              members={members}
              currentUser={currentUser}
              canManage={canManage(task)}
              subtask={subtaskFor ? subtaskFor(task.id) : null}
              onSelect={onSelect}
              onStatus={onStatus}
              onDelete={onDelete}
            />
          ))
        )}
      </div>
    </div>
  )
}

const sprintDot: Record<string, string> = {
  planned: 'bg-zinc-400',
  active: 'bg-emerald-500',
  completed: 'bg-zinc-500',
}

/* Status and priority read as quiet tinted chips. Each pairs a dot/label so the
   meaning never depends on colour alone. */

const statusStyles: Record<string, string> = {
  'To do': 'bg-zinc-100 text-zinc-600',
  'In progress': 'bg-blue-50 text-blue-700',
  Review: 'bg-violet-50 text-violet-700',
  Done: 'bg-emerald-50 text-emerald-700',
  Backlog: 'bg-zinc-100 text-zinc-500',
}

const statusDot: Record<string, string> = {
  'To do': 'bg-zinc-400',
  'In progress': 'bg-blue-500',
  Review: 'bg-violet-500',
  Done: 'bg-emerald-500',
  Backlog: 'bg-zinc-300',
}

const priorityColors: Record<string, string> = {
  Urgent: 'bg-red-50 text-red-700',
  High: 'bg-orange-50 text-orange-700',
  Medium: 'bg-zinc-100 text-zinc-600',
  Low: 'bg-zinc-100 text-zinc-500',
}

/** Priority shown with a glyph so it is distinguishable without colour. */
const priorityGlyph: Record<string, string> = {
  Urgent: '!!',
  High: '!',
  Medium: '–',
  Low: '↓',
}

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${
        statusStyles[status] ?? 'bg-zinc-100 text-zinc-600'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${statusDot[status] ?? 'bg-zinc-400'}`} />
      {status}
    </span>
  )
}

function PriorityTag({ priority }: { priority: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${
        priorityColors[priority] ?? 'bg-zinc-100 text-zinc-600'
      }`}
      title={`${priority} priority`}
    >
      <span aria-hidden="true" className="font-semibold">
        {priorityGlyph[priority] ?? '–'}
      </span>
      {priority}
    </span>
  )
}

/* ---------- Design tokens (shared control styles) ----------
   One place to tune the feel of every control. Sizes sit at 14px/13px so dense
   views stay readable, focus states are neutral but clearly visible, and
   corners/borders stay soft rather than heavy. */

const focusRing = 'outline-none focus:border-zinc-900 focus:ring-4 focus:ring-zinc-900/10'

const inputCls =
  `w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 transition-colors placeholder:text-zinc-400 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-500 ${focusRing}`

/** Native selects, normalized: no OS chrome, custom chevron, same metrics as inputs. */
const selectCls = `select-field ${inputCls}`

/** Compact inline select for table rows and cards. */
const selectMini =
  `select-field rounded-md border border-zinc-200 bg-white py-1 pl-2 pr-7 text-xs text-zinc-600 transition-colors hover:border-zinc-300 ${focusRing}`

const textareaCls = `${inputCls} resize-y leading-relaxed`

const btnBase =
  'inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 outline-none focus-visible:ring-4 focus-visible:ring-zinc-900/10'

const btnPrimary = `${btnBase} bg-zinc-900 px-3.5 py-2 text-white hover:bg-zinc-800 active:bg-zinc-950`
const btnGhost = `${btnBase} border border-zinc-200 bg-white px-3.5 py-2 text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900`
const btnSubtle = `${btnBase} px-3 py-1.5 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900`
const btnDanger = `${btnBase} border border-zinc-200 bg-white px-3.5 py-2 text-zinc-700 hover:border-red-200 hover:bg-red-50 hover:text-red-600`

/** Small square icon button used in headers, rows, and cards. */
const iconBtn =
  'inline-flex items-center justify-center rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 outline-none focus-visible:ring-4 focus-visible:ring-zinc-900/10'

/** Field label: small, medium weight, sentence case (no shouty uppercase). */
const labelCls = 'mb-1.5 block text-xs font-medium text-zinc-500'

/** Monospace-ish work item key chip. */
const keyChip =
  'shrink-0 rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] font-medium tracking-tight text-zinc-600'

function SprintBoard({
  project,
  tasks,
  members,
  sprints,
  currentUser,
  canManage,
  canEditTask,
  subtaskFor,
  onSelect,
  onStatus,
  onAssign,
  onDeleteTask,
  onCreateSprint,
  onStartSprint,
  onCompleteSprint,
  onDeleteSprint,
}: {
  project: Project
  tasks: TaskWithProject[]
  members: TeamMember[]
  sprints: Sprint[]
  currentUser: TeamMember
  canManage: boolean
  canEditTask: (task: TaskWithProject) => boolean
  subtaskFor: (taskId: string) => { done: number; total: number } | null
  onSelect: (task: TaskWithProject) => void
  onStatus: (task: TaskWithProject, status: string) => void
  onAssign: (task: TaskWithProject, sprintId: string | null, status?: string) => void
  onDeleteTask: (task: TaskWithProject) => void
  onCreateSprint: () => void
  onStartSprint: (sprint: Sprint) => void
  onCompleteSprint: (sprint: Sprint) => void
  onDeleteSprint: (sprint: Sprint) => void
}) {
  const projectSprints = sprints.filter((s) => s.projectId === project.id)
  const teamMembers = members.filter((m) => m.teamId === project.teamId)
  const [selection, setSelection] = useState<string | null>(() => {
    const active = projectSprints.find((s) => s.status === 'active')
    return active ? active.id : null
  })
  const selectedSprint = selection ? projectSprints.find((s) => s.id === selection) ?? null : null
  const showSprint = selectedSprint !== null

  const backlogTasks = tasks.filter((t) => t.sprintId === null)
  const sprintTasks = showSprint ? tasks.filter((t) => t.sprintId === selectedSprint.id) : []
  const doneCount = sprintTasks.filter((t) => t.status === 'Done').length
  const boardProjectTasks = tasks.filter((t) => t.projectId === project.id)

  const dropTask = (e: DragEvent<HTMLDivElement>, status: string) => {
    const id = e.dataTransfer.getData('text/plain')
    if (!id) return
    const task = boardProjectTasks.find((t) => t.id === id)
    if (!task) return
    if (showSprint) onAssign(task, selectedSprint.id, status)
    else onStatus(task, status)
  }
  const dropBacklog = (e: DragEvent<HTMLDivElement>) => {
    const id = e.dataTransfer.getData('text/plain')
    if (!id) return
    const task = boardProjectTasks.find((t) => t.id === id)
    if (!task || task.sprintId === null) return
    onAssign(task, null)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-900 font-mono text-[11px] font-semibold text-white">
            {project.key}
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight text-zinc-900">{project.name}</div>
            <div className="mt-0.5 text-xs text-zinc-500">
              {teamMembers.length} {teamMembers.length === 1 ? 'member' : 'members'} · {boardProjectTasks.length} items
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex -space-x-1.5">
            {teamMembers.slice(0, 5).map((m) => (
              <div key={m.id} className="rounded-full ring-2 ring-white">
                <Avatar name={m.displayName || '?'} color={m.avatarColor} size={26} />
              </div>
            ))}
            {teamMembers.length > 5 && (
              <div className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-zinc-100 text-[10px] font-medium text-zinc-600 ring-2 ring-white">
                +{teamMembers.length - 5}
              </div>
            )}
          </div>
          <button className={btnGhost} onClick={onCreateSprint} disabled={!canManage}>
            <Plus size={15} /> New sprint
          </button>
        </div>
      </div>

      {/* Sprint switcher */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => setSelection(null)}
          className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
            !showSprint ? 'bg-zinc-900 font-medium text-white' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
          }`}
        >
          Backlog
        </button>
        {projectSprints.map((s) => (
          <button
            key={s.id}
            onClick={() => setSelection(s.id)}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors ${
              selection === s.id
                ? 'bg-zinc-900 font-medium text-white'
                : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${sprintDot[s.status] ?? 'bg-zinc-400'}`} />
            {s.name}
            {s.status !== 'planned' && (
              <span className={selection === s.id ? 'text-white/60' : 'text-zinc-400'}>
                {s.status === 'active' ? 'active' : 'done'}
              </span>
            )}
          </button>
        ))}
      </div>

      {selectedSprint && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3">
          <Layers3 size={16} className="shrink-0 text-zinc-400" />
          <div className="min-w-0">
            <span className="text-sm font-medium text-zinc-900">{selectedSprint.name}</span>
            {selectedSprint.goal && <p className="truncate text-xs text-zinc-500">{selectedSprint.goal}</p>}
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="shrink-0 text-xs text-zinc-500">
              {doneCount}/{sprintTasks.length} done
            </span>
            <div className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-zinc-200">
              <div
                className="h-full rounded-full bg-zinc-900 transition-all"
                style={{ width: sprintTasks.length ? `${Math.round((doneCount / sprintTasks.length) * 100)}%` : '0%' }}
              />
            </div>
            {selectedSprint.status === 'planned' && (
              <button className={btnPrimary} onClick={() => onStartSprint(selectedSprint)}>
                Start sprint
              </button>
            )}
            {selectedSprint.status === 'active' && (
              <button className={btnGhost} onClick={() => onCompleteSprint(selectedSprint)}>
                <Check size={15} /> End sprint
              </button>
            )}
            {canManage && selectedSprint.status !== 'active' && (
              <button
                className={iconBtn + ' hover:bg-red-50 hover:text-red-600'}
                onClick={() => onDeleteSprint(selectedSprint)}
                title="Delete sprint"
                aria-label="Delete sprint"
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        </div>
      )}

      <div
        className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${
          showSprint ? 'lg:grid-cols-5' : 'lg:grid-cols-4'
        }`}
      >
        {showSprint && (
          <Column
            label="Backlog"
            tasks={backlogTasks.filter((t) => t.projectId === project.id)}
            members={members}
            currentUser={currentUser}
            canManage={canEditTask}
            subtaskFor={subtaskFor}
            onSelect={onSelect}
            onStatus={onStatus}
            onDelete={onDeleteTask}
            onDrop={dropBacklog}
          />
        )}
        {TASK_STATUSES.map((status) => (
          <Column
            key={status}
            label={status}
            tasks={showSprint ? sprintTasks.filter((t) => t.status === status) : backlogTasks.filter((t) => t.projectId === project.id && t.status === status)}
            members={members}
            currentUser={currentUser}
            canManage={canEditTask}
            subtaskFor={subtaskFor}
            onSelect={onSelect}
            onStatus={onStatus}
            onDelete={onDeleteTask}
            onDrop={dropTask}
          />
        ))}
      </div>
    </div>
  )
}

/* ---------- View components ---------- */

function EpicsView({
  epics,
  projects,
  tasks,
  canManageEpic,
  onChangeStatus,
  onDelete,
}: {
  epics: Epic[]
  projects: Project[]
  tasks: TaskWithProject[]
  canManageEpic: (epic: Epic) => boolean
  onChangeStatus: (epic: Epic, status: string) => void
  onDelete: (epic: Epic) => void
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {epics.map((epic) => {
        const project = projects.find((p) => p.id === epic.projectId)
        const count = tasks.filter((t) => t.epicId === epic.id).length
        const manage = canManageEpic(epic)
        return (
          <div key={epic.id} className="flex flex-col gap-2.5 rounded-xl border border-zinc-200 bg-white p-5 transition-colors hover:border-zinc-300">
            <div className="flex items-center gap-2">
              {project && (
                <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] font-medium text-zinc-600">{project.key}</span>
              )}
              <h3 className="truncate text-sm font-semibold text-zinc-900">{epic.title}</h3>
              {manage && (
                <button
                  onClick={() => onDelete(epic)}
                  className="ml-auto text-zinc-400 hover:text-red-500"
                  title="Delete epic"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            {epic.description && (
              <p className="line-clamp-2 text-sm leading-relaxed text-zinc-500">{epic.description}</p>
            )}
            <div className="mt-auto flex items-center gap-2 border-t border-zinc-200 pt-2">
              <span className="flex items-center gap-1 text-xs text-zinc-500">
                <ListChecks size={11} /> {count} tasks
              </span>
              {manage ? (
                <select
                  value={epic.status}
                  onChange={(e) => onChangeStatus(epic, e.target.value)}
                  className={`ml-auto ${selectMini}`}
                >
                  {EPIC_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="ml-auto rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">{epic.status}</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ProjectsView({
  projects,
  teams,
  members,
  tasks,
  canManageProject,
  onEdit,
  onDelete,
}: {
  projects: Project[]
  teams: Team[]
  members: TeamMember[]
  tasks: TaskWithProject[]
  canManageProject: (project: Project) => boolean
  onEdit: (project: Project) => void
  onDelete: (project: Project) => void
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {projects.map((project) => {
        const team = teams.find((t) => t.id === project.teamId)
        const lead = members.find((m) => m.userId === project.leadUserId)
        const count = tasks.filter((t) => t.projectId === project.id).length
        const manage = canManageProject(project)
        return (
          <div key={project.id} className="group flex flex-col gap-2.5 rounded-xl border border-zinc-200 bg-white p-5 transition-colors hover:border-zinc-300">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-zinc-100 font-mono text-[11px] font-semibold text-zinc-600">
                {project.key}
              </div>
              <h3 className="truncate text-sm font-semibold text-zinc-900">{project.name}</h3>
              {manage && (
                <div className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => onEdit(project)}
                    className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-400"
                    title="Edit project"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => onDelete(project)}
                    className="rounded p-1 text-zinc-500 hover:bg-red-50 hover:text-red-500"
                    title="Delete project"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </div>
            {project.description && (
              <p className="line-clamp-2 text-sm leading-relaxed text-zinc-500">{project.description}</p>
            )}
            <div className="mt-auto flex items-center gap-3 border-t border-zinc-200 pt-2 text-xs text-zinc-500">
              <span>{team?.name ?? 'No team'}</span>
              {lead ? (
                <span className="flex items-center gap-1">
                  <Avatar name={lead.displayName || '?'} color={lead.avatarColor} size={16} />
                  {lead.displayName}
                </span>
              ) : (
                <span>No lead</span>
              )}
              <span className="ml-auto">{count} tasks</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TeamsView({
  teams,
  members,
  currentUser,
  isAdminOf,
  canCreateTeam,
  allUsers,
  allUsersLoading,
  onChangeRole,
  onAddMember,
  onRemoveMember,
  onCreate,
}: {
  teams: Team[]
  members: TeamMember[]
  currentUser: TeamMember
  isAdminOf: (teamId: string) => boolean
  canCreateTeam: boolean
  allUsers: Awaited<ReturnType<typeof listAllUsers>> | null
  allUsersLoading: boolean
  onChangeRole: (member: TeamMember, role: string) => void
  onAddMember: (teamId: string, targetUserId: string) => void
  onRemoveMember: (member: TeamMember) => void
  onCreate: () => void
}) {
  const [addFor, setAddFor] = useState<string | null>(null)
  const [pickId, setPickId] = useState('')
  return (
    <div className="flex flex-col gap-3">
      {teams.map((team) => {
        const teamMembers = members.filter((m) => m.teamId === team.id)
        const admin = isAdminOf(team.id)
        const teamUserIds = new Set(teamMembers.map((m) => m.userId))
        const available = (allUsers ?? []).filter((u) => !teamUserIds.has(u.id))
        return (
          <div key={team.id} className="rounded-xl border border-zinc-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-zinc-900">{team.name}</h3>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                {teamMembers.length} members
              </span>
              {teamMembers.length === 1 && teamMembers[0]?.id === currentUser.id && teamMembers[0]?.userId === currentUser.userId && teamMembers[0]?.role !== 'admin' && canCreateTeam && (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-600">You are not an admin — created by lead</span>
              )}
            </div>
            {team.description && <p className="mt-1 text-xs text-zinc-600">{team.description}</p>}
            <div className="mt-3 flex flex-col gap-1.5">
              {teamMembers.map((m) => (
                <div key={m.id} className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-zinc-100">
                  <Avatar name={m.displayName || '?'} color={m.avatarColor} size={24} />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-zinc-800">
                    {m.displayName}
                    {m.userId === currentUser.userId && <span className="ml-1 text-xs text-zinc-500">(you)</span>}
                  </span>
                  {admin ? (
                    <div className="flex items-center gap-1.5">
                      <select
                        value={m.role}
                        onChange={(e) => onChangeRole(m, e.target.value)}
                        className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700 outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
                      >
                        {['admin', 'lead', 'member'].map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                      {m.userId !== currentUser.userId && (
                        <button
                          onClick={() => onRemoveMember(m)}
                          title={`Remove ${m.displayName} from ${team.name}`}
                          className="flex items-center gap-1 rounded-md border border-transparent px-2 py-1 text-xs font-medium text-zinc-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                        >
                          <UserMinus size={14} /> Remove
                        </button>
                      )}
                    </div>
                  ) : (
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">{m.role}</span>
                  )}
                </div>
              ))}
            </div>
{admin && (
                <div className="mt-3 border-t border-zinc-200 pt-3">
                  {addFor === team.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={pickId}
                        onChange={(e) => setPickId(e.target.value)}
                        className={inputCls + ' flex-1 min-w-[180px]'}
                      >
                        <option value="">Select a user…</option>
                        {available.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name || u.email || u.id}
                          </option>
                        ))}
                      </select>
                      <button
                        className={btnPrimary}
                        disabled={!pickId}
                        onClick={() => {
                          onAddMember(team.id, pickId)
                          setAddFor(null)
                          setPickId('')
                        }}
                      >
                        <UserPlus size={15} /> Add
                      </button>
                      <button
                        className={btnGhost}
                        onClick={() => {
                          setAddFor(null)
                          setPickId('')
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      className={btnPrimary}
                      disabled={allUsersLoading || !allUsers || available.length === 0}
                      onClick={() => {
                        setPickId('')
                        setAddFor(team.id)
                      }}
                      title={
                        !allUsers
                          ? 'You need admin access to view members'
                          : available.length === 0
                            ? 'Everyone is already on this team'
                            : ''
                      }
                    >
                      <UserPlus size={15} /> Add member
                    </button>
                  )}
                </div>
              )}
          </div>
        )
      })}
    </div>
  )
}

function HistoryView({
  sprints,
  projects,
  tasks,
}: {
  sprints: Sprint[]
  projects: Project[]
  tasks: TaskWithProject[]
}) {
  const completed = sprints
    .filter((s) => s.status === 'completed')
    .sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0))

  if (completed.length === 0) {
    return (
      <Empty
        icon={<History size={30} />}
        title="No completed sprints yet"
        hint="End a sprint to archive its results here."
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {completed.map((sprint) => {
        const project = projects.find((p) => p.id === sprint.projectId)
        const sprintTasks = tasks.filter((t) => t.sprintId === sprint.id)
        const delivered = sprintTasks.filter((t) => t.status === 'Done')
        const points = delivered.reduce((sum, t) => sum + (t.points ?? 0), 0)
        return (
          <div key={sprint.id} className="rounded-xl border border-zinc-200 bg-white p-5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-100 font-mono text-[11px] font-semibold text-zinc-600">
                {project?.key ?? '—'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-zinc-900">{sprint.name}</div>
                <div className="text-xs text-zinc-500">
                  {project?.name ?? 'Unknown project'} · {formatDate(sprint.completedAt)}
                </div>
              </div>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600">
                Ended
              </span>
            </div>
            {sprint.goal && <p className="mt-2 text-xs text-zinc-600">{sprint.goal}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-zinc-600">
              <span>
                <Check size={11} className="mr-1 inline text-emerald-500" />
                <b className="text-zinc-800">{delivered.length}</b> delivered
              </span>
              <span>
                <Zap size={11} className="mr-1 inline text-amber-500" />
                <b className="text-zinc-800">{points}</b> pts completed
              </span>
              <span>
                <CircleDot size={11} className="mr-1 inline text-zinc-500" />
                <b className="text-zinc-800">{sprintTasks.length - delivered.length}</b> not completed
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ---------- Dashboard ---------- */

function StatCard({
  label,
  value,
  icon,
  tone = 'slate',
}: {
  label: string
  value: number
  icon: ReactNode
  tone?: 'slate' | 'blue' | 'amber' | 'emerald' | 'red'
}) {
  const tones: Record<string, string> = {
    slate: 'text-zinc-600 bg-zinc-100',
    blue: 'text-zinc-400 bg-zinc-100',
    amber: 'text-amber-600 bg-amber-50',
    emerald: 'text-emerald-600 bg-emerald-50',
    red: 'text-red-600 bg-red-50',
  }
  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-2xl font-semibold leading-none tracking-tight text-zinc-900">{value}</div>
        <div className="mt-1.5 truncate text-xs text-zinc-500">{label}</div>
      </div>
    </div>
  )
}

function DashboardView({
  tasks,
  members,
  sprints,
  currentUser,
  onSelect,
}: {
  tasks: TaskWithProject[]
  members: TeamMember[]
  sprints: Sprint[]
  currentUser: TeamMember
  onSelect: (task: TaskWithProject) => void
}) {
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  const isDone = (t: TaskWithProject) => t.status === 'Done'
  const mine = tasks.filter((t) => t.assigneeId === currentUser.userId)
  const myOpen = mine.filter((t) => !isDone(t))
  const myInProgress = mine.filter((t) => t.status === 'In progress')
  const myDone = mine.filter(isDone)

  const overdue = tasks
    .filter((t) => !isDone(t) && t.dueDate && new Date(t.dueDate) < startOfToday)
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())

  const upcoming = tasks
    .filter((t) => !isDone(t) && t.dueDate && new Date(t.dueDate) >= startOfToday)
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
    .slice(0, 6)

  const highPriority = tasks
    .filter((t) => !isDone(t) && (t.priority === 'Urgent' || t.priority === 'High'))
    .sort((a, b) => (a.priority === 'Urgent' ? -1 : 1) - (b.priority === 'Urgent' ? -1 : 1))
    .slice(0, 6)

  const openBugs = tasks.filter((t) => t.type === 'Bug' && !isDone(t)).length

  const recentlyCompleted = tasks
    .filter(isDone)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 6)

  const statusCounts = TASK_STATUSES.map((status) => ({
    status,
    count: tasks.filter((t) => t.status === status).length,
  }))

  const activeSprints = sprints.filter((s) => s.status === 'active')

  // Team workload: open (not done) tasks assigned per person, deduped by user.
  const uniqueMembers = members.filter((m, i, arr) => arr.findIndex((x) => x.userId === m.userId) === i && m.displayName)
  const workload = uniqueMembers
    .map((m) => ({ member: m, count: tasks.filter((t) => t.assigneeId === m.userId && !isDone(t)).length }))
    .sort((a, b) => b.count - a.count)
  const maxLoad = Math.max(1, ...workload.map((w) => w.count))

  // Velocity: story points delivered per completed sprint (most recent first).
  const velocity = sprints
    .filter((s) => s.status === 'completed')
    .sort((a, b) => (a.completedAt ? new Date(a.completedAt).getTime() : 0) - (b.completedAt ? new Date(b.completedAt).getTime() : 0))
    .slice(-6)
    .map((s) => ({
      sprint: s,
      points: tasks.filter((t) => t.sprintId === s.id && isDone(t)).reduce((sum, t) => sum + (t.points ?? 0), 0),
    }))
  const maxVelocity = Math.max(1, ...velocity.map((v) => v.points))

  const MiniRow = ({ task }: { task: TaskWithProject }) => (
    <button
      onClick={() => onSelect(task)}
      className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-zinc-50"
    >
      <span className={keyChip}>{task.key}</span>
      <span className="min-w-0 flex-1 truncate text-sm text-zinc-700">{task.title}</span>
      {task.priority !== 'Medium' && <PriorityTag priority={task.priority} />}
      {task.dueDate && <span className="shrink-0 text-xs text-zinc-400">{formatDate(task.dueDate)}</span>}
    </button>
  )

  const Panel = ({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) => (
    <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5">
      <div className="flex items-center gap-2 text-sm font-medium text-zinc-900">
        {icon} {title}
      </div>
      {children}
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Assigned to me (open)" value={myOpen.length} icon={<ListChecks size={16} />} tone="blue" />
        <StatCard label="My in progress" value={myInProgress.length} icon={<CircleDot size={16} />} tone="amber" />
        <StatCard label="Completed by me" value={myDone.length} icon={<Check size={16} />} tone="emerald" />
        <StatCard label="Overdue (team)" value={overdue.length} icon={<AlertTriangle size={16} />} tone="red" />
      </div>

      {/* Active sprint + status breakdown */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel title="Active sprints" icon={<Layers3 size={13} className="text-zinc-400" />}>
          {activeSprints.length === 0 ? (
            <p className="text-xs text-zinc-400">No active sprints right now.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {activeSprints.map((s) => {
                const st = tasks.filter((t) => t.sprintId === s.id)
                const doneCount = st.filter(isDone).length
                const pct = st.length ? Math.round((doneCount / st.length) * 100) : 0
                return (
                  <div key={s.id}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-medium text-zinc-800">{s.name}</span>
                      <span className="text-zinc-500">
                        {doneCount}/{st.length} · {pct}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-zinc-200">
                      <div className="h-full rounded-full bg-zinc-900 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    {s.goal && <p className="mt-1 truncate text-xs text-zinc-500">{s.goal}</p>}
                  </div>
                )
              })}
            </div>
          )}
        </Panel>

        <Panel title="Status breakdown" icon={<FolderKanban size={13} className="text-zinc-400" />}>
          <div className="grid grid-cols-2 gap-2">
            {statusCounts.map(({ status, count }) => (
              <div key={status} className="flex items-center justify-between rounded-md bg-zinc-50 px-2.5 py-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[status] ?? 'bg-zinc-100 text-zinc-600'}`}>
                  {status}
                </span>
                <span className="text-sm font-bold text-zinc-800">{count}</span>
              </div>
            ))}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
            <AlertCircle size={11} /> {openBugs} open bug{openBugs === 1 ? '' : 's'}
          </div>
        </Panel>
      </div>

      {/* Workload + velocity */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel title="Team workload (open tasks)" icon={<Users size={13} className="text-zinc-400" />}>
          {workload.length === 0 ? (
            <p className="text-xs text-zinc-400">No members yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {workload.map(({ member, count }) => (
                <div key={member.userId} className="flex items-center gap-2">
                  <Avatar name={member.displayName || '?'} color={member.avatarColor} size={20} />
                  <span className="w-24 shrink-0 truncate text-xs text-zinc-700">{member.displayName}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-200">
                    <div className="h-full rounded-full bg-zinc-900" style={{ width: `${(count / maxLoad) * 100}%` }} />
                  </div>
                  <span className="w-6 shrink-0 text-right text-xs font-medium text-zinc-600">{count}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Velocity (points delivered)" icon={<TrendingUp size={13} className="text-zinc-400" />}>
          {velocity.length === 0 ? (
            <p className="text-xs text-zinc-400">Complete a sprint to see velocity.</p>
          ) : (
            <div className="flex h-40 items-end gap-2">
              {velocity.map(({ sprint, points }) => (
                <div key={sprint.id} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-xs font-medium text-zinc-600">{points}</span>
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className="w-full rounded-t bg-zinc-900/85"
                      style={{ height: `${Math.max(4, (points / maxVelocity) * 100)}%` }}
                      title={`${sprint.name}: ${points} pts`}
                    />
                  </div>
                  <span className="w-full truncate text-center text-xs text-zinc-500" title={sprint.name}>
                    {sprint.name}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* Lists */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Panel title="High priority" icon={<Zap size={13} className="text-orange-500" />}>
          {highPriority.length === 0 ? (
            <p className="text-xs text-zinc-400">Nothing high priority open.</p>
          ) : (
            highPriority.map((t) => <MiniRow key={t.id} task={t} />)
          )}
        </Panel>
        <Panel title="Upcoming deadlines" icon={<CalendarDays size={13} className="text-zinc-400" />}>
          {upcoming.length === 0 ? (
            <p className="text-xs text-zinc-400">No upcoming due dates.</p>
          ) : (
            upcoming.map((t) => <MiniRow key={t.id} task={t} />)
          )}
        </Panel>
        <Panel title="Recently completed" icon={<Check size={13} className="text-emerald-500" />}>
          {recentlyCompleted.length === 0 ? (
            <p className="text-xs text-zinc-400">Nothing completed yet.</p>
          ) : (
            recentlyCompleted.map((t) => <MiniRow key={t.id} task={t} />)
          )}
        </Panel>
      </div>

      {overdue.length > 0 && (
        <Panel title={`Overdue (${overdue.length})`} icon={<AlertTriangle size={13} className="text-red-500" />}>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {overdue.slice(0, 8).map((t) => (
              <MiniRow key={t.id} task={t} />
            ))}
          </div>
        </Panel>
      )}
    </div>
  )
}

/* ---------- Dialogs ---------- */

function CreateDialog({
  projects,
  projectId,
  members,
  epics,
  sprints,
  currentUser,
  labelSuggestions,
  pending,
  onClose,
  onCreate,
}: {
  projects: Project[]
  projectId: string
  members: TeamMember[]
  epics: Epic[]
  sprints: Sprint[]
  currentUser: TeamMember
  labelSuggestions: string[]
  pending: boolean
  onClose: () => void
  onCreate: (input: Parameters<typeof createTask>[0]) => void
}) {
  const [project, setProject] = useState(projectId)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState('Task')
  const [priority, setPriority] = useState('Medium')
  const [area, setArea] = useState(DEFAULT_AREA)
  const [points, setPoints] = useState('3')
  const [dueDate, setDueDate] = useState('')
  const [assigneeId, setAssigneeId] = useState(currentUser.userId)
  const [epicId, setEpicId] = useState('')
  const [sprintId, setSprintId] = useState('')
  const [labels, setLabels] = useState<string[]>([])

  const selectedProject = projects.find((p) => p.id === project)
  const teamMembers = selectedProject ? members.filter((m) => m.teamId === selectedProject.teamId) : []
  const projectEpics = epics.filter((e) => e.projectId === project)
  const projectSprints = sprints.filter((s) => s.projectId === project && s.status !== 'completed')

  if (projects.length === 0) {
    return (
      <Drawer
        title="Create work item"
        onClose={onClose}
        footer={
          <button className={btnGhost} onClick={onClose}>
            Close
          </button>
        }
      >
        <Empty
          icon={<FolderOpen size={22} />}
          title="No project yet"
          hint="Work items live inside a project. Create your first project, then come back here."
        />
      </Drawer>
    )
  }

  const submit = () => {
    if (!title.trim() || !project) return
    onCreate({
      projectId: project,
      title: title.trim(),
      description: description.trim() || undefined,
      type,
      priority,
      area,
      points: Number(points),
      dueDate: dueDate || undefined,
      assigneeId: assigneeId || undefined,
      epicId: epicId || undefined,
      sprintId: sprintId || undefined,
      labels,
    })
  }

  // Cmd/Ctrl+Enter submits from anywhere in the form, including the description.
  const hotkeySubmit = (e: ReactKeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      submit()
    }
  }

  return (
    <Drawer
      title="Create work item"
      description="Give it a clear title and enough context for someone else to pick up."
      onClose={onClose}
      width="lg"
      footer={
        <>
          <span className="mr-auto hidden text-xs text-zinc-400 sm:block">
            <kbd className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 font-sans text-[11px] text-zinc-500">
              ⌘
            </kbd>
            <span className="mx-1">+</span>
            <kbd className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 font-sans text-[11px] text-zinc-500">
              ↵
            </kbd>
            <span className="ml-1.5">to create</span>
          </span>
          <button className={btnGhost} onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button className={btnPrimary} onClick={submit} disabled={pending || !title.trim()}>
            {pending ? <CircleDot className="animate-spin" size={15} /> : <Plus size={15} />}
            {pending ? 'Creating…' : 'Create work item'}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-6" onKeyDown={hotkeySubmit}>
        {/* Primary content: the part people actually write */}
        <div className="flex flex-col gap-4">
          <Field label="Title">
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Fix login redirect on expired session"
              className={`${inputCls} text-base`}
            />
          </Field>

          <Field label="Description" hint="Markdown is supported. Drag the bottom edge to make this taller.">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={12}
              placeholder={
                'What needs to happen and why?\n\n## Context\n\n## Acceptance criteria\n- [ ] …'
              }
              className={`${textareaCls} min-h-[260px]`}
            />
          </Field>
        </div>

        {/* Secondary metadata, visually separated so it never competes with the writing area */}
        <div className="border-t border-zinc-200 pt-5">
          <h4 className="mb-3 text-xs font-medium text-zinc-500">Details</h4>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Project">
              <select value={project} onChange={(e) => setProject(e.target.value)} className={selectCls}>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.key})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Type">
              <select value={type} onChange={(e) => setType(e.target.value)} className={selectCls}>
                {TASK_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Assignee">
              <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className={selectCls}>
                <option value="">Unassigned</option>
                {teamMembers.map((m) => (
                  <option key={m.id} value={m.userId}>
                    {m.displayName}
                    {m.userId === currentUser.userId ? ' (you)' : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Priority">
              <select value={priority} onChange={(e) => setPriority(e.target.value)} className={selectCls}>
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Due date">
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Story points">
              <select value={points} onChange={(e) => setPoints(e.target.value)} className={selectCls}>
                {POINTS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Epic">
              <select value={epicId} onChange={(e) => setEpicId(e.target.value)} className={selectCls}>
                <option value="">No epic</option>
                {projectEpics.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Sprint">
              <select value={sprintId} onChange={(e) => setSprintId(e.target.value)} className={selectCls}>
                <option value="">Backlog</option>
                {projectSprints.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Area">
              <select value={area} onChange={(e) => setArea(e.target.value)} className={selectCls}>
                {AREAS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Labels" className="sm:col-span-2">
              <LabelEditor value={labels} suggestions={labelSuggestions} onChange={setLabels} />
            </Field>
          </div>
        </div>
      </div>
    </Drawer>
  )
}

function SprintDialog({
  project,
  pending,
  onClose,
  onCreate,
}: {
  project: Project
  pending: boolean
  onClose: () => void
  onCreate: (input: Parameters<typeof createSprint>[0]) => void
}) {
  const [name, setName] = useState('')
  const [goal, setGoal] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')

  const submit = () => {
    if (!name.trim()) return
    onCreate({
      projectId: project.id,
      name: name.trim(),
      goal: goal.trim() || undefined,
      startsAt: startsAt ? new Date(startsAt).toISOString() : undefined,
      endsAt: endsAt ? new Date(endsAt).toISOString() : undefined,
    })
  }

  return (
    <Dialog
      title="New sprint"
      description={`For ${project.name} (${project.key})`}
      onClose={onClose}
      footer={
        <>
          <button className={btnGhost} onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button className={btnPrimary} onClick={submit} disabled={pending || !name.trim()}>
            {pending ? <CircleDot className="animate-spin" size={15} /> : <Plus size={15} />}
            {pending ? 'Creating…' : 'Create sprint'}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Sprint name">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="e.g. Sprint 4"
            className={inputCls}
          />
        </Field>
        <Field label="Goal" hint="Optional. What should this sprint deliver?">
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            rows={3}
            placeholder="e.g. Ship MFA enrollment and prepare for security review"
            className={textareaCls}
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Starts">
            <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Ends">
            <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={inputCls} />
          </Field>
        </div>
      </div>
    </Dialog>
  )
}

function EpicDialog({
  projects,
  pending,
  onClose,
  onCreate,
}: {
  projects: Project[]
  pending: boolean
  onClose: () => void
  onCreate: (input: Parameters<typeof createEpic>[0]) => void
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  if (projects.length === 0) {
    return (
      <Dialog
        title="Create epic"
        onClose={onClose}
        footer={
          <button className={btnGhost} onClick={onClose}>
            Close
          </button>
        }
      >
        <Empty
          icon={<FolderOpen size={22} />}
          title="No project yet"
          hint="Epics group work inside a project. Create a project first."
        />
      </Dialog>
    )
  }

  const submit = () => {
    if (!title.trim() || !projectId) return
    onCreate({ projectId, title: title.trim(), description: description.trim() || undefined })
  }

  return (
    <Dialog
      title="Create epic"
      description="A larger objective that groups related work items."
      onClose={onClose}
      footer={
        <>
          <button className={btnGhost} onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button className={btnPrimary} onClick={submit} disabled={pending || !title.trim()}>
            {pending ? <CircleDot className="animate-spin" size={15} /> : <Plus size={15} />}
            {pending ? 'Creating…' : 'Create epic'}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Title">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Authentication modernization"
            className={`${inputCls} text-base`}
          />
        </Field>
        <Field label="Project">
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={selectCls}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.key})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={6}
            placeholder="What does this epic cover, and when is it done?"
            className={`${textareaCls} min-h-[140px]`}
          />
        </Field>
      </div>
    </Dialog>
  )
}

function ProjectDialog({
  teams,
  canManageTeam,
  edit,
  pending,
  onClose,
  onCreate,
  onUpdate,
}: {
  teams: Team[]
  canManageTeam: (teamId: string) => boolean
  edit: Project | null
  pending: boolean
  onClose: () => void
  onCreate: (input: Parameters<typeof createProject>[0]) => void
  onUpdate: (id: string, input: Parameters<typeof updateProject>[1]) => void
}) {
  const [name, setName] = useState(edit?.name ?? '')
  const [description, setDescription] = useState(edit?.description ?? '')
  const [key, setKey] = useState(edit?.key ?? '')
  const [teamId, setTeamId] = useState('')
  const manageTeams = teams.filter((t) => canManageTeam(t.id))
  const isEdit = edit !== null

  const submit = () => {
    if (!name.trim()) return
    if (isEdit && edit) {
      onUpdate(edit.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        key: key.trim() || undefined,
      })
    } else {
      onCreate({ name: name.trim(), description: description.trim() || undefined, teamId: teamId || undefined })
    }
  }

  return (
    <Dialog
      title={isEdit ? 'Edit project' : 'Create project'}
      description={isEdit ? undefined : 'A product, system, or initiative that work belongs to.'}
      onClose={onClose}
      footer={
        <>
          <button className={btnGhost} onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button className={btnPrimary} onClick={submit} disabled={pending || !name.trim()}>
            {pending ? <CircleDot className="animate-spin" size={15} /> : <Check size={15} />}
            {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create project'}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Name">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Security Platform"
            className={`${inputCls} text-base`}
          />
        </Field>
        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            placeholder="What is this project about?"
            className={`${textareaCls} min-h-[120px]`}
          />
        </Field>
        {isEdit ? (
          <Field label="Key" hint="Used as the prefix for work item IDs, e.g. SEC-101.">
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="e.g. SEC"
              className={`${inputCls} font-mono uppercase`}
            />
          </Field>
        ) : (
          <Field label="Team" hint="Only teams you lead or administer are listed.">
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className={selectCls}>
              <option value="">Select a team…</option>
              {manageTeams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
    </Dialog>
  )
}

function TeamDialog({
  pending,
  onClose,
  onCreate,
}: {
  pending: boolean
  onClose: () => void
  onCreate: (input: Parameters<typeof createTeam>[0]) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const submit = () => {
    if (!name.trim()) return
    onCreate({ name: name.trim(), description: description.trim() || undefined })
  }

  return (
    <Dialog
      title="Create team"
      description="A group of people who work together. You'll be its first admin."
      onClose={onClose}
      footer={
        <>
          <button className={btnGhost} onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button className={btnPrimary} onClick={submit} disabled={pending || !name.trim()}>
            {pending ? <CircleDot className="animate-spin" size={15} /> : <Plus size={15} />}
            {pending ? 'Creating…' : 'Create team'}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Team name">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="e.g. Security"
            className={`${inputCls} text-base`}
          />
        </Field>
        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            placeholder="What does this team own?"
            className={`${textareaCls} min-h-[120px]`}
          />
        </Field>
      </div>
    </Dialog>
  )
}

function SubtasksSection({
  subtasks,
  members,
  canEdit,
  value,
  onChange,
  onAdd,
  onToggle,
  onDelete,
}: {
  subtasks: TaskWithProject[]
  members: TeamMember[]
  canEdit: boolean
  value: string
  onChange: (value: string) => void
  onAdd: () => void
  onToggle: (sub: TaskWithProject, done: boolean) => void
  onDelete: (sub: TaskWithProject) => void
}) {
  const total = subtasks.length
  const done = subtasks.filter((s) => s.status === 'Done').length
  const pct = total ? Math.round((done / total) * 100) : 0

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-600">
          <GitBranch size={13} /> Subtasks
        </span>
        {total > 0 && (
          <>
            <span className="rounded-full bg-zinc-100 px-1.5 py-px text-xs text-zinc-600">
              {done}/{total}
            </span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-200">
              <div className="h-full rounded-full bg-zinc-900 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs text-zinc-500">{pct}%</span>
          </>
        )}
      </div>

      {total > 0 && (
        <div className="flex flex-col gap-1">
          {subtasks.map((sub) => {
            const assignee = members.find((m) => m.userId === sub.assigneeId)
            const isDone = sub.status === 'Done'
            return (
              <div
                key={sub.id}
                className="flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-2 py-1.5"
              >
                <input
                  type="checkbox"
                  checked={isDone}
                  disabled={!canEdit}
                  onChange={(e) => onToggle(sub, e.target.checked)}
                  className="h-3.5 w-3.5 shrink-0 accent-zinc-900"
                  title={isDone ? 'Mark not done' : 'Mark done'}
                />
                <span className="shrink-0 rounded bg-zinc-100 px-1 py-px text-xs font-bold text-zinc-400">
                  {sub.key}
                </span>
                <span className={`min-w-0 flex-1 truncate text-xs ${isDone ? 'text-zinc-500 line-through' : 'text-zinc-800'}`}>
                  {sub.title}
                </span>
                {assignee && <Avatar name={assignee.displayName || '?'} color={assignee.avatarColor} size={18} />}
                {canEdit && (
                  <button
                    onClick={() => onDelete(sub)}
                    className="shrink-0 text-zinc-400 hover:text-red-500"
                    title="Delete subtask"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {canEdit && (
        <div className="flex gap-2">
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onAdd()}
            placeholder="Add a subtask…"
            className={inputCls}
          />
          <button
            className="shrink-0 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
            onClick={onAdd}
            disabled={!value.trim()}
          >
            <Plus size={13} />
          </button>
        </div>
      )}

      {total === 0 && !canEdit && <p className="text-xs text-zinc-400">No subtasks.</p>}
    </div>
  )
}

function TaskDialog({
  task,
  project,
  members,
  epics,
  sprints,
  currentUser,
  canEdit,
  labelSuggestions,
  subtasks,
  pending,
  onClose,
  onDelete,
  onUpdate,
  onAddSubtask,
  onToggleSubtask,
  onDeleteSubtask,
}: {
  task: TaskWithProject
  project: Project
  members: TeamMember[]
  epics: Epic[]
  sprints: Sprint[]
  currentUser: TeamMember
  canEdit: boolean
  labelSuggestions: string[]
  subtasks: TaskWithProject[]
  pending: boolean
  onClose: () => void
  onDelete: (task: TaskWithProject) => void
  onUpdate: (patch: Parameters<typeof updateTask>[1]) => void
  onAddSubtask: (title: string) => void
  onToggleSubtask: (sub: TaskWithProject, done: boolean) => void
  onDeleteSubtask: (sub: TaskWithProject) => void
}) {
  const isSubtask = task.parentId !== null
  const teamMembers = members.filter((m) => m.teamId === project.teamId)
  const assignee = members.find((m) => m.userId === task.assigneeId)
  const reporter = members.find((m) => m.userId === task.reporterId)
  const projectEpics = epics.filter((e) => e.projectId === project.id)
  const projectSprints = sprints.filter((s) => s.projectId === project.id && s.status !== 'completed')

  const [type, setType] = useState(task.type)
  const [priority, setPriority] = useState(task.priority)
  const [status, setStatus] = useState(task.status)
  const [area, setArea] = useState(task.area)
  const [points, setPoints] = useState(String(task.points))
  const [dueDate, setDueDate] = useState(toDateInputValue(task.dueDate))
  const [assigneeId, setAssigneeId] = useState(task.assigneeId ?? '')
  const [epicId, setEpicId] = useState(task.epicId ?? '')
  const [sprintId, setSprintId] = useState(task.sprintId ?? '')
  const [blocked, setBlocked] = useState(task.blocked)
  const [labels, setLabels] = useState<string[]>(() => parseLabels(task.labels))
  const [description, setDescription] = useState(task.description)
  const [editingDescription, setEditingDescription] = useState(false)
  const [newSubtask, setNewSubtask] = useState('')
  const [dialError, setDialError] = useState('')

  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState<Awaited<ReturnType<typeof getTaskDetails>>>([])
  const [commentText, setCommentText] = useState('')

  useEffect(() => {
    if (!showComments) return
    let cancelled = false
    void getTaskDetails(task.id)
      .then((res) => {
        if (!cancelled) setComments(res)
      })
      .catch((e: unknown) => {
        if (!cancelled) setDialError(formatError(e))
      })
    return () => {
      cancelled = true
    }
  }, [task.id, showComments])

  const addComment = async () => {
    const body = commentText.trim()
    if (!body) return
    try {
      await addTaskComment(task.id, body)
      setCommentText('')
      const res = await getTaskDetails(task.id)
      setComments(res)
    } catch (e) {
      setDialError(formatError(e))
    }
  }

  const saveDescription = () => {
    onUpdate({ description })
    setEditingDescription(false)
  }

  return (
    <Drawer
      title={isSubtask ? 'Subtask' : 'Work item'}
      onClose={onClose}
      width="xl"
      footer={
        <>
          <span className="mr-auto text-xs text-zinc-400">
            {pending ? (
              <span className="inline-flex items-center gap-1.5 text-zinc-600">
                <CircleDot className="animate-spin" size={12} /> Saving…
              </span>
            ) : (
              <>Updated {formatDate(task.updatedAt)}</>
            )}
          </span>
          {canEdit && (
            <button onClick={() => onDelete(task)} className={btnDanger}>
              <Trash2 size={15} /> Delete
            </button>
          )}
          <button className={btnGhost} onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={keyChip}>{task.key}</span>
            <span className="text-xs text-zinc-500">
              {project.key} · {project.name}
            </span>
            {task.blocked && (
              <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
                <AlertTriangle size={11} /> Blocked
              </span>
            )}
          </div>
          <h3 className="mt-2 text-xl font-semibold leading-snug tracking-tight text-zinc-900">{task.title}</h3>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
            <span className="inline-flex items-center gap-1.5">
              {assignee ? (
                <>
                  <Avatar name={assignee.displayName || '?'} color={assignee.avatarColor} size={18} />
                  {assignee.displayName}
                </>
              ) : (
                'Unassigned'
              )}
            </span>
            <span>Reported by {reporter?.displayName ?? '—'}</span>
            <span>Created {formatDate(task.createdAt)}</span>
          </div>
        </div>

        {dialError && (
          <div className="flex items-center gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2.5 text-sm text-red-600">
            <AlertCircle size={14} /> {dialError}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 rounded-xl border border-zinc-200 bg-zinc-50/60 p-4 sm:grid-cols-4">
          <Field label="Status">
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value)
                onUpdate({ status: e.target.value })
              }}
              className={selectCls}
              disabled={!canEdit}
            >
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Type">
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value)
                onUpdate({ type: e.target.value })
              }}
              className={selectCls}
              disabled={!canEdit}
            >
              {TASK_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Priority">
            <select
              value={priority}
              onChange={(e) => {
                setPriority(e.target.value)
                onUpdate({ priority: e.target.value })
              }}
              className={selectCls}
              disabled={!canEdit}
            >
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Points">
            <select
              value={points}
              onChange={(e) => {
                setPoints(e.target.value)
                onUpdate({ points: Number(e.target.value) })
              }}
              className={selectCls}
              disabled={!canEdit}
            >
              {POINTS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Area">
            <select
              value={area}
              onChange={(e) => {
                setArea(e.target.value)
                onUpdate({ area: e.target.value })
              }}
              className={selectCls}
              disabled={!canEdit}
            >
              {AREAS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Assignee">
            <select
              value={assigneeId}
              onChange={(e) => {
                setAssigneeId(e.target.value)
                onUpdate({ assigneeId: e.target.value || null })
              }}
              className={selectCls}
              disabled={!canEdit}
            >
              <option value="">Unassigned</option>
              {teamMembers.map((m) => (
                <option key={m.id} value={m.userId}>
                  {m.displayName}
                  {m.userId === currentUser.userId ? ' (you)' : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Epic">
            <select
              value={epicId}
              onChange={(e) => {
                setEpicId(e.target.value)
                onUpdate({ epicId: e.target.value || null })
              }}
              className={selectCls}
              disabled={!canEdit}
            >
              <option value="">No epic</option>
              {projectEpics.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Sprint">
            <select
              value={sprintId}
              onChange={(e) => {
                setSprintId(e.target.value)
                onUpdate({ sprintId: e.target.value || null })
              }}
              className={selectCls}
              disabled={!canEdit}
            >
              <option value="">Backlog</option>
              {projectSprints.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Due date">
            <input
              type="date"
              value={dueDate}
              onChange={(e) => {
                setDueDate(e.target.value)
                onUpdate({ dueDate: e.target.value || null })
              }}
              className={inputCls}
              disabled={!canEdit}
            />
          </Field>
          <div className="flex items-end">
            <label className="flex cursor-pointer items-center gap-2 pb-1.5 text-xs text-zinc-700">
              <input
                type="checkbox"
                checked={blocked}
                disabled={!canEdit}
                onChange={(e) => {
                  setBlocked(e.target.checked)
                  onUpdate({ blocked: e.target.checked })
                }}
                className="h-3.5 w-3.5 accent-zinc-900"
              />
              Blocked
            </label>
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500">Description</span>
            {canEdit && !editingDescription && (
              <button className="flex items-center gap-1 text-xs text-zinc-400 hover:underline" onClick={() => setEditingDescription(true)}>
                <Pencil size={10} /> Edit
              </button>
            )}
          </div>
          {editingDescription ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={14}
                autoFocus
                placeholder={'What needs to happen and why?\n\n## Context\n\n## Acceptance criteria\n- [ ] …'}
                className={`${textareaCls} min-h-[300px]`}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault()
                    saveDescription()
                  }
                }}
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  className={btnSubtle}
                  onClick={() => {
                    setDescription(task.description)
                    setEditingDescription(false)
                  }}
                >
                  Cancel
                </button>
                <button className={btnPrimary} onClick={saveDescription}>
                  <Check size={15} /> Save description
                </button>
              </div>
            </div>
          ) : description ? (
            <button
              onClick={() => canEdit && setEditingDescription(true)}
              disabled={!canEdit}
              className={`block w-full whitespace-pre-wrap rounded-xl border border-zinc-200 bg-white px-4 py-3.5 text-left text-sm leading-relaxed text-zinc-700 ${
                canEdit ? 'transition-colors hover:border-zinc-300 hover:bg-zinc-50' : 'cursor-default'
              }`}
            >
              {description}
            </button>
          ) : (
            <button
              onClick={() => canEdit && setEditingDescription(true)}
              disabled={!canEdit}
              className={`block w-full rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-left text-sm text-zinc-400 ${
                canEdit ? 'transition-colors hover:border-zinc-300 hover:bg-zinc-50' : 'cursor-default'
              }`}
            >
              {canEdit ? 'Add a description…' : 'No description.'}
            </button>
          )}
        </div>

        <div>
          <span className={labelCls}>Labels</span>
          {canEdit ? (
            <LabelEditor
              value={labels}
              suggestions={labelSuggestions}
              onChange={(next) => {
                setLabels(next)
                onUpdate({ labels: next })
              }}
            />
          ) : labels.length > 0 ? (
            <LabelChips labels={labels} />
          ) : (
            <p className="text-sm text-zinc-400">No labels.</p>
          )}
        </div>

        {!isSubtask && (
          <div className="border-t border-zinc-200 pt-5">
            <SubtasksSection
              subtasks={subtasks}
              members={members}
              canEdit={canEdit}
              value={newSubtask}
              onChange={setNewSubtask}
              onAdd={() => {
                const title = newSubtask.trim()
                if (!title) return
                onAddSubtask(title)
                setNewSubtask('')
              }}
              onToggle={onToggleSubtask}
              onDelete={onDeleteSubtask}
            />
          </div>
        )}

        <div className="border-t border-zinc-200 pt-5">
          <button
            className="flex items-center gap-2 text-sm font-medium text-zinc-700 transition-colors hover:text-zinc-900"
            onClick={() => setShowComments((v) => !v)}
          >
            <MessageSquare size={15} className="text-zinc-400" /> Comments
            {comments.length > 0 && (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">{comments.length}</span>
            )}
          </button>
          {showComments && (
            <div className="mt-4 flex flex-col gap-4">
              {canEdit && (
                <div className="flex flex-col gap-2">
                  <textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                        e.preventDefault()
                        void addComment()
                      }
                    }}
                    rows={3}
                    placeholder="Leave a comment… (⌘+↵ to send)"
                    className={textareaCls}
                  />
                  <div className="flex justify-end">
                    <button className={btnPrimary} onClick={() => void addComment()} disabled={!commentText.trim()}>
                      <MessageSquare size={15} /> Comment
                    </button>
                  </div>
                </div>
              )}
              {comments.length === 0 ? (
                <p className="text-sm text-zinc-400">No comments yet.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {comments.map((c) => (
                    <div key={c.id} className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium text-zinc-800">{c.author ?? 'Team member'}</span>
                        <span className="text-xs text-zinc-400">{formatDate(c.createdAt)}</span>
                      </div>
                      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-zinc-600">{c.body}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Drawer>
  )
}

/* ---------- Sidebar ---------- */

function Sidebar({
  currentUser,
  projectCount,
  activeSprintCount,
  active,
  onNavigate,
  onSignOut,
  onCreate,
}: {
  currentUser: TeamMember
  projectCount: number
  activeSprintCount: number
  active: string
  onNavigate: (view: string) => void
  onSignOut: () => void
  onCreate: () => void
}) {
  // Grouped so the sidebar reads as "where am I" then "what am I planning".
  const navGroups: { heading?: string; items: { label: string; icon: ReactNode }[] }[] = [
    {
      items: [
        { label: 'Dashboard', icon: <LayoutDashboard size={16} /> },
        { label: 'My work', icon: <ListChecks size={16} /> },
      ],
    },
    {
      heading: 'Plan',
      items: [
        { label: 'Sprint board', icon: <Layers3 size={16} /> },
        { label: 'Backlog', icon: <FolderKanban size={16} /> },
        { label: 'Epics', icon: <Zap size={16} /> },
        { label: 'Sprint history', icon: <History size={16} /> },
      ],
    },
    {
      heading: 'Workspace',
      items: [
        { label: 'Projects', icon: <FolderOpen size={16} /> },
        { label: 'Teams', icon: <Users size={16} /> },
      ],
    },
  ]
  return (
    <div className="flex h-full w-64 flex-col border-r border-zinc-200 bg-white">
      <div className="flex items-center gap-2.5 px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-sm font-semibold text-white">
          O
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold tracking-tight text-zinc-900">Orbit</div>
          <div className="truncate text-xs text-zinc-500">Engineering workspace</div>
        </div>
      </div>

      <div className="px-3 pb-3">
        <button className={`${btnPrimary} w-full`} onClick={onCreate}>
          <Plus size={16} /> New work item
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-3">
        {navGroups.map((group, i) => (
          <div key={group.heading ?? i} className={i > 0 ? 'mt-5' : ''}>
            {group.heading && (
              <div className="mb-1.5 px-2.5 text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                {group.heading}
              </div>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = active === item.label
                return (
                  <button
                    key={item.label}
                    onClick={() => onNavigate(item.label)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                      isActive
                        ? 'bg-zinc-100 font-medium text-zinc-900'
                        : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
                    }`}
                  >
                    <span className={isActive ? 'text-zinc-900' : 'text-zinc-400'}>{item.icon}</span>
                    {item.label}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-zinc-200 p-3">
        <div className="mb-2 grid grid-cols-2 gap-2">
          <Metric label="Projects" count={projectCount} />
          <Metric label="Active sprints" count={activeSprintCount} />
        </div>
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-zinc-50">
          <Avatar name={currentUser.displayName || '?'} color={currentUser.avatarColor} size={30} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-zinc-900">{currentUser.displayName || 'Member'}</div>
            <div className="text-xs capitalize text-zinc-500">{currentUser.role}</div>
          </div>
          <button onClick={onSignOut} title="Sign out" aria-label="Sign out" className={iconBtn}>
            <Settings2 size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}

/* ---------- Main component ---------- */

export default function WorkspaceClient({
  currentUser,
  members: initialMembers,
  teams: initialTeams,
  projects: initialProjects,
  initialTasks,
  sprints: initialSprints,
  epics: initialEpics,
}: {
  currentUser: TeamMember
  members: TeamMember[]
  teams: Team[]
  projects: Project[]
  initialTasks: (Task & { projectKey: string; projectName: string })[]
  sprints: Sprint[]
  epics: Epic[]
}) {
  const [tasks, setTasks] = useState<TaskWithProject[]>(initialTasks)
  const [members, setMembers] = useState<TeamMember[]>(initialMembers)
  const [teams, setTeams] = useState<Team[]>(initialTeams)
  const [projects, setProjects] = useState<Project[]>(initialProjects)
  const [sprints, setSprints] = useState<Sprint[]>(initialSprints)
  const [epics, setEpics] = useState<Epic[]>(initialEpics)

  const [active, setActive] = useState('Dashboard')
  const [selected, setSelected] = useState<TaskWithProject | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const [createFor, setCreateFor] = useState<string | null>(null)
  const [createSprintFor, setCreateSprintFor] = useState<string | null>(null)
  const [createEpicOpen, setCreateEpicOpen] = useState(false)
  const [createProjectOpen, setCreateProjectOpen] = useState(false)
  const [editProject, setEditProject] = useState<Project | null>(null)
  const [createTeamOpen, setCreateTeamOpen] = useState(false)
  const [boardProjectId, setBoardProjectId] = useState<string | null>(initialProjects[0]?.id ?? null)
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all')
  const [labelFilter, setLabelFilter] = useState<string>('all')
  const [allUsers, setAllUsers] = useState<Awaited<ReturnType<typeof listAllUsers>> | null>(null)
  const [allUsersLoading, setAllUsersLoading] = useState(false)

  useEffect(() => {
    if (active !== 'Teams' || allUsers !== null) return
    let cancelled = false
    setAllUsersLoading(true)
    listAllUsers()
      .then((users) => {
        if (!cancelled) setAllUsers(users)
      })
      .catch((e) => setError(formatError(e)))
      .finally(() => {
        if (!cancelled) setAllUsersLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [active, allUsers])

  const projectMap = new Map(projects.map((p) => [p.id, p]))
  const teamMap = new Map(teams.map((t) => [t.id, t]))

  const visibleTasks = tasks.filter((task) => {
    if (!query.trim()) return true
    const q = query.toLowerCase()
    return `${task.key} ${task.title} ${task.projectName}`.toLowerCase().includes(q)
  })

  const scopedTasks = visibleTasks.filter((task) => {
    const okAssignee =
      assigneeFilter === 'all'
        ? true
        : assigneeFilter === 'me'
          ? task.assigneeId === currentUser.userId
          : task.assigneeId === assigneeFilter
    const okLabel = labelFilter === 'all' ? true : parseLabels(task.labels).includes(labelFilter)
    return okAssignee && okLabel
  })

  // Labels present across the workspace — powers autocomplete and the label filter.
  const allLabels = Array.from(new Set(tasks.flatMap((t) => parseLabels(t.labels)))).sort()

  // Subtask rollups are derived from the loaded task list (subtasks are task rows
  // carrying a parentId), so board/detail progress stays live without an extra fetch.
  const childrenOf = (taskId: string) => tasks.filter((t) => t.parentId === taskId)
  const subtaskProgress = (taskId: string): { done: number; total: number } | null => {
    const kids = childrenOf(taskId)
    if (kids.length === 0) return null
    return { done: kids.filter((k) => k.status === 'Done').length, total: kids.length }
  }

  const assigneeOptions = members
    .filter((m, i, arr) => arr.findIndex((x) => x.userId === m.userId) === i)
    .filter((m) => m.displayName)
    .sort((a, b) => a.displayName.localeCompare(b.displayName))

  const roleForTeam = (teamId: string): string | undefined =>
    members.find((m) => m.userId === currentUser.userId && m.teamId === teamId)?.role

  const canManageTeam = (teamId: string): boolean => {
    const role = roleForTeam(teamId)
    return role === 'admin' || role === 'lead'
  }

  const canManageProject = (project: Project): boolean => canManageTeam(project.teamId)

  const canEditTask = (task: TaskWithProject): boolean => {
    const role = roleForTeam(task.projectId ? (projectMap.get(task.projectId)?.teamId ?? '') : '')
    return (
      task.assigneeId === currentUser.userId ||
      task.reporterId === currentUser.userId ||
      role === 'admin' ||
      role === 'lead'
    )
  }

  const canCreateProject = teams.some((t) => canManageTeam(t.id)) || members.filter((m) => m.userId === currentUser.userId).length === 1

  /* ---------- optimistic mutations ---------- */

  function refreshTask(id: string, patch: Partial<Task>) {
    setTasks((items) => items.map((item) => (item.id === id ? { ...item, ...patch, updatedAt: new Date() } : item)))
  }

  function saveStatus(task: TaskWithProject, status: string) {
    setError('')
    refreshTask(task.id, { status })
    startTransition(async () => {
      try {
        await updateTask(task.id, { status })
      } catch (e) {
        setError(formatError(e))
        refreshTask(task.id, { status: task.status })
      }
    })
  }

  function assignSprint(task: TaskWithProject, sprintId: string | null, status?: string) {
    setError('')
    refreshTask(task.id, status ? { sprintId, status } : { sprintId })
    startTransition(async () => {
      try {
        await updateTask(task.id, status ? { sprintId, status } : { sprintId })
      } catch (e) {
        setError(formatError(e))
        refreshTask(task.id, status ? { sprintId: task.sprintId, status: task.status } : { sprintId: task.sprintId })
      }
    })
  }

  function removeTask(task: TaskWithProject) {
    setError('')
    setTasks((items) => items.filter((item) => item.id !== task.id))
    if (selected?.id === task.id) setSelected(null)
    startTransition(async () => {
      try {
        await deleteTask(task.id)
      } catch (e) {
        setError(formatError(e))
        setTasks((items) => (items.some((item) => item.id === task.id) ? items : [...items, task]))
      }
    })
  }

  function saveTask(id: string, patch: Parameters<typeof updateTask>[1]) {
    setError('')
    const { dueDate, labels, ...rest } = patch
    const taskPatch: Partial<Task> = { ...rest }
    if (dueDate !== undefined) taskPatch.dueDate = dueDate === null ? null : new Date(dueDate)
    if (labels !== undefined) taskPatch.labels = serializeLabels(labels)
    refreshTask(id, taskPatch)
    startTransition(async () => {
      try {
        await updateTask(id, patch)
      } catch (e) {
        setError(formatError(e))
      }
    })
  }

  function submitCreateSubtask(parent: TaskWithProject, title: string) {
    setError('')
    startTransition(async () => {
      try {
        const created = await createSubtask({ parentId: parent.id, title })
        const row: TaskWithProject = {
          id: created.id,
          key: created.key,
          projectId: parent.projectId,
          projectKey: parent.projectKey,
          projectName: parent.projectName,
          epicId: parent.epicId ?? null,
          parentId: parent.id,
          title,
          description: '',
          type: 'Subtask',
          priority: 'Medium',
          status: 'To do',
          labels: '',
          dueDate: null,
          area: 'Engineering',
          points: 1,
          assigneeId: null,
          reporterId: currentUser.userId,
          sprintId: null,
          blocked: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
        setTasks((items) => [...items, row])
      } catch (e) {
        setError(formatError(e))
      }
    })
  }

  function toggleSubtask(sub: TaskWithProject, done: boolean) {
    setError('')
    const next = done ? 'Done' : 'To do'
    refreshTask(sub.id, { status: next })
    startTransition(async () => {
      try {
        await setSubtaskDone(sub.id, done)
      } catch (e) {
        setError(formatError(e))
        refreshTask(sub.id, { status: sub.status })
      }
    })
  }

  function removeSubtask(sub: TaskWithProject) {
    setError('')
    setTasks((items) => items.filter((item) => item.id !== sub.id))
    startTransition(async () => {
      try {
        await deleteSubtask(sub.id)
      } catch (e) {
        setError(formatError(e))
        setTasks((items) => (items.some((item) => item.id === sub.id) ? items : [...items, sub]))
      }
    })
  }

  function submitCreateTask(input: Parameters<typeof createTask>[0]) {
    setError('')
    startTransition(async () => {
      try {
        const created = await createTask(input)
        const project = projectMap.get(input.projectId)
        const task: TaskWithProject = {
          id: created.id,
          key: created.key,
          projectId: input.projectId,
          projectKey: project?.key ?? '',
          projectName: project?.name ?? '',
          title: input.title,
          description: input.description ?? '',
          type: input.type ?? 'Task',
          priority: input.priority ?? 'Medium',
          status: 'To do',
          points: input.points ?? DEFAULT_POINTS,
          area: input.area ?? DEFAULT_AREA,
          assigneeId: input.assigneeId ?? null,
          reporterId: currentUser.userId,
          epicId: input.epicId ?? null,
          parentId: null,
          sprintId: input.sprintId ?? null,
          labels: serializeLabels(input.labels ?? []),
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          blocked: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
        setTasks((items) => [task, ...items])
        setCreateFor(null)
      } catch (e) {
        setError(formatError(e))
      }
    })
  }

  function refreshSprint(id: string, patch: Partial<Sprint>) {
    setSprints((items) => items.map((item) => (item.id === id ? { ...item, ...patch, updatedAt: new Date() } : item)))
  }

  function submitCreateSprint(input: Parameters<typeof createSprint>[0]) {
    setError('')
    startTransition(async () => {
      try {
        const created = await createSprint(input)
        const sprint: Sprint = {
          id: created.id,
          projectId: input.projectId,
          name: input.name,
          goal: input.goal ?? '',
          status: 'planned',
          startsAt: input.startsAt ? new Date(input.startsAt) : null,
          endsAt: input.endsAt ? new Date(input.endsAt) : null,
          completedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
        setSprints((items) => [...items, sprint])
        setCreateSprintFor(null)
      } catch (e) {
        setError(formatError(e))
      }
    })
  }

  function startSprintNow(sprint: Sprint) {
    setError('')
    refreshSprint(sprint.id, { status: 'active' })
    startTransition(async () => {
      try {
        await startSprint(sprint.id)
      } catch (e) {
        setError(formatError(e))
        refreshSprint(sprint.id, { status: sprint.status })
      }
    })
  }

  function completeSprintNow(sprint: Sprint) {
    setError('')
    refreshSprint(sprint.id, { status: 'completed', completedAt: new Date() })
    startTransition(async () => {
      try {
        await completeSprint(sprint.id)
      } catch (e) {
        setError(formatError(e))
        refreshSprint(sprint.id, { status: sprint.status, completedAt: sprint.completedAt })
      }
    })
  }

  function removeSprint(sprint: Sprint) {
    setError('')
    setSprints((items) => items.filter((item) => item.id !== sprint.id))
    setTasks((items) => items.map((item) => (item.sprintId === sprint.id ? { ...item, sprintId: null, updatedAt: new Date() } : item)))
    startTransition(async () => {
      try {
        await deleteSprint(sprint.id)
      } catch (e) {
        setError(formatError(e))
        setSprints((items) => (items.some((item) => item.id === sprint.id) ? items : [...items, sprint]))
      }
    })
  }

  function refreshEpic(id: string, patch: Partial<Epic>) {
    setEpics((items) => items.map((item) => (item.id === id ? { ...item, ...patch, updatedAt: new Date() } : item)))
  }

  function submitCreateEpic(input: Parameters<typeof createEpic>[0]) {
    setError('')
    startTransition(async () => {
      try {
        const created = await createEpic(input)
        const epic: Epic = {
          id: created.id,
          projectId: input.projectId,
          title: input.title,
          description: input.description ?? '',
          status: 'Open',
          createdAt: new Date(),
          updatedAt: new Date(),
        }
        setEpics((items) => [epic, ...items])
        setCreateEpicOpen(false)
      } catch (e) {
        setError(formatError(e))
      }
    })
  }

  function changeEpicStatus(epic: Epic, status: string) {
    setError('')
    refreshEpic(epic.id, { status })
    startTransition(async () => {
      try {
        await updateEpic(epic.id, { status })
      } catch (e) {
        setError(formatError(e))
        refreshEpic(epic.id, { status: epic.status })
      }
    })
  }

  function removeEpic(epic: Epic) {
    setError('')
    setEpics((items) => items.filter((item) => item.id !== epic.id))
    setTasks((items) =>
      items.map((item) => (item.epicId === epic.id ? { ...item, epicId: null, updatedAt: new Date() } : item)),
    )
    startTransition(async () => {
      try {
        await deleteEpic(epic.id)
      } catch (e) {
        setError(formatError(e))
        setEpics((items) => (items.some((item) => item.id === epic.id) ? items : [...items, epic]))
      }
    })
  }

  function submitCreateProject(input: Parameters<typeof createProject>[0]) {
    setError('')
    startTransition(async () => {
      try {
        const created = await createProject(input)
        const myMembership = members.find((m) => m.userId === currentUser.userId)
        const project: Project = {
          id: created.id,
          key: created.key,
          name: input.name,
          description: input.description ?? '',
          leadUserId: null,
          teamId: input.teamId ?? myMembership?.teamId ?? '',
          issueCounter: 100,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
        setProjects((items) => [project, ...items])
        setCreateProjectOpen(false)
        setBoardProjectId((prev) => prev ?? project.id)
      } catch (e) {
        setError(formatError(e))
      }
    })
  }

  function submitUpdateProject(id: string, input: Parameters<typeof updateProject>[1]) {
    setError('')
    const prev = projects.find((p) => p.id === id)
    if (!prev) return
    setProjects((items) =>
      items.map((p) =>
        p.id === id
          ? {
              ...p,
              name: input.name ?? p.name,
              description: input.description ?? p.description,
              key: input.key ?? p.key,
              leadUserId: input.leadUserId === undefined ? p.leadUserId : input.leadUserId,
              updatedAt: new Date(),
            }
          : p,
      ),
    )
    setEditProject(null)
    startTransition(async () => {
      try {
        await updateProject(id, input)
      } catch (e) {
        setError(formatError(e))
        setProjects((items) => items.map((p) => (p.id === id ? prev : p)))
      }
    })
  }

  function removeProject(project: Project) {
    setError('')
    setProjects((items) => items.filter((item) => item.id !== project.id))
    setTasks((items) => items.filter((item) => item.projectId !== project.id))
    setSprints((items) => items.filter((item) => item.projectId !== project.id))
    setEpics((items) => items.filter((item) => item.projectId !== project.id))
    setBoardProjectId((prev) => (prev === project.id ? projects.find((p) => p.id !== project.id)?.id ?? null : prev))
    startTransition(async () => {
      try {
        await deleteProject(project.id)
      } catch (e) {
        setError(formatError(e))
        setProjects((items) => (items.some((item) => item.id === project.id) ? items : [...items, project]))
      }
    })
  }

  function submitCreateTeam(input: Parameters<typeof createTeam>[0]) {
    setError('')
    startTransition(async () => {
      try {
        const created = await createTeam(input)
        const team: Team = {
          id: created.id,
          name: input.name,
          description: input.description ?? '',
          createdAt: new Date(),
          updatedAt: new Date(),
        }
        const membership: TeamMember = {
          id: crypto.randomUUID(),
          teamId: created.id,
          userId: currentUser.userId,
          role: 'admin',
          displayName: currentUser.displayName,
          avatarColor: currentUser.avatarColor,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
        setTeams((items) => [team, ...items])
        setMembers((items) => [...items, membership])
        setCreateTeamOpen(false)
      } catch (e) {
        setError(formatError(e))
      }
    })
  }

  function changeRole(member: TeamMember, role: string) {
    setError('')
    setMembers((items) => items.map((m) => (m.id === member.id ? { ...m, role, updatedAt: new Date() } : m)))
    startTransition(async () => {
      try {
        await updateMemberRole(member.id, role)
      } catch (e) {
        setError(formatError(e))
        setMembers((items) => items.map((m) => (m.id === member.id ? { ...m, role: member.role } : m)))
      }
    })
  }

  function submitAddMember(teamId: string, targetUserId: string) {
    setError('')
    const picked = allUsers?.find((u) => u.id === targetUserId)
    startTransition(async () => {
      try {
        await addMemberToTeam(teamId, targetUserId)
        const membership: TeamMember = {
          id: crypto.randomUUID(),
          teamId,
          userId: targetUserId,
          role: 'member',
          displayName: picked?.name || picked?.email.split('@')[0] || '',
          avatarColor: DEFAULT_AVATAR_COLOR,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
        setMembers((items) => [...items, membership])
      } catch (e) {
        setError(formatError(e))
      }
    })
  }

  function submitRemoveMember(member: TeamMember) {
    setError('')
    const removed = { ...member }
    setMembers((items) => items.filter((m) => m.id !== member.id))
    startTransition(async () => {
      try {
        await removeMemberFromTeam(member.teamId, member.id)
      } catch (e) {
        setError(formatError(e))
        setMembers((items) => (items.some((m) => m.id === removed.id) ? items : [...items, removed]))
      }
    })
  }

  const openCreate = () => {
    setCreateFor(projects[0]?.id ?? null)
  }

  const signOut = () => {
    void authClient.signOut().then(() => {
      window.location.href = '/sign-in'
    })
  }

  /* ---------- derived view data ---------- */

  const myTasks = visibleTasks
    .filter((task) => task.assigneeId === currentUser.userId && !task.parentId)
    .filter((task) => labelFilter === 'all' || parseLabels(task.labels).includes(labelFilter))
    .sort((a, b) => statusRank(a.status) - statusRank(b.status))

  const activeSprintCount = sprints.filter((s) => s.status === 'active').length

  // Board and backlog operate on top-level work items; subtasks live inside their parent.
  const boardProject = boardProjectId ? projectMap.get(boardProjectId) : undefined
  const boardTasks = boardProject
    ? scopedTasks.filter((t) => t.projectId === boardProject.id && !t.parentId)
    : []

  const backlogTasks = scopedTasks.filter((t) => t.sprintId === null && !t.parentId)

  const topLevelVisibleTasks = visibleTasks.filter((t) => !t.parentId)
  const sprintOptionsFor = (task: TaskWithProject) =>
    sprints
      .filter((s) => s.projectId === task.projectId && (s.status === 'planned' || s.status === 'active'))
      .map((s) => ({ id: s.id, name: s.name }))

  const epicProjects = projects.filter((p) => epics.some((e) => e.projectId === p.id) || projects.length > 0)

  const selectedProject = selected ? projectMap.get(selected.projectId) : undefined

  // Assignee/label filters only make sense on the task-listing views.
  const showFilters = active === 'Sprint board' || active === 'Backlog' || active === 'My work'

  /* ---------- render ---------- */

  return (
    <div className="flex h-screen bg-zinc-50 font-sans text-zinc-900">
      {/* Desktop sidebar */}
      <div className="hidden h-full md:block">
        <Sidebar
          currentUser={currentUser}
          projectCount={projects.length}
          activeSprintCount={activeSprintCount}
          active={active}
          onNavigate={setActive}
          onSignOut={signOut}
          onCreate={openCreate}
        />
      </div>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div
          className="animate-overlay-in fixed inset-0 z-40 flex bg-zinc-950/30 backdrop-blur-[2px] md:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <div className="h-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <Sidebar
              currentUser={currentUser}
              projectCount={projects.length}
              activeSprintCount={activeSprintCount}
              active={active}
              onNavigate={(view) => {
                setActive(view)
                setMobileOpen(false)
              }}
              onSignOut={signOut}
              onCreate={() => {
                openCreate()
                setMobileOpen(false)
              }}
            />
          </div>
        </div>
      )}

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 items-center gap-3 border-b border-zinc-200 bg-white/80 px-4 py-3 backdrop-blur-md sm:px-6">
          <button
            className={`${iconBtn} md:hidden`}
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu size={18} />
          </button>
          <div className="relative max-w-sm flex-1">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search work items…"
              className={`w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2 pl-9 pr-9 text-sm text-zinc-900 transition-colors placeholder:text-zinc-400 focus:bg-white ${focusRing}`}
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {showFilters && (
              <select
                value={assigneeFilter}
                onChange={(e) => setAssigneeFilter(e.target.value)}
                title="Filter by assignee"
                aria-label="Filter by assignee"
                className={`hidden sm:block ${selectMini}`}
              >
                <option value="all">Everyone</option>
                <option value="me">Only me</option>
                {assigneeOptions.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            )}
            {showFilters && allLabels.length > 0 && (
              <select
                value={labelFilter}
                onChange={(e) => setLabelFilter(e.target.value)}
                title="Filter by label"
                aria-label="Filter by label"
                className={`hidden sm:block ${selectMini}`}
              >
                <option value="all">All labels</option>
                {allLabels.map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </select>
            )}
            {isPending && (
              <span className="hidden items-center gap-1.5 text-xs text-zinc-500 sm:flex">
                <CircleDot size={12} className="animate-spin" /> Saving
              </span>
            )}
            <button className={iconBtn} title="Notifications" aria-label="Notifications">
              <Bell size={17} />
            </button>
            <button className={btnPrimary} onClick={openCreate}>
              <Plus size={16} /> <span className="hidden sm:inline">New</span>
            </button>
          </div>
        </header>

        {error && (
          <div className="flex shrink-0 items-center gap-2 border-b border-red-100 bg-red-50 px-4 py-2.5 text-sm text-red-700 sm:px-6">
            <AlertCircle size={15} className="shrink-0" /> {error}
            <button onClick={() => setError('')} className="ml-auto rounded p-1 hover:bg-red-100" aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          {active === 'Dashboard' && (
            <div className="flex flex-col gap-6">
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-zinc-900">
                  {greeting()}, {currentUser.displayName || 'there'}
                </h2>
                <p className="mt-0.5 text-sm text-zinc-500">Here's what's happening across your teams.</p>
              </div>
              <DashboardView
                tasks={tasks.filter((t) => !t.parentId)}
                members={members}
                sprints={sprints}
                currentUser={currentUser}
                onSelect={setSelected}
              />
            </div>
          )}

          {active === 'My work' && (
            <div className="flex flex-col gap-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight text-zinc-900">My work</h2>
                  <p className="mt-0.5 text-sm text-zinc-500">{myTasks.length} tasks assigned to you</p>
                </div>
                <button className={btnPrimary} onClick={openCreate}>
                  <Plus size={15} /> New work item
                </button>
              </div>
              {myTasks.length === 0 ? (
                <Empty
                  icon={<ListChecks size={30} />}
                  title="No tasks assigned to you"
                  hint="Create a task and assign yourself to see it here."
                  action={{ label: 'New work item', onClick: openCreate }}
                />
              ) : (
                <div className="flex flex-col gap-2">
                  {myTasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      currentUser={currentUser}
                      members={members}
                      canEdit={canEditTask(task)}
                      subtask={subtaskProgress(task.id)}
                      onSelect={setSelected}
                      onStatus={saveStatus}
                      onDelete={removeTask}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {active === 'Sprint board' && (
            <div className="flex flex-col gap-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight text-zinc-900">Sprint board</h2>
                  <p className="mt-0.5 text-sm text-zinc-500">Drag tasks between columns to update status and sprint.</p>
                </div>
                {projects.length > 0 && (
                  <select
                    value={boardProjectId ?? ''}
                    onChange={(e) => setBoardProjectId(e.target.value || null)}
                    className={selectCls + ' w-auto'}
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.key})
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {boardProject ? (
                <SprintBoard
                  key={boardProject.id}
                  project={boardProject}
                  tasks={boardTasks}
                  members={members}
                  sprints={sprints}
                  currentUser={currentUser}
                  canManage={canManageProject(boardProject)}
                  canEditTask={canEditTask}
                  subtaskFor={subtaskProgress}
                  onSelect={setSelected}
                  onStatus={saveStatus}
                  onAssign={assignSprint}
                  onDeleteTask={removeTask}
                  onCreateSprint={() => setCreateSprintFor(boardProject.id)}
                  onStartSprint={startSprintNow}
                  onCompleteSprint={completeSprintNow}
                  onDeleteSprint={removeSprint}
                />
              ) : (
                <Empty
                  icon={<Layers3 size={30} />}
                  title="No project selected"
                  hint="Create a project to start planning sprints."
                  action={{ label: 'Create project', onClick: () => setCreateProjectOpen(true) }}
                />
              )}
            </div>
          )}

          {active === 'Backlog' && (
            <div className="flex flex-col gap-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight text-zinc-900">Backlog</h2>
                  <p className="mt-0.5 text-sm text-zinc-500">{backlogTasks.length} tasks without a sprint</p>
                </div>
                <button className={btnPrimary} onClick={openCreate}>
                  <Plus size={15} /> Add to backlog
                </button>
              </div>
              {backlogTasks.length === 0 ? (
                <Empty
                  icon={<FolderKanban size={30} />}
                  title="Backlog is empty"
                  hint="Tasks that aren't in a sprint appear here."
                  action={{ label: 'Add to backlog', onClick: openCreate }}
                />
              ) : (
                <div className="flex flex-col gap-2">
                  {backlogTasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      currentUser={currentUser}
                      members={members}
                      canEdit={canEditTask(task)}
                      subtask={subtaskProgress(task.id)}
                      onSelect={setSelected}
                      onStatus={saveStatus}
                      onDelete={removeTask}
                      sprintOptions={sprintOptionsFor(task)}
                      onAssignSprint={(t, sprintId) => assignSprint(t, sprintId)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {active === 'Epics' && (
            <div className="flex flex-col gap-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight text-zinc-900">Epics</h2>
                  <p className="mt-0.5 text-sm text-zinc-500">{epics.length} epics across {epicProjects.length} projects</p>
                </div>
                <button className={btnPrimary} onClick={() => setCreateEpicOpen(true)}>
                  <Plus size={15} /> Create epic
                </button>
              </div>
              {epics.length === 0 ? (
                <Empty
                  icon={<Zap size={30} />}
                  title="No epics yet"
                  hint="Group related tasks into epics to track larger efforts."
                  action={{ label: 'Create epic', onClick: () => setCreateEpicOpen(true) }}
                />
              ) : (
                <EpicsView
                  epics={epics}
                  projects={projects}
                  tasks={topLevelVisibleTasks}
                  canManageEpic={(epic) => {
                    const project = projectMap.get(epic.projectId)
                    return project ? canManageProject(project) : false
                  }}
                  onChangeStatus={changeEpicStatus}
                  onDelete={removeEpic}
                />
              )}
            </div>
          )}

          {active === 'Projects' && (
            <div className="flex flex-col gap-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight text-zinc-900">Projects</h2>
                  <p className="mt-0.5 text-sm text-zinc-500">{projects.length} projects</p>
                </div>
                {canCreateProject && (
                  <button className={btnPrimary} onClick={() => setCreateProjectOpen(true)}>
                    <Plus size={15} /> Create project
                  </button>
                )}
              </div>
              {projects.length === 0 ? (
                <Empty
                  icon={<FolderOpen size={30} />}
                  title="No projects yet"
                  hint="Create a project to start organizing work."
                  action={canCreateProject ? { label: 'Create project', onClick: () => setCreateProjectOpen(true) } : undefined}
                />
              ) : (
                <ProjectsView
                  projects={projects}
                  teams={teams}
                  members={members}
                  tasks={topLevelVisibleTasks}
                  canManageProject={canManageProject}
                  onEdit={setEditProject}
                  onDelete={removeProject}
                />
              )}
            </div>
          )}

          {active === 'Teams' && (
            <div className="flex flex-col gap-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight text-zinc-900">Teams</h2>
                  <p className="mt-0.5 text-sm text-zinc-500">
                    {teams.length} teams · {members.length} members
                  </p>
                </div>
                <button className={btnPrimary} onClick={() => setCreateTeamOpen(true)}>
                  <Plus size={15} /> Create team
                </button>
              </div>
              {teams.length === 0 ? (
                <Empty
                  icon={<Users size={30} />}
                  title="No teams yet"
                  hint="Create a team to start adding members."
                  action={{ label: 'Create team', onClick: () => setCreateTeamOpen(true) }}
                />
              ) : (
                <TeamsView
                  teams={teams}
                  members={members}
                  currentUser={currentUser}
                  isAdminOf={(teamId) => roleForTeam(teamId) === 'admin'}
                  canCreateTeam={canCreateProject}
                  allUsers={allUsers}
                  allUsersLoading={allUsersLoading}
                  onChangeRole={changeRole}
                  onAddMember={submitAddMember}
                  onRemoveMember={submitRemoveMember}
                  onCreate={() => setCreateTeamOpen(true)}
                />
              )}
            </div>
          )}

          {active === 'Sprint history' && (
            <div className="flex flex-col gap-6">
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-zinc-900">Sprint history</h2>
                <p className="mt-0.5 text-sm text-zinc-500">Completed sprints and what they delivered.</p>
              </div>
              <HistoryView sprints={sprints} projects={projects} tasks={visibleTasks} />
            </div>
          )}
        </div>
      </main>

      {/* Dialogs */}
      {createFor !== null && (
        <CreateDialog
          projects={projects}
          projectId={createFor}
          members={members}
          epics={epics}
          sprints={sprints}
          currentUser={currentUser}
          labelSuggestions={allLabels}
          pending={isPending}
          onClose={() => setCreateFor(null)}
          onCreate={submitCreateTask}
        />
      )}

      {createSprintFor !== null && boardProject && (
        <SprintDialog
          project={boardProject}
          pending={isPending}
          onClose={() => setCreateSprintFor(null)}
          onCreate={submitCreateSprint}
        />
      )}

      {createEpicOpen && (
        <EpicDialog
          projects={projects}
          pending={isPending}
          onClose={() => setCreateEpicOpen(false)}
          onCreate={submitCreateEpic}
        />
      )}

      {(createProjectOpen || editProject !== null) && (
        <ProjectDialog
          teams={teams}
          canManageTeam={canManageTeam}
          edit={editProject}
          pending={isPending}
          onClose={() => {
            setCreateProjectOpen(false)
            setEditProject(null)
          }}
          onCreate={submitCreateProject}
          onUpdate={submitUpdateProject}
        />
      )}

      {createTeamOpen && (
        <TeamDialog pending={isPending} onClose={() => setCreateTeamOpen(false)} onCreate={submitCreateTeam} />
      )}

      {selected && selectedProject && (
        <TaskDialog
          task={selected}
          project={selectedProject}
          members={members}
          epics={epics}
          sprints={sprints}
          currentUser={currentUser}
          canEdit={canEditTask(selected)}
          labelSuggestions={allLabels}
          subtasks={childrenOf(selected.id)}
          pending={isPending}
          onClose={() => setSelected(null)}
          onDelete={removeTask}
          onUpdate={(patch) => saveTask(selected.id, patch)}
          onAddSubtask={(title) => submitCreateSubtask(selected, title)}
          onToggleSubtask={toggleSubtask}
          onDeleteSubtask={removeSubtask}
        />
      )}
    </div>
  )
}

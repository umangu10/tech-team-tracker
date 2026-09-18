'use client'

import { useEffect, useState, useTransition } from 'react'
import type { DragEvent, ReactNode } from 'react'
import {
  AlertCircle,
  Bell,
  CalendarDays,
  Check,
  CircleDot,
  FolderKanban,
  FolderOpen,
  History,
  Layers3,
  ListChecks,
  Menu,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Settings2,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  X,
  Zap,
} from 'lucide-react'

import { addTaskComment, createTask, deleteTask, getTaskDetails, updateTask } from '@/app/actions/tasks'
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
      className={`flex shrink-0 items-center justify-center rounded-full ${color}`}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      title={name}
    >
      {initials(name)}
    </div>
  )
}

function Metric({ label, count }: { label: string; count: number }) {
  return (
    <div className="rounded-lg border border-[#e3e8ef] bg-[#f4f6fb] px-3 py-2">
      <div className="text-lg font-bold leading-tight text-slate-800">{count}</div>
      <div className="text-[10px] leading-tight text-slate-400">{label}</div>
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
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-[#e3e8ef] bg-white/60 px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#eef2f8] text-[#1f6feb]">
        {icon}
      </div>
      <div>
        <div className="text-sm font-medium text-slate-800">{title}</div>
        <div className="mt-0.5 text-xs text-slate-400">{hint}</div>
      </div>
      {action && (
        <button className={btnPrimary} onClick={action.onClick}>
          <Plus size={13} /> {action.label}
        </button>
      )}
    </div>
  )
}

function Dialog({
  title,
  onClose,
  children,
  wide = false,
  fullScreen = false,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
  fullScreen?: boolean
}) {
  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/30 ${fullScreen ? 'p-0' : 'p-4'}`}
      onClick={onClose}
    >
      <div
        className={`flex w-full flex-col overflow-hidden bg-white shadow-xl ${
          fullScreen ? 'h-full max-h-none max-w-none rounded-none' : `max-h-[90vh] ${wide ? 'max-w-2xl' : 'max-w-md'} rounded-xl`
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#e3e8ef] px-5 py-3">
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-600" aria-label="Close dialog">
            <X size={16} />
          </button>
        </div>
        <div className={`min-h-0 overflow-y-auto ${fullScreen ? 'px-6 py-6 lg:px-12 lg:py-8' : 'px-5 py-4'}`}>{children}</div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</span>
      {children}
    </label>
  )
}

/* ---------- Task row / compact task ---------- */

function TaskRow({
  task,
  currentUser,
  members,
  canEdit,
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
  onSelect: (task: TaskWithProject) => void
  onStatus: (task: TaskWithProject, status: string) => void
  onDelete: (task: TaskWithProject) => void
  sprintOptions?: { id: string; name: string }[]
  onAssignSprint?: (task: TaskWithProject, sprintId: string) => void
}) {
  const assignee = members.find((m) => m.userId === task.assigneeId)
  return (
    <div
      onClick={() => onSelect(task)}
      className="flex cursor-pointer items-center gap-2 rounded-lg border border-[#e3e8ef] bg-white px-3 py-2 transition-colors hover:border-[#1f6feb]/40 hover:bg-[#f6f8fd]"
    >
      <span className="shrink-0 rounded bg-[#eef2f8] px-1.5 py-0.5 text-[10px] font-bold text-[#1f6feb]">
        {task.key}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium text-slate-800">{task.title}</div>
        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-400">
          <span className="truncate">{task.projectName}</span>
          {task.priority !== 'Medium' && (
            <span className={`rounded px-1 py-px font-medium ${priorityColors[task.priority] ?? 'bg-slate-100 text-slate-500'}`}>
              {task.priority}
            </span>
          )}
          {task.dueDate && (
            <span className="flex items-center gap-1">
              <CalendarDays size={11} /> {formatDate(task.dueDate)}
            </span>
          )}
        </div>
      </div>
      {assignee ? (
        <Avatar name={assignee.displayName || '?'} color={assignee.avatarColor} size={22} />
      ) : (
        <div
          className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-slate-100 text-[8px] text-slate-400"
          title="Unassigned"
        >
          —
        </div>
      )}
      {sprintOptions && onAssignSprint && (
        <select
          value=""
          className="max-w-[110px] rounded border border-[#e3e8ef] bg-white px-1 py-1 text-[10px] text-slate-500 outline-none focus:border-[#1f6feb]"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            if (e.target.value) onAssignSprint(task, e.target.value)
          }}
        >
          <option value="">→ Sprint</option>
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
          className="rounded border border-[#e3e8ef] bg-white px-1.5 py-1 text-[10px] text-slate-500 outline-none focus:border-[#1f6feb]"
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
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusStyles[task.status] ?? 'bg-slate-100 text-slate-500'}`}>
          {task.status}
        </span>
      )}
      {canEdit && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete(task)
          }}
          className="shrink-0 text-slate-300 hover:text-red-500"
          title="Delete task"
        >
          <Trash2 size={13} />
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
  onSelect,
  onStatus,
  onDelete,
}: {
  task: TaskWithProject
  members: TeamMember[]
  currentUser: TeamMember
  canManage: boolean
  onSelect: (task: TaskWithProject) => void
  onStatus: (task: TaskWithProject, status: string) => void
  onDelete: (task: TaskWithProject) => void
}) {
  const assignee = members.find((m) => m.userId === task.assigneeId)
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
      className={`group cursor-pointer rounded-md border border-[#e3e8ef] bg-white p-2 transition-colors hover:border-[#1f6feb]/40 hover:bg-[#f6f8fd] ${dragging ? 'opacity-40' : ''} ${canManage ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
    >
      <div className="flex items-center gap-1.5">
        <span className="shrink-0 rounded bg-[#eef2f8] px-1 py-px text-[9px] font-bold text-[#1f6feb]">{task.key}</span>
        <span className={`ml-auto rounded px-1 py-px text-[9px] font-medium ${priorityColors[task.priority] ?? 'bg-slate-100 text-slate-500'}`}>
          {task.priority}
        </span>
      </div>
      <div className="mt-1 line-clamp-2 text-[11px] font-medium leading-tight text-slate-800">{task.title}</div>
      {task.dueDate && (
        <div className="mt-1 flex items-center gap-1 text-[9px] text-slate-400">
          <CalendarDays size={10} /> {formatDate(task.dueDate)}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between">
        {assignee ? (
          <Avatar name={assignee.displayName || '?'} color={assignee.avatarColor} size={18} />
        ) : (
          <div className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-slate-100 text-[7px] text-slate-400">—</div>
        )}
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {task.status !== 'Done' && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onStatus(task, 'Done')
              }}
              className="rounded p-1 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"
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
              className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
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
      className={`flex flex-col gap-2 rounded-lg border bg-[#f6f7fb] p-2 transition-colors ${
        over ? 'border-[#1f6feb] bg-[#eef4ff]' : 'border-[#e3e8ef]'
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
      <div className="flex items-center gap-2 px-1">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusStyles[label] ?? 'bg-slate-100 text-slate-500'}`}>
          {label}
        </span>
        <span className="text-[10px] text-slate-400">{tasks.length}</span>
      </div>
      <div className="flex min-h-[80px] flex-col gap-2">
        {tasks.length === 0 ? (
          <div className="flex h-16 items-center justify-center rounded-md border border-dashed border-[#e3e8ef] text-[10px] text-slate-300">
            {onDrop ? 'Drop tasks here' : 'No tasks'}
          </div>
        ) : (
          tasks.map((task) => (
            <CompactTask
              key={task.id}
              task={task}
              members={members}
              currentUser={currentUser}
              canManage={canManage(task)}
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
  planned: 'bg-slate-300',
  active: 'bg-emerald-500',
  completed: 'bg-slate-400',
}

const statusStyles: Record<string, string> = {
  'To do': 'bg-blue-50 text-blue-600',
  'In progress': 'bg-amber-50 text-amber-600',
  Review: 'bg-purple-50 text-purple-600',
  Done: 'bg-emerald-50 text-emerald-600',
  Backlog: 'bg-slate-100 text-slate-500',
}

const priorityColors: Record<string, string> = {
  Urgent: 'bg-red-50 text-red-600',
  High: 'bg-orange-50 text-orange-600',
  Medium: 'bg-yellow-50 text-yellow-600',
  Low: 'bg-blue-50 text-blue-600',
}

const inputCls =
  'w-full rounded-md border border-[#e3e8ef] bg-white px-2.5 py-1.5 text-xs outline-none focus:border-[#1f6feb] focus:ring-2 focus:ring-[#1f6feb]/15'
const btnPrimary =
  'flex items-center gap-1.5 rounded-md bg-[#1f6feb] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1963d8] disabled:opacity-50 disabled:cursor-not-allowed'
const btnGhost =
  'flex items-center gap-1.5 rounded-md border border-[#e3e8ef] bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-[#f4f6fb]'

function SprintBoard({
  project,
  tasks,
  members,
  sprints,
  currentUser,
  canManage,
  canEditTask,
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
    <div className="flex flex-col gap-3">
      <div className="surface-card flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#1f6feb] to-[#3b82f6] text-xs font-bold text-white shadow-sm">
            {project.key}
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-800">{project.name}</div>
            <div className="text-[10px] text-slate-400">
              {teamMembers.length} members · {boardProjectTasks.length} tasks
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex -space-x-1">
            {teamMembers.slice(0, 5).map((m) => (
              <div key={m.id} className="rounded-full ring-2 ring-white">
                <Avatar name={m.displayName || '?'} color={m.avatarColor} size={24} />
              </div>
            ))}
            {teamMembers.length > 5 && (
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[9px] text-slate-500 ring-2 ring-white">
                +{teamMembers.length - 5}
              </div>
            )}
          </div>
          <button className={btnPrimary} onClick={onCreateSprint} disabled={!canManage}>
            <Plus size={13} /> New sprint
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => setSelection(null)}
          className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
            !showSprint ? 'bg-[#1f6feb] text-white' : 'bg-white text-slate-500 border border-[#e3e8ef] hover:bg-[#f4f6fb]'
          }`}
        >
          Backlog
        </button>
        {projectSprints.map((s) => (
          <button
            key={s.id}
            onClick={() => setSelection(s.id)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
              selection === s.id ? 'bg-[#1f6feb] text-white' : 'bg-white text-slate-500 border border-[#e3e8ef] hover:bg-[#f4f6fb]'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${sprintDot[s.status] ?? 'bg-slate-300'}`} />
            {s.name}
            <span className={`text-[9px] ${selection === s.id ? 'text-white/70' : 'text-slate-400'}`}>
              {s.status === 'active' ? '· active' : s.status === 'completed' ? '· done' : ''}
            </span>
          </button>
        ))}
      </div>

{selectedSprint && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[#e3e8ef] bg-white px-3 py-2 text-[11px] text-slate-500">
            <Layers3 size={13} className="text-[#1f6feb]" />
            <span className="font-medium text-slate-700">{selectedSprint.name}</span>
            {selectedSprint.goal && <span className="truncate text-slate-400">· {selectedSprint.goal}</span>}
            <span className="ml-auto shrink-0">
              {doneCount}/{sprintTasks.length} done
            </span>
            <div className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-[#e3e8ef]">
              <div
                className="h-full rounded-full bg-[#1f6feb] transition-all"
                style={{ width: sprintTasks.length ? `${Math.round((doneCount / sprintTasks.length) * 100)}%` : '0%' }}
              />
            </div>
            {selectedSprint.status === 'planned' && (
              <button
                className="shrink-0 rounded-md bg-[#1f6feb] px-2.5 py-1 text-[10px] font-medium text-white hover:bg-[#1963d8]"
                onClick={() => onStartSprint(selectedSprint)}
              >
                Start sprint
              </button>
            )}
            {selectedSprint.status === 'active' && (
              <button
                className="shrink-0 inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-2.5 py-1 text-[10px] font-medium text-white hover:bg-emerald-700"
                onClick={() => onCompleteSprint(selectedSprint)}
              >
                <Check size={12} /> End sprint
              </button>
            )}
            {canManage && selectedSprint.status !== 'active' && (
              <button
                className="shrink-0 text-slate-300 hover:text-red-500"
                onClick={() => onDeleteSprint(selectedSprint)}
                title="Delete sprint"
              >
                <Trash2 size={13} />
              </button>
            )}
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
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {epics.map((epic) => {
        const project = projects.find((p) => p.id === epic.projectId)
        const count = tasks.filter((t) => t.epicId === epic.id).length
        const manage = canManageEpic(epic)
        return (
          <div key={epic.id} className="flex flex-col gap-2 rounded-lg border border-[#e3e8ef] bg-white p-4">
            <div className="flex items-center gap-2">
              {project && (
                <span className="rounded bg-[#eef2f8] px-1.5 py-0.5 text-[10px] font-bold text-[#1f6feb]">{project.key}</span>
              )}
              <h3 className="truncate text-sm font-semibold text-slate-800">{epic.title}</h3>
              {manage && (
                <button
                  onClick={() => onDelete(epic)}
                  className="ml-auto text-slate-300 hover:text-red-500"
                  title="Delete epic"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            {epic.description && (
              <p className="line-clamp-2 text-xs leading-relaxed text-slate-500">{epic.description}</p>
            )}
            <div className="mt-auto flex items-center gap-2 border-t border-[#e3e8ef] pt-2">
              <span className="flex items-center gap-1 text-[10px] text-slate-400">
                <ListChecks size={11} /> {count} tasks
              </span>
              {manage ? (
                <select
                  value={epic.status}
                  onChange={(e) => onChangeStatus(epic, e.target.value)}
                  className="ml-auto rounded border border-[#e3e8ef] bg-white px-1.5 py-1 text-[10px] text-slate-500 outline-none focus:border-[#1f6feb]"
                >
                  {EPIC_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{epic.status}</span>
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
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {projects.map((project) => {
        const team = teams.find((t) => t.id === project.teamId)
        const lead = members.find((m) => m.userId === project.leadUserId)
        const count = tasks.filter((t) => t.projectId === project.id).length
        const manage = canManageProject(project)
        return (
          <div key={project.id} className="group flex flex-col gap-2 rounded-lg border border-[#e3e8ef] bg-white p-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#1f6feb]/10 text-[10px] font-bold text-[#1f6feb]">
                {project.key}
              </div>
              <h3 className="truncate text-sm font-semibold text-slate-800">{project.name}</h3>
              {manage && (
                <div className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => onEdit(project)}
                    className="rounded p-1 text-slate-400 hover:bg-[#f4f6fb] hover:text-[#1f6feb]"
                    title="Edit project"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => onDelete(project)}
                    className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
                    title="Delete project"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </div>
            {project.description && (
              <p className="line-clamp-2 text-xs leading-relaxed text-slate-500">{project.description}</p>
            )}
            <div className="mt-auto flex items-center gap-3 border-t border-[#e3e8ef] pt-2 text-[10px] text-slate-400">
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
          <div key={team.id} className="rounded-lg border border-[#e3e8ef] bg-white p-4">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-800">{team.name}</h3>
              <span className="rounded-full bg-[#eef2f8] px-2 py-0.5 text-[10px] text-slate-500">
                {teamMembers.length} members
              </span>
              {teamMembers.length === 1 && teamMembers[0]?.id === currentUser.id && teamMembers[0]?.userId === currentUser.userId && teamMembers[0]?.role !== 'admin' && canCreateTeam && (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-600">You are not an admin — created by lead</span>
              )}
            </div>
            {team.description && <p className="mt-1 text-xs text-slate-500">{team.description}</p>}
            <div className="mt-3 flex flex-col gap-1.5">
              {teamMembers.map((m) => (
                <div key={m.id} className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-[#f4f6fb]">
                  <Avatar name={m.displayName || '?'} color={m.avatarColor} size={24} />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700">
                    {m.displayName}
                    {m.userId === currentUser.userId && <span className="ml-1 text-[10px] text-slate-400">(you)</span>}
                  </span>
                  {admin ? (
                    <div className="flex items-center gap-1.5">
                      <select
                        value={m.role}
                        onChange={(e) => onChangeRole(m, e.target.value)}
                        className="rounded-md border border-[#e3e8ef] bg-white px-2 py-1 text-[10px] font-medium text-slate-600 outline-none focus:border-[#1f6feb] focus:ring-2 focus:ring-[#1f6feb]/15"
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
                          className="flex items-center gap-1 rounded-md border border-transparent px-2 py-1 text-[10px] font-medium text-slate-400 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                        >
                          <UserMinus size={12} /> Remove
                        </button>
                      )}
                    </div>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">{m.role}</span>
                  )}
                </div>
              ))}
            </div>
{admin && (
                <div className="mt-3 border-t border-[#e7ebf3] pt-3">
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
                        <UserPlus size={13} /> Add
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
                      <UserPlus size={13} /> Add member
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
          <div key={sprint.id} className="rounded-lg border border-[#e3e8ef] bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#1f6feb]/10 text-[10px] font-bold text-[#1f6feb]">
                {project?.key ?? '—'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-800">{sprint.name}</div>
                <div className="text-[10px] text-slate-400">
                  {project?.name ?? 'Unknown project'} · {formatDate(sprint.completedAt)}
                </div>
              </div>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
                Ended
              </span>
            </div>
            {sprint.goal && <p className="mt-2 text-xs text-slate-500">{sprint.goal}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-slate-500">
              <span>
                <Check size={11} className="mr-1 inline text-emerald-500" />
                <b className="text-slate-700">{delivered.length}</b> delivered
              </span>
              <span>
                <Zap size={11} className="mr-1 inline text-amber-500" />
                <b className="text-slate-700">{points}</b> pts completed
              </span>
              <span>
                <CircleDot size={11} className="mr-1 inline text-slate-400" />
                <b className="text-slate-700">{sprintTasks.length - delivered.length}</b> not completed
              </span>
            </div>
          </div>
        )
      })}
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

  const selectedProject = projects.find((p) => p.id === project)
  const teamMembers = selectedProject ? members.filter((m) => m.teamId === selectedProject.teamId) : []
  const projectEpics = epics.filter((e) => e.projectId === project)
  const projectSprints = sprints.filter((s) => s.projectId === project && s.status !== 'completed')

  if (projects.length === 0) {
    return (
      <Dialog title="Create task" onClose={onClose}>
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <FolderOpen size={28} className="text-slate-300" />
          <p className="text-xs leading-relaxed text-slate-500">
            You need at least one project before creating tasks. Create a project first, then come back here.
          </p>
          <button className={btnGhost} onClick={onClose}>
            Close
          </button>
        </div>
      </Dialog>
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
    })
  }

  return (
    <Dialog title="Create task" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Field label="Project">
          <select value={project} onChange={(e) => setProject(e.target.value)} className={inputCls}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.key})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Title">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="e.g. Fix login redirect"
            className={inputCls}
          />
        </Field>
        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="What needs to be done?"
            className={inputCls + ' resize-none'}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
              {TASK_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Priority">
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className={inputCls}>
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Area">
            <select value={area} onChange={(e) => setArea(e.target.value)} className={inputCls}>
              {AREAS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Points">
            <select value={points} onChange={(e) => setPoints(e.target.value)} className={inputCls}>
              {POINTS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Assignee">
            <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className={inputCls}>
              {teamMembers.map((m) => (
                <option key={m.id} value={m.userId}>
                  {m.displayName}
                  {m.userId === currentUser.userId ? ' (you)' : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Due date">
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Epic">
            <select value={epicId} onChange={(e) => setEpicId(e.target.value)} className={inputCls}>
              <option value="">No epic</option>
              {projectEpics.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Sprint">
            <select value={sprintId} onChange={(e) => setSprintId(e.target.value)} className={inputCls}>
              <option value="">Backlog</option>
              {projectSprints.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-[#e3e8ef] pt-3">
          <button className={btnGhost} onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button className={btnPrimary} onClick={submit} disabled={pending || !title.trim()}>
            {pending ? <CircleDot className="animate-spin" size={13} /> : <Plus size={13} />}
            {pending ? 'Creating…' : 'Create task'}
          </button>
        </div>
      </div>
    </Dialog>
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
    <Dialog title="New sprint" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="rounded-md bg-[#f4f6fb] px-3 py-2 text-[10px] text-slate-400">
          Creating sprint for <span className="font-medium text-slate-600">{project.name} ({project.key})</span>
        </p>
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
        <Field label="Goal">
          <input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="What will this sprint deliver?" className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts">
            <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Ends">
            <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={inputCls} />
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-[#e3e8ef] pt-3">
          <button className={btnGhost} onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button className={btnPrimary} onClick={submit} disabled={pending || !name.trim()}>
            {pending ? <CircleDot className="animate-spin" size={13} /> : <Plus size={13} />}
            {pending ? 'Creating…' : 'Create sprint'}
          </button>
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
      <Dialog title="Create epic" onClose={onClose}>
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <FolderOpen size={28} className="text-slate-300" />
          <p className="text-xs leading-relaxed text-slate-500">You need at least one project before creating epics.</p>
          <button className={btnGhost} onClick={onClose}>
            Close
          </button>
        </div>
      </Dialog>
    )
  }

  const submit = () => {
    if (!title.trim() || !projectId) return
    onCreate({ projectId, title: title.trim(), description: description.trim() || undefined })
  }

  return (
    <Dialog title="Create epic" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Field label="Project">
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={inputCls}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.key})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Title">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="e.g. Payments overhaul"
            className={inputCls}
          />
        </Field>
        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="What does this epic cover?"
            className={inputCls + ' resize-none'}
          />
        </Field>
        <div className="flex justify-end gap-2 border-t border-[#e3e8ef] pt-3">
          <button className={btnGhost} onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button className={btnPrimary} onClick={submit} disabled={pending || !title.trim()}>
            {pending ? <CircleDot className="animate-spin" size={13} /> : <Plus size={13} />}
            {pending ? 'Creating…' : 'Create epic'}
          </button>
        </div>
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
    <Dialog title={isEdit ? 'Edit project' : 'Create project'} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Field label="Name">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Web Platform" className={inputCls} />
        </Field>
        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="What is this project about?"
            className={inputCls + ' resize-none'}
          />
        </Field>
        {isEdit ? (
          <Field label="Key">
            <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="e.g. WEB" className={inputCls + ' uppercase'} />
          </Field>
        ) : (
          <Field label="Team">
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className={inputCls}>
              <option value="">Teams you manage or lead</option>
              {manageTeams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className="flex justify-end gap-2 border-t border-[#e3e8ef] pt-3">
          <button className={btnGhost} onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button className={btnPrimary} onClick={submit} disabled={pending || !name.trim()}>
            {pending ? <CircleDot className="animate-spin" size={13} /> : <Check size={13} />}
            {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create project'}
          </button>
        </div>
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
    <Dialog title="Create team" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Field label="Team name">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="e.g. Platform Engineering"
            className={inputCls}
          />
        </Field>
        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="What does this team own?"
            className={inputCls + ' resize-none'}
          />
        </Field>
        <div className="flex justify-end gap-2 border-t border-[#e3e8ef] pt-3">
          <button className={btnGhost} onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button className={btnPrimary} onClick={submit} disabled={pending || !name.trim()}>
            {pending ? <CircleDot className="animate-spin" size={13} /> : <Plus size={13} />}
            {pending ? 'Creating…' : 'Create team'}
          </button>
        </div>
      </div>
    </Dialog>
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
  pending,
  onClose,
  onDelete,
  onUpdate,
}: {
  task: TaskWithProject
  project: Project
  members: TeamMember[]
  epics: Epic[]
  sprints: Sprint[]
  currentUser: TeamMember
  canEdit: boolean
  pending: boolean
  onClose: () => void
  onDelete: (task: TaskWithProject) => void
  onUpdate: (patch: Parameters<typeof updateTask>[1]) => void
}) {
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
  const [description, setDescription] = useState(task.description)
  const [editingDescription, setEditingDescription] = useState(false)
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
    <Dialog title="Task details" onClose={onClose} fullScreen>
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="rounded bg-[#eef2f8] px-1.5 py-0.5 text-[10px] font-bold text-[#1f6feb]">{task.key}</span>
              <span className="text-[10px] text-slate-400">
                {project.key} · {project.name}
              </span>
              {task.blocked && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] text-red-600">Blocked</span>}
            </div>
            <h3 className="mt-1 text-base font-semibold text-slate-800">{task.title}</h3>
            <div className="mt-1 flex items-center gap-3 text-[10px] text-slate-400">
              <span>
                Reporter: {reporter?.displayName ?? '—'}
              </span>
              <span>
                Assignee: {assignee?.displayName ?? 'Unassigned'}
              </span>
              <span>Created {formatDate(task.createdAt)}</span>
            </div>
          </div>
          {canEdit && (
            <button
              onClick={() => onDelete(task)}
              className="shrink-0 rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-red-50 hover:text-red-500"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>

        {dialError && (
          <div className="flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-[11px] text-red-600">
            <AlertCircle size={12} /> {dialError}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Status">
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value)
                onUpdate({ status: e.target.value })
              }}
              className={inputCls}
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
              className={inputCls}
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
              className={inputCls}
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
              className={inputCls}
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
              className={inputCls}
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
              className={inputCls}
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
              className={inputCls}
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
              className={inputCls}
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
            <label className="flex cursor-pointer items-center gap-2 pb-1.5 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={blocked}
                disabled={!canEdit}
                onChange={(e) => {
                  setBlocked(e.target.checked)
                  onUpdate({ blocked: e.target.checked })
                }}
                className="h-3.5 w-3.5 accent-[#1f6feb]"
              />
              Blocked
            </label>
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Description</span>
            {canEdit && !editingDescription && (
              <button className="flex items-center gap-1 text-[10px] text-[#1f6feb] hover:underline" onClick={() => setEditingDescription(true)}>
                <Pencil size={10} /> Edit
              </button>
            )}
          </div>
          {editingDescription ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                autoFocus
                className={inputCls + ' resize-none'}
              />
              <div className="flex justify-end gap-2">
                <button className="rounded-md px-2 py-1 text-[10px] text-slate-400 hover:bg-[#f4f6fb]" onClick={() => {
                  setDescription(task.description)
                  setEditingDescription(false)
                }}>
                  Cancel
                </button>
                <button className="rounded-md bg-[#1f6feb] px-2 py-1 text-[10px] font-medium text-white hover:bg-[#1963d8]" onClick={saveDescription}>
                  Save
                </button>
              </div>
            </div>
          ) : description ? (
            <p className="whitespace-pre-wrap rounded-md bg-[#f4f6fb] px-3 py-2 text-xs leading-relaxed text-slate-600">
              {description}
            </p>
          ) : (
            <p className="rounded-md bg-[#f4f6fb] px-3 py-2 text-xs text-slate-300">No description.</p>
          )}
        </div>

        <div className="border-t border-[#e3e8ef] pt-3">
          <button
            className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-[#1f6feb]"
            onClick={() => setShowComments((v) => !v)}
          >
            <MessageSquare size={13} /> Comments
            {comments.length > 0 && <span className="rounded-full bg-[#eef2f8] px-1.5 py-px text-[10px]">{comments.length}</span>}
          </button>
          {showComments && (
            <div className="mt-3 flex flex-col gap-3">
              {canEdit && (
                <div className="flex gap-2">
                  <input
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void addComment()}
                    placeholder="Add a comment…"
                    className={inputCls}
                  />
                  <button className="shrink-0 rounded-md bg-[#1f6feb] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1963d8]" onClick={() => void addComment()} disabled={!commentText.trim()}>
                    Add
                  </button>
                </div>
              )}
              {comments.length === 0 ? (
                <p className="text-[11px] text-slate-300">No comments yet.</p>
              ) : (
                <div className="flex max-h-48 flex-col gap-2 overflow-y-auto pr-1">
                  {comments.map((c) => (
                    <div key={c.id} className="rounded-md border border-[#e3e8ef] px-3 py-2">
                      <div className="text-[10px] font-medium text-slate-500">
                        {c.author ?? 'Team member'}
                        <span className="ml-2 font-normal text-slate-300">{formatDate(c.createdAt)}</span>
                      </div>
                      <p className="mt-0.5 whitespace-pre-wrap text-xs text-slate-600">{c.body}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex min-h-[18px] items-center justify-between border-t border-[#e3e8ef] pt-2 text-[10px] text-slate-300">
          {pending ? (
            <span className="flex items-center gap-1 text-[#1f6feb]">
              <CircleDot className="animate-spin" size={11} /> Saving…
            </span>
          ) : (
            <span>Updated {formatDate(task.updatedAt)}</span>
          )}
          <span className="text-slate-300">{task.area}</span>
        </div>
      </div>
    </Dialog>
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
  const navItems: { label: string; icon: ReactNode }[] = [
    { label: 'My work', icon: <ListChecks size={15} /> },
    { label: 'Sprint board', icon: <Layers3 size={15} /> },
    { label: 'Backlog', icon: <FolderKanban size={15} /> },
    { label: 'Epics', icon: <Zap size={15} /> },
    { label: 'Projects', icon: <FolderOpen size={15} /> },
    { label: 'Teams', icon: <Users size={15} /> },
    { label: 'Sprint history', icon: <History size={15} /> },
  ]
  return (
    <div className="flex h-full w-60 flex-col border-r border-[#e3e8ef] bg-white">
      <div className="flex items-center gap-2 border-b border-[#e3e8ef] px-4 py-3.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#1f6feb] to-[#3b82f6] text-sm font-bold text-white shadow-sm">
          O
        </div>
        <div>
          <div className="text-sm font-semibold leading-tight text-slate-800">Orbit</div>
          <div className="text-[10px] leading-tight text-slate-400">Engineering workspace</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 border-b border-[#e3e8ef] p-3">
        <Metric label="Projects" count={projectCount} />
        <Metric label="Active sprints" count={activeSprintCount} />
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        {navItems.map((item) => (
          <button
            key={item.label}
            onClick={() => onNavigate(item.label)}
            className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors ${
              active === item.label ? 'bg-[#eef4ff] text-[#1f6feb]' : 'text-slate-500 hover:bg-[#f4f6fb] hover:text-slate-700'
            }`}
          >
            {item.icon} {item.label}
          </button>
        ))}
      </nav>
      <div className="border-t border-[#e3e8ef] p-3">
        <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-[#f4f6fb]">
          <Avatar name={currentUser.displayName || '?'} color={currentUser.avatarColor} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium text-slate-800">{currentUser.displayName || 'Member'}</div>
            <div className="text-[10px] capitalize text-slate-400">{currentUser.role}</div>
          </div>
          <button onClick={onSignOut} title="Sign out" className="text-slate-300 hover:text-slate-600">
            <Settings2 size={15} />
          </button>
        </div>
        <button className={btnPrimary + ' mt-2 w-full justify-center'} onClick={onCreate}>
          <Plus size={13} /> Create task
        </button>
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

  const [active, setActive] = useState('My work')
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
    if (assigneeFilter === 'all') return true
    if (assigneeFilter === 'me') return task.assigneeId === currentUser.userId
    return task.assigneeId === assigneeFilter
  })

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
    const { dueDate, ...rest } = patch
    const taskPatch: Partial<Task> = { ...rest }
    if (dueDate !== undefined) taskPatch.dueDate = dueDate === null ? null : new Date(dueDate)
    refreshTask(id, taskPatch)
    startTransition(async () => {
      try {
        await updateTask(id, patch)
      } catch (e) {
        setError(formatError(e))
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
          sprintId: input.sprintId ?? null,
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
    .filter((task) => task.assigneeId === currentUser.userId)
    .sort((a, b) => statusRank(a.status) - statusRank(b.status))

  const activeSprintCount = sprints.filter((s) => s.status === 'active').length

  const boardProject = boardProjectId ? projectMap.get(boardProjectId) : undefined
  const boardTasks = boardProject ? scopedTasks.filter((t) => t.projectId === boardProject.id) : []

  const backlogTasks = scopedTasks.filter((t) => t.sprintId === null)
  const sprintOptionsFor = (task: TaskWithProject) =>
    sprints
      .filter((s) => s.projectId === task.projectId && (s.status === 'planned' || s.status === 'active'))
      .map((s) => ({ id: s.id, name: s.name }))

  const epicProjects = projects.filter((p) => epics.some((e) => e.projectId === p.id) || projects.length > 0)

  const selectedProject = selected ? projectMap.get(selected.projectId) : undefined

  /* ---------- render ---------- */

  return (
    <div className="flex h-screen bg-[#f4f6fb] font-sans text-slate-800">
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
        <div className="fixed inset-0 z-40 flex bg-black/40 md:hidden" onClick={() => setMobileOpen(false)}>
          <div className="h-full" onClick={(e) => e.stopPropagation()}>
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
        <header className="flex items-center gap-3 border-b border-[#e3e8ef] bg-white/90 px-4 py-2.5 backdrop-blur">
          <button className="text-slate-400 hover:text-slate-600 md:hidden" onClick={() => setMobileOpen(true)}>
            <Menu size={18} />
          </button>
          <div className="relative max-w-md flex-1">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by key, title, or project…"
              className="w-full rounded-md border border-[#e3e8ef] bg-[#f4f6fb] py-1.5 pl-8 pr-8 text-xs outline-none focus:border-[#1f6feb] focus:bg-white"
            />
            {query && (
              <button onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600">
                <X size={13} />
              </button>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {active === 'Sprint board' && boardProject && (
              <span className="hidden items-center gap-1.5 rounded-full bg-[#eef2f8] px-2.5 py-1 text-[10px] text-slate-500 sm:flex">
                <Check size={11} className="text-[#1f6feb]" /> {boardProject.name} · {boardProject.key}
              </span>
            )}
            {(active === 'Sprint board' || active === 'Backlog' || active === 'My work') && (
              <select
                value={assigneeFilter}
                onChange={(e) => setAssigneeFilter(e.target.value)}
                title="Filter tasks by assignee"
                className="hidden rounded-md border border-[#e3e8ef] bg-white px-2 py-1.5 text-[10px] text-slate-500 outline-none focus:border-[#1f6feb] sm:block"
              >
                <option value="all">All tasks</option>
                <option value="me">Only my tasks</option>
                {assigneeOptions.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            )}
            {isPending && (
              <span className="flex items-center gap-1.5 rounded-full bg-[#eef2f8] px-2.5 py-1 text-[10px] text-slate-400">
                <CircleDot size={11} className="animate-spin" /> Working…
              </span>
            )}
            <button className="rounded-md p-1.5 text-slate-400 hover:bg-[#f4f6fb] hover:text-slate-600" title="Notifications">
              <Bell size={15} />
            </button>
            <button className={btnPrimary} onClick={openCreate}>
              <Plus size={14} /> Create
            </button>
          </div>
        </header>

        {error && (
          <div className="flex items-center gap-2 border-b border-red-100 bg-red-50 px-4 py-2 text-xs text-red-600">
            <AlertCircle size={13} /> {error}
            <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">
              <X size={13} />
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {active === 'My work' && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-800">My work</h2>
                  <p className="text-xs text-slate-400">{myTasks.length} tasks assigned to you</p>
                </div>
                <button className={btnPrimary} onClick={openCreate}>
                  <Plus size={13} /> Create task
                </button>
              </div>
              {myTasks.length === 0 ? (
                <Empty
                  icon={<ListChecks size={30} />}
                  title="No tasks assigned to you"
                  hint="Create a task and assign yourself to see it here."
                  action={{ label: 'Create task', onClick: openCreate }}
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
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-800">Sprint board</h2>
                  <p className="text-xs text-slate-400">Drag tasks between columns to update status and sprint.</p>
                </div>
                {projects.length > 0 && (
                  <select
                    value={boardProjectId ?? ''}
                    onChange={(e) => setBoardProjectId(e.target.value || null)}
                    className={inputCls + ' w-auto'}
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
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-800">Backlog</h2>
                  <p className="text-xs text-slate-400">{backlogTasks.length} tasks without a sprint</p>
                </div>
                <button className={btnPrimary} onClick={openCreate}>
                  <Plus size={13} /> Add to backlog
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
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-800">Epics</h2>
                  <p className="text-xs text-slate-400">{epics.length} epics across {epicProjects.length} projects</p>
                </div>
                <button className={btnPrimary} onClick={() => setCreateEpicOpen(true)}>
                  <Plus size={13} /> Create epic
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
                  tasks={visibleTasks}
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
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-800">Projects</h2>
                  <p className="text-xs text-slate-400">{projects.length} projects</p>
                </div>
                {canCreateProject && (
                  <button className={btnPrimary} onClick={() => setCreateProjectOpen(true)}>
                    <Plus size={13} /> Create project
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
                  tasks={visibleTasks}
                  canManageProject={canManageProject}
                  onEdit={setEditProject}
                  onDelete={removeProject}
                />
              )}
            </div>
          )}

          {active === 'Teams' && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-800">Teams</h2>
                  <p className="text-xs text-slate-400">
                    {teams.length} teams · {members.length} members
                  </p>
                </div>
                <button className={btnPrimary} onClick={() => setCreateTeamOpen(true)}>
                  <Plus size={13} /> Create team
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
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-800">Sprint history</h2>
                <p className="text-xs text-slate-400">Completed sprints and what they delivered.</p>
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
          pending={isPending}
          onClose={() => setSelected(null)}
          onDelete={removeTask}
          onUpdate={(patch) => saveTask(selected.id, patch)}
        />
      )}
    </div>
  )
}

'use client'

import { useMemo, useState } from 'react'
import {
  Activity,
  AlertCircle,
  Archive,
  ArrowDown,
  ArrowUp,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  CircleDot,
  Clock3,
  Command,
  Filter,
  FolderKanban,
  Gauge,
  GitBranch,
  Layers3,
  ListChecks,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Tag,
  Users,
  X,
  Zap,
} from 'lucide-react'

type Task = {
  id: string
  title: string
  key: string
  type: 'Story' | 'Bug' | 'Task' | 'Incident'
  priority: 'High' | 'Medium' | 'Low'
  status: 'In progress' | 'To do' | 'Review' | 'Done'
  due: string
  project: string
  area: string
  points: number
  assignee: string
  initials: string
  color: string
  blocked?: boolean
}

const seedTasks: Task[] = [
  { id: '1', key: 'SEC-184', title: 'Rotate production signing keys', type: 'Incident', priority: 'High', status: 'In progress', due: 'Today', project: 'Platform Security', area: 'Security', points: 5, assignee: 'Alex Morgan', initials: 'AM', color: 'bg-sky-600', blocked: true },
  { id: '2', key: 'OPS-421', title: 'Add canary deploy step to payments', type: 'Task', priority: 'High', status: 'Review', due: 'Today', project: 'Developer Experience', area: 'DevOps', points: 3, assignee: 'You', initials: 'JD', color: 'bg-violet-600' },
  { id: '3', key: 'APP-982', title: 'Empty state for archived projects', type: 'Story', priority: 'Medium', status: 'In progress', due: 'Tomorrow', project: 'Core Console', area: 'Engineering', points: 3, assignee: 'You', initials: 'JD', color: 'bg-violet-600' },
  { id: '4', key: 'IT-208', title: 'Provision laptop for Nia Santos', type: 'Task', priority: 'Low', status: 'To do', due: 'Sep 12', project: 'IT Operations', area: 'IT', points: 2, assignee: 'You', initials: 'JD', color: 'bg-violet-600' },
  { id: '5', key: 'APP-976', title: 'Audit keyboard shortcut coverage', type: 'Bug', priority: 'Medium', status: 'Done', due: 'Sep 10', project: 'Core Console', area: 'Engineering', points: 2, assignee: 'Mina Patel', initials: 'MP', color: 'bg-amber-600' },
  { id: '6', key: 'OPS-414', title: 'Document rollback runbook', type: 'Task', priority: 'Low', status: 'To do', due: 'Sep 13', project: 'Developer Experience', area: 'DevOps', points: 3, assignee: 'You', initials: 'JD', color: 'bg-violet-600' },
]

const navItems = [
  { label: 'My work', icon: ListChecks },
  { label: 'Projects', icon: FolderKanban },
  { label: 'Sprint board', icon: CircleDot },
  { label: 'Backlog', icon: Archive },
  { label: 'Epics', icon: Layers3 },
]

const columns: Task['status'][] = ['To do', 'In progress', 'Review', 'Done']

export default function Page() {
  const [active, setActive] = useState('My work')
  const [tasks, setTasks] = useState(seedTasks)
  const [showCreate, setShowCreate] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [filter, setFilter] = useState('All')
  const [query, setQuery] = useState('')

  const visibleTasks = useMemo(() => tasks.filter((task) => {
    const matchesFilter = filter === 'All' || task.status === filter || task.area === filter
    const matchesQuery = `${task.key} ${task.title} ${task.project}`.toLowerCase().includes(query.toLowerCase())
    return matchesFilter && matchesQuery
  }), [tasks, filter, query])

  function createTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const title = String(data.get('title') || 'Untitled task')
    const newTask: Task = { id: crypto.randomUUID(), key: `APP-${1000 + tasks.length}`, title, type: String(data.get('type') || 'Task') as Task['type'], priority: 'Medium', status: 'To do', due: 'Sep 18', project: 'Core Console', area: 'Engineering', points: 3, assignee: 'You', initials: 'JD', color: 'bg-violet-600' }
    setTasks((current) => [newTask, ...current])
    setShowCreate(false)
  }

  function cycleStatus(task: Task) {
    const next = columns[(columns.indexOf(task.status) + 1) % columns.length]
    setTasks((current) => current.map((item) => item.id === task.id ? { ...item, status: next } : item))
    setSelectedTask({ ...task, status: next })
  }

  return (
    <main className="min-h-screen bg-[#f7f8fa] text-[#17202e]">
      <div className="flex min-h-screen">
        <aside className="hidden w-[250px] shrink-0 flex-col border-r border-[#e4e7ec] bg-white lg:flex">
          <div className="flex h-[72px] items-center gap-3 border-b border-[#edf0f3] px-6">
            <div className="flex size-8 items-center justify-center rounded-lg bg-[#2068f5] text-white"><Zap className="size-4 fill-current" /></div>
            <div><p className="text-sm font-semibold tracking-tight">Orbit</p><p className="text-[11px] text-[#7d8796]">Engineering workspace</p></div>
            <button aria-label="Switch workspace" className="ml-auto rounded-md p-1.5 text-[#8b96a5] hover:bg-[#f2f4f7]"><ChevronDown className="size-4" /></button>
          </div>
          <div className="px-3 pt-5">
            <button onClick={() => setShowCreate(true)} className="flex w-full items-center justify-center gap-2 rounded-md bg-[#2068f5] px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1959d5]"><Plus className="size-4" /> Create task <span className="ml-auto text-[10px] font-normal opacity-70">C</span></button>
          </div>
          <nav className="flex flex-col gap-1 px-3 pt-6">
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9aa3af]">Workspace</p>
            {navItems.map(({ label, icon: Icon }) => <button key={label} onClick={() => setActive(label)} className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition ${active === label ? 'bg-[#edf4ff] font-semibold text-[#1c5fd0]' : 'text-[#667181] hover:bg-[#f5f7f9]'}`}><Icon className="size-[17px]" />{label}{label === 'My work' && <span className="ml-auto rounded-full bg-[#2068f5] px-1.5 py-0.5 text-[10px] text-white">4</span>}</button>)}
            <p className="px-3 pb-2 pt-7 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9aa3af]">Your projects</p>
            {['Core Console', 'Developer Experience', 'Platform Security', 'IT Operations'].map((project, i) => <button key={project} onClick={() => setActive('Projects')} className="flex items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-[#667181] hover:bg-[#f5f7f9]"><span className={`size-2 rounded-full ${['bg-violet-500', 'bg-amber-500', 'bg-rose-500', 'bg-emerald-500'][i]}`} />{project}</button>)}
          </nav>
          <div className="mt-auto border-t border-[#edf0f3] p-4"><button className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm text-[#667181] hover:bg-[#f5f7f9]"><Settings2 className="size-4" /> Workspace settings</button><div className="mt-3 flex items-center gap-3 border-t border-[#edf0f3] pt-4"><div className="flex size-8 items-center justify-center rounded-full bg-[#e5d7ff] text-xs font-semibold text-[#7041ae]">JD</div><div className="min-w-0"><p className="truncate text-xs font-semibold">Jordan Davis</p><p className="truncate text-[11px] text-[#8b96a5]">Product engineer</p></div><MoreHorizontal className="ml-auto size-4 text-[#a0a8b3]" /></div></div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="flex h-[72px] items-center justify-between border-b border-[#e4e7ec] bg-white px-5 md:px-8">
            <div className="flex items-center gap-3"><button className="rounded-md p-2 text-[#667181] hover:bg-[#f2f4f7] lg:hidden"><Menu className="size-5" /></button><div className="relative hidden md:block"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#9ba4af]" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tasks, projects, people..." className="h-9 w-[280px] rounded-md border border-[#e2e6eb] bg-[#fbfcfd] pl-9 pr-12 text-xs outline-none placeholder:text-[#9ba4af] focus:border-[#8cb2fa]" /><kbd className="absolute right-2 top-1/2 -translate-y-1/2 rounded border border-[#e1e5ea] px-1.5 py-0.5 text-[10px] text-[#9ba4af]">⌘ K</kbd></div><button className="rounded-md p-2 text-[#667181] hover:bg-[#f2f4f7] md:hidden"><Search className="size-4" /></button></div>
            <div className="flex items-center gap-2"><button onClick={() => setShowNotifications((value) => !value)} className="relative rounded-md p-2 text-[#667181] hover:bg-[#f2f4f7]"><Bell className="size-[18px]" /><span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-[#ed5b67]" /></button><div className="mx-1 h-5 w-px bg-[#e4e7ec]" /><button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 rounded-md border border-[#dfe4ea] px-3 py-2 text-xs font-semibold text-[#455161] hover:bg-[#f7f8fa]"><Plus className="size-3.5" /> New</button></div>
            {showNotifications && <div className="absolute right-5 top-[62px] z-20 w-80 rounded-lg border border-[#e1e5ea] bg-white p-4 shadow-xl"><div className="flex items-center justify-between"><p className="text-sm font-semibold">Notifications</p><button onClick={() => setShowNotifications(false)}><X className="size-4 text-[#8b96a5]" /></button></div><div className="mt-4 flex gap-3 border-t border-[#edf0f3] pt-3"><div className="mt-1 size-2 rounded-full bg-[#ed5b67]" /><p className="text-xs leading-5 text-[#5c6675]">SEC-184 is blocked and needs your attention.</p></div></div>}
          </header>

          <div className="mx-auto max-w-[1480px] p-5 md:p-8">
            <div className="mb-7 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><div className="mb-3 flex items-center gap-2 text-xs text-[#87919f]"><span>Workspace</span><span>/</span><span className="text-[#4d5969]">{active}</span></div><h1 className="text-[28px] font-semibold tracking-[-0.03em] text-[#182334]">{active}</h1><p className="mt-1 text-sm text-[#7c8795]">Keep your work moving. Here&apos;s what needs your attention.</p></div><div className="flex items-center gap-2"><button className="flex items-center gap-2 rounded-md border border-[#dfe4ea] bg-white px-3 py-2 text-xs font-semibold text-[#566273] shadow-sm"><CalendarDays className="size-3.5" /> Sep 9 – Sep 15 <ChevronDown className="size-3.5 text-[#99a3af]" /></button><button className="rounded-md border border-[#dfe4ea] bg-white p-2 text-[#667181] shadow-sm"><MoreHorizontal className="size-4" /></button></div></div>

            {active === 'My work' && <MyWork tasks={visibleTasks} filter={filter} setFilter={setFilter} setSelectedTask={setSelectedTask} cycleStatus={cycleStatus} />}
            {active === 'Sprint board' && <Board tasks={visibleTasks} setSelectedTask={setSelectedTask} cycleStatus={cycleStatus} />}
            {active === 'Backlog' && <Backlog tasks={visibleTasks} setSelectedTask={setSelectedTask} />}
            {active === 'Epics' && <Epics />}
            {active === 'Projects' && <Projects />}
          </div>
        </section>
      </div>
      {showCreate && <CreateDialog onClose={() => setShowCreate(false)} onSubmit={createTask} />}
      {selectedTask && <TaskDialog task={selectedTask} onClose={() => setSelectedTask(null)} onCycle={() => cycleStatus(selectedTask)} />}
    </main>
  )
}

function MyWork({ tasks, filter, setFilter, setSelectedTask, cycleStatus }: { tasks: Task[]; filter: string; setFilter: (value: string) => void; setSelectedTask: (task: Task) => void; cycleStatus: (task: Task) => void }) {
  const mine = tasks.filter((task) => task.assignee === 'You')
  return <>
    <div className="grid gap-4 md:grid-cols-3"><Metric label="Assigned to me" value={mine.filter((task) => task.status !== 'Done').length.toString()} detail="4 active tasks" icon={ListChecks} tone="blue" /><Metric label="Due this week" value="3" detail="1 overdue" icon={CalendarDays} tone="amber" /><Metric label="Sprint progress" value="68%" detail="17 of 25 points" icon={Gauge} tone="green" /></div>
    <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_330px]">
      <div className="min-w-0 rounded-lg border border-[#e2e6eb] bg-white shadow-[0_1px_2px_rgba(16,24,40,.02)]"><div className="flex flex-col gap-4 border-b border-[#edf0f3] p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-sm font-semibold">Your tasks</h2><p className="mt-1 text-xs text-[#8a94a2]">Work assigned to you across all projects</p></div><div className="flex items-center gap-2"><select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-md border border-[#dfe4ea] bg-white px-2.5 py-2 text-xs text-[#647080] outline-none"><option>All</option><option>To do</option><option>In progress</option><option>Review</option><option>Engineering</option><option>DevOps</option></select><button className="rounded-md border border-[#dfe4ea] p-2 text-[#768291]"><Filter className="size-3.5" /></button></div></div><div className="divide-y divide-[#edf0f3]">{tasks.map((task) => <TaskRow key={task.id} task={task} onClick={() => setSelectedTask(task)} onAdvance={() => cycleStatus(task)} />)}</div></div>
      <div className="flex flex-col gap-6"><SprintCard /><ActivityCard /></div>
    </div>
  </>
}

function Metric({ label, value, detail, icon: Icon, tone }: { label: string; value: string; detail: string; icon: typeof ListChecks; tone: string }) { return <div className="rounded-lg border border-[#e2e6eb] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,.02)]"><div className="flex items-start justify-between"><div><p className="text-xs font-medium text-[#7b8694]">{label}</p><p className="mt-3 text-[26px] font-semibold tracking-[-0.04em]">{value}</p><p className="mt-1 text-[11px] text-[#8a94a2]">{detail}</p></div><div className={`rounded-md p-2 ${tone === 'blue' ? 'bg-[#edf4ff] text-[#2068f5]' : tone === 'amber' ? 'bg-[#fff6e6] text-[#c68117]' : 'bg-[#eaf8f0] text-[#218451]'}`}><Icon className="size-4" /></div></div></div> }
function TaskRow({ task, onClick, onAdvance }: { task: Task; onClick: () => void; onAdvance: () => void }) { return <div className="group flex cursor-pointer items-center gap-3 px-5 py-4 transition hover:bg-[#fafbfd]" onClick={onClick}><button onClick={(e) => { e.stopPropagation(); onAdvance() }} className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${task.status === 'Done' ? 'border-[#3aa76d] bg-[#3aa76d] text-white' : task.status === 'Review' ? 'border-[#cc8b18] text-[#cc8b18]' : 'border-[#cdd4dd] text-transparent hover:border-[#2068f5]'}`}>{task.status === 'Done' ? <Check className="size-3" /> : <CircleDot className="size-3" />}</button><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="text-[11px] font-semibold text-[#778291]">{task.key}</span>{task.blocked && <span className="flex items-center gap-1 text-[10px] font-medium text-[#d05c68]"><AlertCircle className="size-3" /> blocked</span>}</div><p className={`mt-1 truncate text-sm font-medium ${task.status === 'Done' ? 'text-[#9aa3af] line-through' : 'text-[#273242]'}`}>{task.title}</p><div className="mt-2 flex items-center gap-2"><span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${task.type === 'Bug' ? 'bg-[#fff0f0] text-[#cf5c64]' : task.type === 'Incident' ? 'bg-[#fff2e9] text-[#cf6c31]' : 'bg-[#f0f3f7] text-[#647080]'}`}>{task.type}</span><span className="text-[10px] text-[#9aa3af]">{task.project}</span></div></div><div className="hidden items-center gap-6 sm:flex"><div className="text-right"><p className="text-[10px] uppercase tracking-wide text-[#a0a8b3]">Due</p><p className={`mt-1 text-xs font-medium ${task.due === 'Today' ? 'text-[#cf5c64]' : 'text-[#657080]'}`}>{task.due}</p></div><div className={`flex size-7 items-center justify-center rounded-full text-[10px] font-semibold text-white ${task.color}`}>{task.initials}</div><button className="rounded p-1 text-[#a1aab5] opacity-0 transition group-hover:opacity-100"><MoreHorizontal className="size-4" /></button></div></div> }
function SprintCard() { return <div className="rounded-lg border border-[#e2e6eb] bg-white p-5"><div className="flex items-start justify-between"><div><p className="text-xs text-[#8a94a2]">Current sprint</p><h3 className="mt-1 text-sm font-semibold">Sprint 24 · Stabilize & ship</h3></div><button className="rounded p-1 text-[#8b96a5]"><MoreHorizontal className="size-4" /></button></div><div className="mt-5 flex items-end justify-between"><p className="text-2xl font-semibold tracking-[-0.04em]">68%</p><p className="text-[11px] text-[#7d8794]">6 days left</p></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-[#edf0f3]"><div className="h-full w-[68%] rounded-full bg-[#2c9c68]" /></div><div className="mt-4 flex justify-between text-[11px] text-[#8993a1]"><span>17 completed</span><span>25 total points</span></div><div className="mt-5 border-t border-[#edf0f3] pt-4"><div className="flex items-center justify-between text-xs"><span className="text-[#667181]">Team capacity</span><span className="font-semibold text-[#3f4b5b]">82%</span></div><div className="mt-2 flex gap-1"><div className="h-1.5 flex-1 rounded-full bg-[#2068f5]" /><div className="h-1.5 flex-1 rounded-full bg-[#2068f5]" /><div className="h-1.5 flex-1 rounded-full bg-[#2068f5]" /><div className="h-1.5 flex-1 rounded-full bg-[#dfe6f1]" /><div className="h-1.5 flex-1 rounded-full bg-[#dfe6f1]" /></div></div></div> }
function ActivityCard() { return <div className="rounded-lg border border-[#e2e6eb] bg-white p-5"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Recent activity</h3><Activity className="size-4 text-[#9ba4af]" /></div><div className="mt-5 flex flex-col gap-4"><ActivityItem initials="MP" text="moved APP-976 to Done" time="18m ago" color="bg-amber-600" /><ActivityItem initials="RK" text="commented on OPS-421" time="42m ago" color="bg-rose-600" /><ActivityItem initials="AM" text="flagged SEC-184 as blocked" time="1h ago" color="bg-sky-600" /></div></div> }
function ActivityItem({ initials, text, time, color }: { initials: string; text: string; time: string; color: string }) { return <div className="flex gap-3"><div className={`flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white ${color}`}>{initials}</div><div><p className="text-xs leading-4 text-[#5e6978]"><span className="font-semibold text-[#313c4b]">{initials === 'MP' ? 'Mina' : initials === 'RK' ? 'Ravi' : 'Alex'}</span> {text}</p><p className="mt-1 text-[10px] text-[#a0a8b3]">{time}</p></div></div> }

function Board({ tasks, setSelectedTask, cycleStatus }: { tasks: Task[]; setSelectedTask: (task: Task) => void; cycleStatus: (task: Task) => void }) { return <div className="rounded-lg border border-[#e2e6eb] bg-[#f0f2f5] p-4"><div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2 text-xs text-[#6f7a89]"><span className="font-semibold text-[#364253]">Sprint 24</span><span>·</span><span>17 / 25 points</span></div><button className="flex items-center gap-1.5 rounded-md border border-[#dfe4ea] bg-white px-3 py-2 text-xs font-semibold text-[#657080]"><Filter className="size-3.5" /> Filter</button></div><div className="grid gap-4 xl:grid-cols-4">{columns.map((column) => <div key={column} className="min-h-[420px] rounded-md bg-[#e6e9ee] p-2"><div className="flex items-center justify-between px-2 py-2"><div className="flex items-center gap-2"><span className={`size-2 rounded-full ${column === 'Done' ? 'bg-[#34a76c]' : column === 'Review' ? 'bg-[#d89321]' : column === 'In progress' ? 'bg-[#2068f5]' : 'bg-[#a7b0bb]'}`} /><p className="text-xs font-semibold text-[#596575]">{column}</p><span className="text-[10px] text-[#9aa3af]">{tasks.filter((task) => task.status === column).length}</span></div><MoreHorizontal className="size-4 text-[#99a3ae]" /></div><div className="flex flex-col gap-2">{tasks.filter((task) => task.status === column).map((task) => <div key={task.id} onClick={() => setSelectedTask(task)} className="cursor-pointer rounded-md border border-[#e0e4e9] bg-white p-3 shadow-sm hover:border-[#a9c5fa]"><div className="flex items-center justify-between"><span className="text-[10px] font-semibold text-[#7d8794]">{task.key}</span><button onClick={(e) => { e.stopPropagation(); cycleStatus(task) }} className="text-[#a0a8b3] hover:text-[#2068f5]"><CircleDot className="size-3.5" /></button></div><p className="mt-2 text-xs font-medium leading-5 text-[#2d3948]">{task.title}</p><div className="mt-3 flex items-center justify-between"><span className="rounded bg-[#f0f3f7] px-1.5 py-0.5 text-[10px] text-[#6c7786]">{task.points} pts</span><span className={`flex size-6 items-center justify-center rounded-full text-[9px] font-semibold text-white ${task.color}`}>{task.initials}</span></div></div>)}</div></div>)}</div></div> }
function Backlog({ tasks, setSelectedTask }: { tasks: Task[]; setSelectedTask: (task: Task) => void }) { return <div className="rounded-lg border border-[#e2e6eb] bg-white"><div className="flex items-center justify-between border-b border-[#edf0f3] p-5"><div><h2 className="text-sm font-semibold">Product backlog</h2><p className="mt-1 text-xs text-[#8a94a2]">Prioritize upcoming work before it enters a sprint.</p></div><button className="flex items-center gap-2 rounded-md bg-[#2068f5] px-3 py-2 text-xs font-semibold text-white"><Plus className="size-3.5" /> Add item</button></div><div className="divide-y divide-[#edf0f3]">{tasks.filter((task) => task.status === 'To do').map((task, index) => <div key={task.id} onClick={() => setSelectedTask(task)} className="flex cursor-pointer items-center gap-4 px-5 py-4 hover:bg-[#fafbfd]"><span className="w-5 text-xs text-[#a0a8b3]">{index + 1}</span><CircleDot className="size-4 text-[#a7b0bb]" /><div className="min-w-0 flex-1"><p className="text-sm font-medium text-[#2d3948]">{task.title}</p><p className="mt-1 text-[11px] text-[#8a94a2]">{task.key} · {task.project}</p></div><span className="hidden rounded bg-[#f0f3f7] px-2 py-1 text-[10px] text-[#687586] sm:block">{task.points} points</span><span className={`size-6 rounded-full text-center text-[9px] leading-6 font-semibold text-white ${task.color}`}>{task.initials}</span></div>)}</div></div> }
function Epics() { const epics = [{ name: 'Developer self-service', key: 'DX-12', progress: 72, tasks: '8 / 11', color: 'bg-violet-500' }, { name: 'Zero trust foundations', key: 'SEC-7', progress: 46, tasks: '5 / 14', color: 'bg-rose-500' }, { name: 'Console navigation refresh', key: 'APP-31', progress: 84, tasks: '16 / 19', color: 'bg-amber-500' }, { name: 'IT onboarding automation', key: 'IT-4', progress: 28, tasks: '3 / 12', color: 'bg-emerald-500' }]; return <div className="grid gap-4 md:grid-cols-2">{epics.map((epic) => <div key={epic.key} className="rounded-lg border border-[#e2e6eb] bg-white p-5"><div className="flex items-start justify-between"><div className="flex items-center gap-3"><span className={`size-3 rounded-full ${epic.color}`} /><div><p className="text-sm font-semibold">{epic.name}</p><p className="mt-1 text-[11px] text-[#8b96a5]">{epic.key} · Epic</p></div></div><MoreHorizontal className="size-4 text-[#9ba4af]" /></div><div className="mt-7 flex items-center justify-between text-xs"><span className="text-[#7d8794]">Progress</span><span className="font-semibold">{epic.progress}%</span></div><div className="mt-2 h-2 rounded-full bg-[#edf0f3]"><div className={`h-full rounded-full ${epic.color}`} style={{ width: `${epic.progress}%` }} /></div><div className="mt-4 flex items-center justify-between text-[11px] text-[#8b96a5]"><span>{epic.tasks} tasks complete</span><span>View epic <ArrowUp className="ml-1 inline size-3 rotate-45" /></span></div></div>)}</div> }
function Projects() { return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{['Core Console', 'Developer Experience', 'Platform Security', 'IT Operations'].map((name, index) => <div key={name} className="rounded-lg border border-[#e2e6eb] bg-white p-5"><div className={`flex size-10 items-center justify-center rounded-lg ${['bg-violet-100 text-violet-700', 'bg-amber-100 text-amber-700', 'bg-rose-100 text-rose-700', 'bg-emerald-100 text-emerald-700'][index]}`}><FolderKanban className="size-5" /></div><h3 className="mt-5 text-sm font-semibold">{name}</h3><p className="mt-1 text-xs text-[#8a94a2]">{['Customer-facing product', 'Platform tooling', 'Security & compliance', 'Internal technology'][index]}</p><div className="mt-5 flex gap-4 border-t border-[#edf0f3] pt-4 text-[11px] text-[#7d8794]"><span><b className="text-[#344052]">{[24, 18, 12, 9][index]}</b> open</span><span><b className="text-[#344052]">{[4, 3, 2, 1][index]}</b> members</span></div></div>)}</div> }

function CreateDialog({ onClose, onSubmit }: { onClose: () => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void }) { return <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#17202e]/30 p-4" onMouseDown={onClose}><form onSubmit={onSubmit} onMouseDown={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-xl border border-[#e1e5ea] bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#2068f5]">Create task</p><h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">Add work to your team</h2><p className="mt-1 text-sm text-[#7d8794]">Capture the next thing that needs to move forward.</p></div><button type="button" onClick={onClose} className="rounded-md p-1 text-[#8b96a5] hover:bg-[#f2f4f7]"><X className="size-4" /></button></div><div className="mt-6 flex flex-col gap-4"><label className="flex flex-col gap-2 text-xs font-semibold text-[#536071]">Task title<input name="title" required autoFocus placeholder="e.g. Add request tracing to API gateway" className="rounded-md border border-[#dfe4ea] px-3 py-2.5 text-sm font-normal outline-none focus:border-[#8cb2fa]" /></label><div className="grid gap-4 sm:grid-cols-2"><label className="flex flex-col gap-2 text-xs font-semibold text-[#536071]">Work type<select name="type" className="rounded-md border border-[#dfe4ea] bg-white px-3 py-2.5 text-sm font-normal outline-none"><option>Task</option><option>Story</option><option>Bug</option><option>Incident</option></select></label><label className="flex flex-col gap-2 text-xs font-semibold text-[#536071]">Assign to<select className="rounded-md border border-[#dfe4ea] bg-white px-3 py-2.5 text-sm font-normal outline-none"><option>You</option><option>Alex Morgan</option><option>Mina Patel</option></select></label></div></div><div className="mt-7 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-md px-3 py-2 text-xs font-semibold text-[#667181] hover:bg-[#f4f6f8]">Cancel</button><button className="rounded-md bg-[#2068f5] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1959d5]">Create task</button></div></form></div> }
function TaskDialog({ task, onClose, onCycle }: { task: Task; onClose: () => void; onCycle: () => void }) { return <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#17202e]/30 p-4" onMouseDown={onClose}><div onMouseDown={(e) => e.stopPropagation()} className="w-full max-w-2xl rounded-xl border border-[#e1e5ea] bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-[#edf0f3] px-6 py-4"><div className="flex items-center gap-3"><span className="text-xs font-semibold text-[#778291]">{task.key}</span><span className="rounded bg-[#f0f3f7] px-2 py-1 text-[10px] font-medium text-[#657080]">{task.type}</span></div><button onClick={onClose} className="rounded-md p-1 text-[#8b96a5] hover:bg-[#f2f4f7]"><X className="size-4" /></button></div><div className="p-6"><h2 className="text-xl font-semibold tracking-[-0.03em]">{task.title}</h2><div className="mt-6 grid gap-5 sm:grid-cols-3"><Detail label="Status"><button onClick={onCycle} className="flex items-center gap-2 rounded-md border border-[#dfe4ea] px-2.5 py-1.5 text-xs font-medium text-[#4f5c6d] hover:bg-[#f6f8fa]"><CircleDot className="size-3 text-[#2068f5]" />{task.status}<ChevronDown className="size-3 text-[#9ba4af]" /></button></Detail><Detail label="Assignee"><div className="flex items-center gap-2 text-xs"><span className={`flex size-6 items-center justify-center rounded-full text-[9px] font-semibold text-white ${task.color}`}>{task.initials}</span>{task.assignee}</div></Detail><Detail label="Due date"><div className="flex items-center gap-2 text-xs text-[#4f5c6d]"><CalendarDays className="size-3.5 text-[#7d8794]" />{task.due}</div></Detail></div><div className="mt-7 border-t border-[#edf0f3] pt-5"><p className="text-xs font-semibold text-[#536071]">Description</p><p className="mt-2 text-sm leading-6 text-[#788392]">Track the implementation, acceptance criteria, and handoff details for this piece of work. Add links to pull requests, runbooks, or incident context here.</p></div><div className="mt-6 flex items-center gap-5 border-t border-[#edf0f3] pt-5 text-xs text-[#7b8694]"><span className="flex items-center gap-1.5"><Tag className="size-3.5" /> {task.area}</span><span className="flex items-center gap-1.5"><GitBranch className="size-3.5" /> 2 linked PRs</span><span className="flex items-center gap-1.5"><Clock3 className="size-3.5" /> Updated 24m ago</span></div></div></div></div> }
function Detail({ label, children }: { label: string; children: React.ReactNode }) { return <div><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9aa3af]">{label}</p>{children}</div> }

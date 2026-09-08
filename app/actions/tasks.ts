'use server'

import { db } from '@/lib/db'
import { activity, epic as epicTable, project, sprint as sprintTable, task, taskComment, user } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_TYPES,
  type TaskPriority,
  type TaskStatus,
  type TaskType,
} from '@/lib/constants'
import { getTeamRoleForProject, getUserId, requireTeamMember } from '@/lib/permissions'

function clean(value: string, fallback = '') {
  return value.trim() || fallback
}

/** Runs atomically: reads project.issueCounter, writes the key, bumps the counter. */
async function insertTaskWithKey(
  values: Omit<typeof task.$inferInsert, 'key' | 'projectId'> & { key?: never },
  projectId: string,
) {
  return db.transaction(async (tx) => {
    const [proj] = await tx
      .select({ key: project.key, issueCounter: project.issueCounter })
      .from(project)
      .where(eq(project.id, projectId))
      .limit(1)
    if (!proj) throw new Error('Project not found')

    const key = `${proj.key}-${proj.issueCounter}`
    await tx
      .update(project)
      .set({ issueCounter: proj.issueCounter + 1, updatedAt: new Date() })
      .where(eq(project.id, projectId))
    await tx.insert(task).values({ ...values, key, projectId })
    return key
  })
}

export async function createTask(input: {
  projectId: string
  title: string
  description?: string
  type?: string
  priority?: string
  dueDate?: string
  assigneeId?: string
  area?: string
  points?: number
  epicId?: string
  sprintId?: string
}) {
  const userId = await getUserId()
  requireTeamMember(await getTeamRoleForProject(input.projectId, userId))

  const title = clean(input.title)
  if (!title) throw new Error('Task title is required')

  const id = crypto.randomUUID()
  const type: TaskType = TASK_TYPES.includes(input.type as TaskType) ? (input.type as TaskType) : 'Task'
  const priority: TaskPriority = TASK_PRIORITIES.includes(input.priority as TaskPriority)
    ? (input.priority as TaskPriority)
    : 'Medium'

  const key = await insertTaskWithKey(
    {
      id,
      title,
      description: input.description?.trim() ?? '',
      type,
      priority,
      status: 'To do',
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      assigneeId: input.assigneeId || userId,
      reporterId: userId,
      area: clean(input.area ?? '', 'Engineering'),
      points: Math.max(1, Math.round(input.points ?? 3)),
      epicId: input.epicId ?? null,
      sprintId: input.sprintId ?? null,
    },
    input.projectId,
  )

  await db
    .insert(activity)
    .values({ id: crypto.randomUUID(), actorId: userId, taskId: id, action: `created ${key}` })

  revalidatePath('/')
  return { id, key }
}

export async function updateTask(
  id: string,
  input: {
    title?: string
    description?: string
    type?: string
    priority?: string
    status?: string
    dueDate?: string | null
    assigneeId?: string | null
    epicId?: string | null
    sprintId?: string | null
    area?: string
    points?: number
    blocked?: boolean
  },
) {
  const userId = await getUserId()

  const [row] = await db
    .select({
      projectId: task.projectId,
      assigneeId: task.assigneeId,
      reporterId: task.reporterId,
      status: task.status,
    })
    .from(task)
    .where(eq(task.id, id))
    .limit(1)
  if (!row) throw new Error('Task not found')

  const role = await getTeamRoleForProject(row.projectId, userId)
  const isOwner = row.assigneeId === userId || row.reporterId === userId
  if (!isOwner && role !== 'admin' && role !== 'lead')
    throw new Error('You can only manage tasks assigned to you or created by you')

  const changes: Record<string, unknown> = { updatedAt: new Date() }
  if (input.title !== undefined) changes.title = clean(input.title)
  if (input.description !== undefined) changes.description = input.description.trim()
  if (input.type !== undefined) {
    const t = input.type as TaskType
    if (TASK_TYPES.includes(t)) changes.type = t
  }
  if (input.priority !== undefined) {
    const p = input.priority as TaskPriority
    if (TASK_PRIORITIES.includes(p)) changes.priority = p
  }
  if (input.status !== undefined) {
    const s = input.status as TaskStatus
    if (TASK_STATUSES.includes(s)) changes.status = s
  }
  if (input.dueDate !== undefined) changes.dueDate = input.dueDate ? new Date(input.dueDate) : null
  if (input.assigneeId !== undefined) changes.assigneeId = input.assigneeId || null
  if (input.epicId !== undefined) changes.epicId = input.epicId || null
  if (input.sprintId !== undefined) changes.sprintId = input.sprintId || null
  if (input.area !== undefined) changes.area = clean(input.area)
  if (input.points !== undefined) changes.points = Math.max(1, Math.round(input.points))
  if (input.blocked !== undefined) changes.blocked = input.blocked

  await db.update(task).set(changes).where(eq(task.id, id))

  if (input.status && input.status !== row.status) {
    await db
      .insert(activity)
      .values({ id: crypto.randomUUID(), actorId: userId, taskId: id, action: `moved task to ${input.status}` })
  }

  revalidatePath('/')
}

export async function deleteTask(id: string) {
  const userId = await getUserId()

  const [row] = await db
    .select({ projectId: task.projectId, assigneeId: task.assigneeId, reporterId: task.reporterId })
    .from(task)
    .where(eq(task.id, id))
    .limit(1)
  if (!row) throw new Error('Task not found')

  const role = await getTeamRoleForProject(row.projectId, userId)
  const isOwner = row.assigneeId === userId || row.reporterId === userId
  if (!isOwner && role !== 'admin' && role !== 'lead')
    throw new Error('You can only delete tasks assigned to you or created by you')

  await db.delete(taskComment).where(eq(taskComment.taskId, id))
  await db.delete(activity).where(eq(activity.taskId, id))
  await db.delete(task).where(eq(task.id, id))
  revalidatePath('/')
}

export async function addTaskComment(taskId: string, body: string) {
  const userId = await getUserId()

  const [row] = await db
    .select({ projectId: task.projectId })
    .from(task)
    .where(eq(task.id, taskId))
    .limit(1)
  if (!row) throw new Error('Task not found')
  requireTeamMember(await getTeamRoleForProject(row.projectId, userId))

  const cleanBody = body.trim()
  if (!cleanBody) throw new Error('Comment cannot be empty')

  await db
    .insert(taskComment)
    .values({ id: crypto.randomUUID(), taskId, authorId: userId, body: cleanBody })
  await db
    .insert(activity)
    .values({ id: crypto.randomUUID(), actorId: userId, taskId, action: 'commented on task' })
  revalidatePath('/')
}

export async function getTaskDetails(taskId: string) {
  const userId = await getUserId()

  const [row] = await db
    .select({ projectId: task.projectId })
    .from(task)
    .where(eq(task.id, taskId))
    .limit(1)
  if (!row) throw new Error('Task not found')
  requireTeamMember(await getTeamRoleForProject(row.projectId, userId))

  return db
    .select({
      id: taskComment.id,
      body: taskComment.body,
      createdAt: taskComment.createdAt,
      authorId: taskComment.authorId,
      author: user.name,
    })
    .from(taskComment)
    .leftJoin(user, eq(user.id, taskComment.authorId))
    .where(eq(taskComment.taskId, taskId))
}

// ---- epic / sprint cross-projection helpers (used by the UI to show sprint & epic on tasks) ----

export async function getSprintById(id: string) {
  const userId = await getUserId()
  const [row] = await db.select().from(sprintTable).where(eq(sprintTable.id, id)).limit(1)
  if (!row) return null
  const [projectRow] = await db
    .select({ teamId: project.teamId })
    .from(project)
    .where(eq(project.id, row.projectId))
    .limit(1)
  if (projectRow) requireTeamMember(await getTeamRoleForProject(row.projectId, userId))
  return row
}

export async function getEpicById(id: string) {
  const userId = await getUserId()
  const [row] = await db.select().from(epicTable).where(eq(epicTable.id, id)).limit(1)
  if (!row) return null
  requireTeamMember(await getTeamRoleForProject(row.projectId, userId))
  return row
}
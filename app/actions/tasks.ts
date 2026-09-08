'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { activity, task, taskComment, user, workspaceMember } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'

const statuses = ['To do', 'In progress', 'Review', 'Done'] as const
const priorities = ['Low', 'Medium', 'High', 'Urgent'] as const
const types = ['Task', 'Story', 'Bug', 'Incident'] as const

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')
  return session.user.id
}

async function canManageTask(id: string, userId: string) {
  const row = (await db.select({ id: task.id, assigneeId: task.assigneeId, reporterId: task.reporterId }).from(task).where(eq(task.id, id)).limit(1))[0]
  if (!row) throw new Error('Task not found')
  if (row.assigneeId !== userId && row.reporterId !== userId) throw new Error('You can only manage tasks assigned to you or created by you')
  return row
}

function clean(value: string, fallback = '') { return value.trim() || fallback }

export async function createTask(input: { title: string; description?: string; type?: string; priority?: string; dueDate?: string; assigneeId?: string; project?: string; area?: string; points?: number }) {
  const userId = await getUserId()
  const title = clean(input.title)
  if (!title) throw new Error('Task title is required')
  const id = crypto.randomUUID()
  const key = `ORB-${Math.floor(10000 + Math.random() * 89999)}`
  const assigneeId = input.assigneeId || userId
  const type = types.includes(input.type as typeof types[number]) ? input.type! : 'Task'
  const priority = priorities.includes(input.priority as typeof priorities[number]) ? input.priority! : 'Medium'
  await db.insert(task).values({ id, key, title, description: input.description?.trim() ?? '', type, priority, status: 'To do', assigneeId, reporterId: userId, dueDate: input.dueDate ? new Date(input.dueDate) : null, project: clean(input.project || '', 'Core Console'), area: clean(input.area || '', 'Engineering'), points: input.points || 3 })
  await db.insert(activity).values({ id: crypto.randomUUID(), actorId: userId, taskId: id, action: `created ${key}` })
  revalidatePath('/')
  return { id, key }
}

export async function updateTask(id: string, input: { title?: string; description?: string; type?: string; priority?: string; status?: string; dueDate?: string | null; assigneeId?: string; points?: number; blocked?: boolean }) {
  const userId = await getUserId()
  await canManageTask(id, userId)
  const changes: Record<string, unknown> = { updatedAt: new Date() }
  if (input.title !== undefined) changes.title = clean(input.title)
  if (input.description !== undefined) changes.description = input.description.trim()
  if (input.type && types.includes(input.type as typeof types[number])) changes.type = input.type
  if (input.priority && priorities.includes(input.priority as typeof priorities[number])) changes.priority = input.priority
  if (input.status && statuses.includes(input.status as typeof statuses[number])) changes.status = input.status
  if (input.dueDate !== undefined) changes.dueDate = input.dueDate ? new Date(input.dueDate) : null
  if (input.assigneeId) changes.assigneeId = input.assigneeId
  if (input.points !== undefined) changes.points = input.points
  if (input.blocked !== undefined) changes.blocked = input.blocked
  await db.update(task).set(changes).where(eq(task.id, id))
  if (input.status) await db.insert(activity).values({ id: crypto.randomUUID(), actorId: userId, taskId: id, action: `moved task to ${input.status}` })
  revalidatePath('/')
}

export async function deleteTask(id: string) {
  const userId = await getUserId()
  await canManageTask(id, userId)
  await db.delete(taskComment).where(eq(taskComment.taskId, id))
  await db.delete(activity).where(eq(activity.taskId, id))
  await db.delete(task).where(eq(task.id, id))
  revalidatePath('/')
}

export async function addTaskComment(taskId: string, body: string) {
  const userId = await getUserId()
  await canManageTask(taskId, userId)
  const cleanBody = body.trim()
  if (!cleanBody) throw new Error('Comment cannot be empty')
  await db.insert(taskComment).values({ id: crypto.randomUUID(), taskId, authorId: userId, body: cleanBody })
  await db.insert(activity).values({ id: crypto.randomUUID(), actorId: userId, taskId, action: 'commented on task' })
  revalidatePath('/')
}

export async function getTaskDetails(taskId: string) {
  const userId = await getUserId()
  await canManageTask(taskId, userId)
  const comments = await db.select({ id: taskComment.id, body: taskComment.body, createdAt: taskComment.createdAt, author: user.name }).from(taskComment).leftJoin(user, eq(user.id, taskComment.authorId)).where(eq(taskComment.taskId, taskId))
  return comments
}

export async function ensureWorkspaceMember(displayName: string) {
  const userId = await getUserId()
  const existing = await db.select().from(workspaceMember).where(eq(workspaceMember.userId, userId)).limit(1)
  if (!existing.length) await db.insert(workspaceMember).values({ id: crypto.randomUUID(), userId, displayName: clean(displayName, 'Team member') })
}

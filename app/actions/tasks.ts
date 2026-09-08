'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { task, taskComment, activity } from '@/lib/db/schema'
import { and, desc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'

async function getUserId() { const session = await auth.api.getSession({ headers: await headers() }); if (!session?.user) throw new Error('Unauthorized'); return session.user.id }
export async function createTask(input: { title: string; description?: string; type?: string; priority?: string; dueDate?: Date }) { const userId = await getUserId(); const id = crypto.randomUUID(); const key = `ORB-${Date.now().toString().slice(-5)}`; await db.insert(task).values({ id, key, title: input.title.trim(), description: input.description ?? '', type: input.type ?? 'Task', priority: input.priority ?? 'Medium', assigneeId: userId, reporterId: userId, dueDate: input.dueDate }); await db.insert(activity).values({ id: crypto.randomUUID(), actorId: userId, taskId: id, action: `created ${key}` }); revalidatePath('/') }
export async function updateTaskStatus(id: string, status: string) { const userId = await getUserId(); await db.update(task).set({ status, updatedAt: new Date() }).where(and(eq(task.id, id), eq(task.assigneeId, userId))); await db.insert(activity).values({ id: crypto.randomUUID(), actorId: userId, taskId: id, action: `moved task to ${status}` }); revalidatePath('/') }
export async function deleteTask(id: string) { const userId = await getUserId(); await db.delete(task).where(and(eq(task.id, id), eq(task.assigneeId, userId))); revalidatePath('/') }
export async function addTaskComment(taskId: string, body: string) { const userId = await getUserId(); await db.insert(taskComment).values({ id: crypto.randomUUID(), taskId, authorId: userId, body: body.trim() }); revalidatePath('/') }

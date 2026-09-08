'use server'

import { db } from '@/lib/db'
import { epic } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { EPIC_STATUSES, type EpicStatus } from '@/lib/constants'
import { getTeamRoleForProject, getUserId, requireAdminOrLead, requireTeamMember } from '@/lib/permissions'

function clean(value: string, fallback = '') {
  return value.trim() || fallback
}

export async function createEpic(input: { projectId: string; title: string; description?: string }) {
  const userId = await getUserId()
  requireTeamMember(await getTeamRoleForProject(input.projectId, userId))

  const title = clean(input.title)
  if (!title) throw new Error('Epic title is required')

  const id = crypto.randomUUID()
  await db
    .insert(epic)
    .values({ id, projectId: input.projectId, title, description: input.description?.trim() ?? '', status: 'Open' })

  revalidatePath('/')
  return { id }
}

export async function updateEpic(id: string, input: { title?: string; description?: string; status?: string }) {
  const userId = await getUserId()

  const [row] = await db.select({ projectId: epic.projectId }).from(epic).where(eq(epic.id, id)).limit(1)
  if (!row) throw new Error('Epic not found')
  requireTeamMember(await getTeamRoleForProject(row.projectId, userId))

  const changes: Record<string, unknown> = { updatedAt: new Date() }
  if (input.title !== undefined) {
    const title = clean(input.title)
    if (!title) throw new Error('Epic title cannot be empty')
    changes.title = title
  }
  if (input.description !== undefined) changes.description = input.description.trim()
  if (input.status !== undefined) {
    const s = input.status as EpicStatus
    if (EPIC_STATUSES.includes(s)) changes.status = s
  }

  await db.update(epic).set(changes).where(eq(epic.id, id))
  revalidatePath('/')
}

export async function deleteEpic(id: string) {
  const userId = await getUserId()

  const [row] = await db.select({ projectId: epic.projectId }).from(epic).where(eq(epic.id, id)).limit(1)
  if (!row) throw new Error('Epic not found')
  requireAdminOrLead(await getTeamRoleForProject(row.projectId, userId))

  await db.delete(epic).where(eq(epic.id, id))
  revalidatePath('/')
}
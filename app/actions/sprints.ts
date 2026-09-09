'use server'

import { db } from '@/lib/db'
import { project, sprint, task } from '@/lib/db/schema'
import { and, eq, ne } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getTeamRoleForProject, getUserId, requireAdminOrLead, requireTeamMember } from '@/lib/permissions'

function clean(value: string, fallback = '') {
  return value.trim() || fallback
}

async function getSprint(id: string) {
  const [row] = await db.select().from(sprint).where(eq(sprint.id, id)).limit(1)
  return row
}

export async function createSprint(
  input: { projectId: string; name: string; goal?: string; startsAt?: string; endsAt?: string },
) {
  const userId = await getUserId()
  requireTeamMember(await getTeamRoleForProject(input.projectId, userId))

  const name = clean(input.name)
  if (!name) throw new Error('Sprint name is required')

  const id = crypto.randomUUID()
  await db
    .insert(sprint)
    .values({
      id,
      projectId: input.projectId,
      name,
      goal: input.goal?.trim() ?? '',
      status: 'planned',
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
    })

  revalidatePath('/')
  return { id }
}

export async function updateSprint(
  id: string,
  input: { name?: string; goal?: string; startsAt?: string | null; endsAt?: string | null },
) {
  const userId = await getUserId()

  const row = await getSprint(id)
  if (!row) throw new Error('Sprint not found')
  requireTeamMember(await getTeamRoleForProject(row.projectId, userId))

  const changes: Record<string, unknown> = { updatedAt: new Date() }
  if (input.name !== undefined) {
    const name = clean(input.name)
    if (!name) throw new Error('Sprint name cannot be empty')
    changes.name = name
  }
  if (input.goal !== undefined) changes.goal = input.goal.trim()
  if (input.startsAt !== undefined) changes.startsAt = input.startsAt ? new Date(input.startsAt) : null
  if (input.endsAt !== undefined) changes.endsAt = input.endsAt ? new Date(input.endsAt) : null

  await db.update(sprint).set(changes).where(eq(sprint.id, id))
  revalidatePath('/')
}

/** planned -> active; there can be only one active sprint per project. */
export async function startSprint(id: string) {
  const userId = await getUserId()

  const row = await getSprint(id)
  if (!row) throw new Error('Sprint not found')
  requireTeamMember(await getTeamRoleForProject(row.projectId, userId))
  if (row.status !== 'planned') throw new Error('Only planned sprints can be started')

  const [active] = await db
    .select({ id: sprint.id })
    .from(sprint)
    .where(and(eq(sprint.projectId, row.projectId), eq(sprint.status, 'active')))
    .limit(1)
  if (active) throw new Error('Another sprint is already active for this project')

  await db
    .update(sprint)
    .set({ status: 'active', startsAt: row.startsAt ?? new Date(), updatedAt: new Date() })
    .where(eq(sprint.id, id))
  revalidatePath('/')
}

/** active -> completed; incomplete tasks fall back to the backlog (sprintId = null). */
export async function completeSprint(id: string) {
  const userId = await getUserId()

  const row = await getSprint(id)
  if (!row) throw new Error('Sprint not found')
  requireTeamMember(await getTeamRoleForProject(row.projectId, userId))
  if (row.status !== 'active') throw new Error('Only active sprints can be completed')

  await db.transaction(async (tx) => {
    await tx
      .update(sprint)
      .set({ status: 'completed', completedAt: new Date(), endsAt: row.endsAt ?? new Date(), updatedAt: new Date() })
      .where(eq(sprint.id, id))
    await tx
      .update(task)
      .set({ sprintId: null })
      .where(and(eq(task.sprintId, id), ne(task.status, 'Done')))
  })

  revalidatePath('/')
}

export async function deleteSprint(id: string) {
  const userId = await getUserId()

  const row = await getSprint(id)
  if (!row) throw new Error('Sprint not found')
  requireAdminOrLead(await getTeamRoleForProject(row.projectId, userId))
  if (row.status === 'active') throw new Error('Complete the sprint before deleting it')

  await db.transaction(async (tx) => {
    await tx.update(task).set({ sprintId: null }).where(eq(task.sprintId, id))
    await tx.delete(sprint).where(eq(sprint.id, id))
  })
  revalidatePath('/')
}

export async function getProjectById(id: string) {
  const userId = await getUserId()
  const [row] = await db.select().from(project).where(eq(project.id, id)).limit(1)
  if (!row) return null
  requireTeamMember(await getTeamRoleForProject(id, userId))
  return row
}
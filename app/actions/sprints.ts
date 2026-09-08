'use server'

import { db } from '@/lib/db'
import { project, sprint, task } from '@/lib/db/schema'
import { and, eq, ne } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getTeamRoleForProject, getUserId, requireAdminOrLead, requireTeamMember } from '@/lib/permissions'

function clean(value: string, fallback = '') {
  return value.trim() || fallback
}

function getSprint(id: string) {
  return db.select().from(sprint).where(eq(sprint.id, id)).get()
}

export async function createSprint(
  input: { projectId: string; name: string; goal?: string; startsAt?: string; endsAt?: string },
) {
  const userId = await getUserId()
  requireTeamMember(getTeamRoleForProject(input.projectId, userId))

  const name = clean(input.name)
  if (!name) throw new Error('Sprint name is required')

  const id = crypto.randomUUID()
  db.insert(sprint)
    .values({
      id,
      projectId: input.projectId,
      name,
      goal: input.goal?.trim() ?? '',
      status: 'planned',
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
    })
    .run()

  revalidatePath('/')
  return { id }
}

export async function updateSprint(
  id: string,
  input: { name?: string; goal?: string; startsAt?: string | null; endsAt?: string | null },
) {
  const userId = await getUserId()

  const row = getSprint(id)
  if (!row) throw new Error('Sprint not found')
  requireTeamMember(getTeamRoleForProject(row.projectId, userId))

  const changes: Record<string, unknown> = { updatedAt: new Date() }
  if (input.name !== undefined) {
    const name = clean(input.name)
    if (!name) throw new Error('Sprint name cannot be empty')
    changes.name = name
  }
  if (input.goal !== undefined) changes.goal = input.goal.trim()
  if (input.startsAt !== undefined) changes.startsAt = input.startsAt ? new Date(input.startsAt) : null
  if (input.endsAt !== undefined) changes.endsAt = input.endsAt ? new Date(input.endsAt) : null

  db.update(sprint).set(changes).where(eq(sprint.id, id)).run()
  revalidatePath('/')
}

/** planned -> active; there can be only one active sprint per project. */
export async function startSprint(id: string) {
  const userId = await getUserId()

  const row = getSprint(id)
  if (!row) throw new Error('Sprint not found')
  requireTeamMember(getTeamRoleForProject(row.projectId, userId))
  if (row.status !== 'planned') throw new Error('Only planned sprints can be started')

  const active = db
    .select({ id: sprint.id })
    .from(sprint)
    .where(and(eq(sprint.projectId, row.projectId), eq(sprint.status, 'active')))
    .get()
  if (active) throw new Error('Another sprint is already active for this project')

  db.update(sprint)
    .set({ status: 'active', startsAt: row.startsAt ?? new Date(), updatedAt: new Date() })
    .where(eq(sprint.id, id))
    .run()
  revalidatePath('/')
}

/** active -> completed; incomplete tasks fall back to the backlog (sprintId = null). */
export async function completeSprint(id: string) {
  const userId = await getUserId()

  const row = getSprint(id)
  if (!row) throw new Error('Sprint not found')
  requireTeamMember(getTeamRoleForProject(row.projectId, userId))
  if (row.status !== 'active') throw new Error('Only active sprints can be completed')

  db.transaction((tx) => {
    tx.update(sprint)
      .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
      .where(eq(sprint.id, id))
      .run()
    tx.update(task)
      .set({ sprintId: null })
      .where(and(eq(task.sprintId, id), ne(task.status, 'Done')))
      .run()
  })

  revalidatePath('/')
}

export async function deleteSprint(id: string) {
  const userId = await getUserId()

  const row = getSprint(id)
  if (!row) throw new Error('Sprint not found')
  requireAdminOrLead(getTeamRoleForProject(row.projectId, userId))
  if (row.status === 'active') throw new Error('Complete the sprint before deleting it')

  db.transaction((tx) => {
    tx.update(task).set({ sprintId: null }).where(eq(task.sprintId, id)).run()
    tx.delete(sprint).where(eq(sprint.id, id)).run()
  })
  revalidatePath('/')
}

export async function getProjectById(id: string) {
  const userId = await getUserId()
  const row = db.select().from(project).where(eq(project.id, id)).get()
  if (!row) return null
  requireTeamMember(getTeamRoleForProject(id, userId))
  return row
}
'use server'

import { db } from '@/lib/db'
import { project } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getMyTeamRoles, getTeamRoleForProject, getUserId, requireAdmin, requireAdminOrLead } from '@/lib/permissions'

function clean(value: string, fallback = '') {
  return value.trim() || fallback
}

/** Derives a unique project key from a name: uppercase alphanumerics, first 4 chars, collision-safe. */
function deriveUniqueKey(name: string): string {
  const base = (name.toUpperCase().replace(/[^A-Z0-9]/g, '') || 'PROJ').slice(0, 4)
  let candidate = base
  let n = 2
  while (db.select({ id: project.id }).from(project).where(eq(project.key, candidate)).get()) {
    candidate = `${base}${n++}`
  }
  return candidate
}

export async function createProject(input: { name: string; description?: string; teamId?: string }) {
  const userId = await getUserId()
  const name = clean(input.name)
  if (!name) throw new Error('Project name is required')

  const myTeams = getMyTeamRoles(userId)
  if (!myTeams.length) throw new Error('You are not a member of any team yet')
  const teamId = input.teamId || myTeams[0].teamId

  // User must be admin/lead of the owning team to create a project
  const myRole = myTeams.find((t) => t.teamId === teamId)?.role ?? null
  requireAdminOrLead(myRole)

  const id = crypto.randomUUID()
  const key = deriveUniqueKey(name)
  db.insert(project)
    .values({
      id,
      key,
      name,
      description: input.description?.trim() ?? '',
      teamId,
      issueCounter: 100,
    })
    .run()

  revalidatePath('/')
  return { id, key }
}

export async function updateProject(
  id: string,
  input: { name?: string; description?: string; key?: string; leadUserId?: string | null },
) {
  const userId = await getUserId()

  const row = db.select().from(project).where(eq(project.id, id)).get()
  if (!row) throw new Error('Project not found')
  requireAdminOrLead(getTeamRoleForProject(id, userId))

  const changes: Record<string, unknown> = { updatedAt: new Date() }
  if (input.name !== undefined) {
    const name = clean(input.name)
    if (!name) throw new Error('Project name cannot be empty')
    changes.name = name
  }
  if (input.description !== undefined) changes.description = input.description.trim()
  if (input.key !== undefined) {
    const key = clean(input.key).toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (!key) throw new Error('Project key cannot be empty')
    const clash = db
      .select({ id: project.id })
      .from(project)
      .where(eq(project.key, key))
      .get()
    if (clash && clash.id !== id) throw new Error(`Project key "${key}" is already in use`)
    changes.key = key
  }
  if (input.leadUserId !== undefined) changes.leadUserId = input.leadUserId || null

  db.update(project).set(changes).where(eq(project.id, id)).run()
  revalidatePath('/')
}

export async function deleteProject(id: string) {
  const userId = await getUserId()
  requireAdmin(getTeamRoleForProject(id, userId))

  db.delete(project).where(eq(project.id, id)).run()
  revalidatePath('/')
}
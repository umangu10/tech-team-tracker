import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { project, teamMember } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import type { TeamRole } from '@/lib/constants'

/** Returns the authenticated user id, or throws. */
export async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')
  return session.user.id
}

/**
 * The role of `userId` inside the team that owns `projectId`.
 * Returns null when the user is not a member of that team (or the project is missing).
 * Sync: better-sqlite3 driver.
 */
export function getTeamRoleForProject(projectId: string, userId: string): TeamRole | null {
  const proj = db
    .select({ teamId: project.teamId })
    .from(project)
    .where(eq(project.id, projectId))
    .get()
  if (!proj) return null
  const member = db
    .select({ role: teamMember.role })
    .from(teamMember)
    .where(and(eq(teamMember.teamId, proj.teamId), eq(teamMember.userId, userId)))
    .get()
  return (member?.role as TeamRole) ?? null
}

/** The user's own teams and their role in each. */
export function getMyTeamRoles(userId: string): { teamId: string; role: TeamRole }[] {
  return db
    .select({ teamId: teamMember.teamId, role: teamMember.role })
    .from(teamMember)
    .where(eq(teamMember.userId, userId))
    .all() as { teamId: string; role: TeamRole }[]
}

export function requireTeamMember(role: TeamRole | null): void {
  if (!role) throw new Error("You are not a member of this project's team")
}

export function requireAdminOrLead(role: TeamRole | null): void {
  if (role !== 'admin' && role !== 'lead')
    throw new Error('Only team admins or leads can do this')
}

export function requireAdmin(role: TeamRole | null): void {
  if (role !== 'admin') throw new Error('Only team admins can do this')
}
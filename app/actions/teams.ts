'use server'

import { db } from '@/lib/db'
import { team, teamMember } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { DEFAULT_AVATAR_COLOR, TEAM_ROLES, type TeamRole } from '@/lib/constants'
import { getUserId } from '@/lib/permissions'

function clean(value: string, fallback = '') {
  return value.trim() || fallback
}

export async function createTeam(input: { name: string; description?: string }) {
  const userId = await getUserId()
  const name = clean(input.name)
  if (!name) throw new Error('Team name is required')

  const id = crypto.randomUUID()
  db.transaction((tx) => {
    tx.insert(team)
      .values({ id, name, description: input.description?.trim() ?? '' })
      .run()
    tx.insert(teamMember)
      .values({
        id: crypto.randomUUID(),
        teamId: id,
        userId,
        role: 'admin',
        displayName: '',
        avatarColor: DEFAULT_AVATAR_COLOR,
      })
      .run()
  })

  revalidatePath('/')
  return { id }
}

export async function updateMemberRole(memberId: string, role: string) {
  const userId = await getUserId()
  const newRole = role as TeamRole
  if (!TEAM_ROLES.includes(newRole)) throw new Error('Invalid role')

  const member = db.select().from(teamMember).where(eq(teamMember.id, memberId)).get()
  if (!member) throw new Error('Member not found')

  const myRole = db
    .select({ role: teamMember.role })
    .from(teamMember)
    .where(and(eq(teamMember.teamId, member.teamId), eq(teamMember.userId, userId)))
    .get()
  if (!myRole || myRole.role !== 'admin') throw new Error('Only team admins can change roles')

  // Never demote the last admin of a team
  if (member.role === 'admin' && newRole !== 'admin') {
    const admins = db
      .select({ id: teamMember.id })
      .from(teamMember)
      .where(and(eq(teamMember.teamId, member.teamId), eq(teamMember.role, 'admin')))
      .all()
    if (admins.length <= 1) throw new Error('A team must keep at least one admin')
  }

  db.update(teamMember)
    .set({ role: newRole, updatedAt: new Date() })
    .where(eq(teamMember.id, memberId))
    .run()
  revalidatePath('/')
}
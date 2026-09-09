'use server'

import { db } from '@/lib/db'
import { team, teamMember, user } from '@/lib/db/schema'
import { and, eq, ne } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { DEFAULT_AVATAR_COLOR, TEAM_ROLES, type TeamRole } from '@/lib/constants'
import { getUserId } from '@/lib/permissions'

export async function listAllUsers() {
  const userId = await getUserId()
  const myRoles = await db
    .select({ teamId: teamMember.teamId, role: teamMember.role })
    .from(teamMember)
    .where(eq(teamMember.userId, userId))
  if (!myRoles.some((r) => r.role === 'admin')) throw new Error('Only team admins can manage members')
  return db.select({ id: user.id, name: user.name, email: user.email, image: user.image }).from(user).orderBy(user.name)
}

export async function addMemberToTeam(teamId: string, targetUserId: string) {
  const userId = await getUserId()
  const [myRole] = await db
    .select({ role: teamMember.role })
    .from(teamMember)
    .where(and(eq(teamMember.teamId, teamId), eq(teamMember.userId, userId)))
    .limit(1)
  if (!myRole || myRole.role !== 'admin') throw new Error('Only team admins can add members')

  const [targetUser] = await db.select().from(user).where(eq(user.id, targetUserId)).limit(1)
  if (!targetUser) throw new Error('User not found')

  const existing = await db
    .select({ id: teamMember.id })
    .from(teamMember)
    .where(and(eq(teamMember.teamId, teamId), eq(teamMember.userId, targetUserId)))
    .limit(1)
  if (existing.length) throw new Error('User is already a member of this team')

  await db.insert(teamMember).values({
    id: crypto.randomUUID(),
    teamId,
    userId: targetUserId,
    role: 'member',
    displayName: targetUser.name || targetUser.email.split('@')[0],
    avatarColor: DEFAULT_AVATAR_COLOR,
  })
  revalidatePath('/')
}

export async function removeMemberFromTeam(teamId: string, memberId: string) {
  const userId = await getUserId()
  const [myRole] = await db
    .select({ role: teamMember.role })
    .from(teamMember)
    .where(and(eq(teamMember.teamId, teamId), eq(teamMember.userId, userId)))
    .limit(1)
  if (!myRole || myRole.role !== 'admin') throw new Error('Only team admins can remove members')

  const [member] = await db
    .select()
    .from(teamMember)
    .where(and(eq(teamMember.id, memberId), eq(teamMember.teamId, teamId)))
    .limit(1)
  if (!member) throw new Error('Member not found')
  if (member.userId === userId) throw new Error('You cannot remove yourself')

  if (member.role === 'admin') {
    const admins = await db
      .select({ id: teamMember.id })
      .from(teamMember)
      .where(and(eq(teamMember.teamId, teamId), eq(teamMember.role, 'admin'), ne(teamMember.id, member.id)))
    if (admins.length === 0) throw new Error('A team must keep at least one admin')
  }

  await db.delete(teamMember).where(eq(teamMember.id, memberId))
  revalidatePath('/')
}

function clean(value: string, fallback = '') {
  return value.trim() || fallback
}

export async function createTeam(input: { name: string; description?: string }) {
  const userId = await getUserId()
  const name = clean(input.name)
  if (!name) throw new Error('Team name is required')

  const id = crypto.randomUUID()
  await db.transaction(async (tx) => {
    await tx
      .insert(team)
      .values({ id, name, description: input.description?.trim() ?? '' })
    await tx
      .insert(teamMember)
      .values({
        id: crypto.randomUUID(),
        teamId: id,
        userId,
        role: 'admin',
        displayName: '',
        avatarColor: DEFAULT_AVATAR_COLOR,
      })
  })

  revalidatePath('/')
  return { id }
}

export async function updateMemberRole(memberId: string, role: string) {
  const userId = await getUserId()
  const newRole = role as TeamRole
  if (!TEAM_ROLES.includes(newRole)) throw new Error('Invalid role')

  const [member] = await db.select().from(teamMember).where(eq(teamMember.id, memberId)).limit(1)
  if (!member) throw new Error('Member not found')

  const [myRole] = await db
    .select({ role: teamMember.role })
    .from(teamMember)
    .where(and(eq(teamMember.teamId, member.teamId), eq(teamMember.userId, userId)))
    .limit(1)
  if (!myRole || myRole.role !== 'admin') throw new Error('Only team admins can change roles')

  // Never demote the last admin of a team
  if (member.role === 'admin' && newRole !== 'admin') {
    const admins = await db
      .select({ id: teamMember.id })
      .from(teamMember)
      .where(and(eq(teamMember.teamId, member.teamId), eq(teamMember.role, 'admin')))
    if (admins.length <= 1) throw new Error('A team must keep at least one admin')
  }

  await db
    .update(teamMember)
    .set({ role: newRole, updatedAt: new Date() })
    .where(eq(teamMember.id, memberId))
  revalidatePath('/')
}
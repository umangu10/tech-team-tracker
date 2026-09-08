import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { task, workspaceMember, sprint } from '@/lib/db/schema'
import { eq, desc } from 'drizzle-orm'
import WorkspaceClient from '@/components/workspace-client'

export default async function Page() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/sign-in')

  let member = (await db.select().from(workspaceMember).where(eq(workspaceMember.userId, session.user.id)).limit(1))[0]
  if (!member) {
    member = { id: crypto.randomUUID(), userId: session.user.id, displayName: session.user.name || session.user.email.split('@')[0], role: 'member', team: 'Engineering', avatarColor: 'bg-violet-600', createdAt: new Date() }
    await db.insert(workspaceMember).values(member)
  }

  const members = await db.select().from(workspaceMember).orderBy(workspaceMember.createdAt)
  const tasks = await db.select().from(task).orderBy(desc(task.updatedAt))
  const sprints = await db.select().from(sprint).orderBy(desc(sprint.createdAt)).limit(10)

  return <WorkspaceClient currentUser={member} members={members} initialTasks={tasks} sprints={sprints} />
}

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { epic, project, sprint, task, team, teamMember } from '@/lib/db/schema'
import { desc, eq, inArray } from 'drizzle-orm'
import { DEFAULT_AVATAR_COLOR, DEFAULT_TEAM_NAME } from '@/lib/constants'
import WorkspaceClient from '@/components/workspace-client'

export default async function Page() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/sign-in')

  const userId = session.user.id

  // Ensure membership in a team; the very first member of a team becomes its admin
  let member = db.select().from(teamMember).where(eq(teamMember.userId, userId)).get()
  if (!member) {
    let defaultTeam = db.select().from(team).where(eq(team.name, DEFAULT_TEAM_NAME)).get()
    if (!defaultTeam) {
      const id = crypto.randomUUID()
      db.insert(team).values({ id, name: DEFAULT_TEAM_NAME, description: 'Core team' }).run()
      defaultTeam = { id, name: DEFAULT_TEAM_NAME, description: 'Core team', createdAt: new Date(), updatedAt: new Date() }
    }
    const memberCount = db
      .select({ id: teamMember.id })
      .from(teamMember)
      .where(eq(teamMember.teamId, defaultTeam.id))
      .all().length
    member = {
      id: crypto.randomUUID(),
      teamId: defaultTeam.id,
      userId,
      role: memberCount === 0 ? 'admin' : 'member',
      displayName: session.user.name || session.user.email.split('@')[0],
      avatarColor: DEFAULT_AVATAR_COLOR,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    db.insert(teamMember).values(member).run()
  }

  // Members and projects scoped to the user's own teams
  const myTeams = db.select().from(teamMember).where(eq(teamMember.userId, userId)).all()
  const myTeamIds = myTeams.map((m) => m.teamId)
  const teams = db.select().from(team).where(inArray(team.id, myTeamIds)).all()
  const members = db.select().from(teamMember).where(inArray(teamMember.teamId, myTeamIds)).orderBy(teamMember.createdAt).all()

  const projects = db.select().from(project).where(inArray(project.teamId, myTeamIds)).orderBy(project.createdAt).all()
  const projectMap = new Map(projects.map((p) => [p.id, p]))
  const projectIds = [...projectMap.keys()]

  const epics = projectIds.length
    ? db.select().from(epic).where(inArray(epic.projectId, projectIds)).orderBy(epic.createdAt).all()
    : []
  const sprints = projectIds.length
    ? db.select().from(sprint).where(inArray(sprint.projectId, projectIds)).orderBy(desc(sprint.createdAt)).all()
    : []
  const tasks = projectIds.length
    ? db.select().from(task).where(inArray(task.projectId, projectIds)).orderBy(desc(task.updatedAt)).all()
    : []

  // Enrich tasks with project key/name so the client can render "ORB-101 · Core Console"
  const tasksWithProject = tasks.map((t) => ({
    ...t,
    projectKey: projectMap.get(t.projectId)?.key ?? '',
    projectName: projectMap.get(t.projectId)?.name ?? '',
  }))

  return (
    <WorkspaceClient
      currentUser={member}
      members={members}
      teams={teams}
      projects={projects}
      initialTasks={tasksWithProject}
      sprints={sprints}
      epics={epics}
    />
  )
}
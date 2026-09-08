import { pgTable, text, integer, timestamp, boolean } from 'drizzle-orm/pg-core'

// ---------------------------------------------------------------------------
// better-auth core tables (Postgres)
// ---------------------------------------------------------------------------

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expiresAt').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('createdAt').notNull(),
  updatedAt: timestamp('updatedAt').notNull(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
})

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: timestamp('accessTokenExpiresAt'),
  refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('createdAt').notNull(),
  updatedAt: timestamp('updatedAt').notNull(),
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expiresAt').notNull(),
  createdAt: timestamp('createdAt').notNull(),
  updatedAt: timestamp('updatedAt').notNull(),
})

// ---------------------------------------------------------------------------
// Workspace model (Jira-style)
// ---------------------------------------------------------------------------

export const team = pgTable('team', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

export const project = pgTable('project', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(), // e.g. "ORB" -> task keys "ORB-101"
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  leadUserId: text('leadUserId').references(() => user.id, { onDelete: 'set null' }),
  teamId: text('teamId')
    .notNull()
    .references(() => team.id, { onDelete: 'cascade' }),
  issueCounter: integer('issueCounter').notNull().default(100), // next sequential key number
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

export const teamMember = pgTable('teamMember', {
  id: text('id').primaryKey(),
  teamId: text('teamId')
    .notNull()
    .references(() => team.id, { onDelete: 'cascade' }),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('member'), // admin | lead | member
  displayName: text('displayName').notNull().default(''),
  avatarColor: text('avatarColor').notNull().default('bg-violet-600'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

export const epic = pgTable('epic', {
  id: text('id').primaryKey(),
  projectId: text('projectId')
    .notNull()
    .references(() => project.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  status: text('status').notNull().default('Open'), // Open | In progress | Done
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

export const sprint = pgTable('sprint', {
  id: text('id').primaryKey(),
  projectId: text('projectId')
    .notNull()
    .references(() => project.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  goal: text('goal').notNull().default(''),
  status: text('status').notNull().default('planned'), // planned | active | completed
  startsAt: timestamp('startsAt'),
  endsAt: timestamp('endsAt'),
  completedAt: timestamp('completedAt'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

export const task = pgTable('task', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(), // "ORB-101"
  projectId: text('projectId')
    .notNull()
    .references(() => project.id, { onDelete: 'cascade' }),
  epicId: text('epicId').references(() => epic.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  type: text('type').notNull().default('Task'),
  priority: text('priority').notNull().default('Medium'),
  status: text('status').notNull().default('To do'),
  dueDate: timestamp('dueDate'),
  area: text('area').notNull().default('Engineering'),
  points: integer('points').notNull().default(3),
  assigneeId: text('assigneeId').references(() => user.id, { onDelete: 'set null' }),
  reporterId: text('reporterId').notNull().references(() => user.id, { onDelete: 'restrict' }),
  sprintId: text('sprintId').references(() => sprint.id, { onDelete: 'set null' }),
  blocked: boolean('blocked').notNull().default(false),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

export const taskComment = pgTable('taskComment', {
  id: text('id').primaryKey(),
  taskId: text('taskId')
    .notNull()
    .references(() => task.id, { onDelete: 'cascade' }),
  authorId: text('authorId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

export const activity = pgTable('activity', {
  id: text('id').primaryKey(),
  actorId: text('actorId').notNull().references(() => user.id, { onDelete: 'set null' }),
  taskId: text('taskId').references(() => task.id, { onDelete: 'cascade' }),
  action: text('action').notNull(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

// Shared row types for the client
export type User = typeof user.$inferSelect
export type Project = typeof project.$inferSelect
export type Team = typeof team.$inferSelect
export type TeamMember = typeof teamMember.$inferSelect
export type Epic = typeof epic.$inferSelect
export type Sprint = typeof sprint.$inferSelect
export type Task = typeof task.$inferSelect
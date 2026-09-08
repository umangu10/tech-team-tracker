import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

// ---------------------------------------------------------------------------
// better-auth core tables (SQLite)
// ---------------------------------------------------------------------------

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('emailVerified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull().defaultNow(),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull().defaultNow(),
})

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  expiresAt: integer('expiresAt', { mode: 'timestamp_ms' }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
})

export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: integer('accessTokenExpiresAt', { mode: 'timestamp_ms' }),
  refreshTokenExpiresAt: integer('refreshTokenExpiresAt', { mode: 'timestamp_ms' }),
  scope: text('scope'),
  password: text('password'),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull(),
})

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expiresAt', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull(),
})

// ---------------------------------------------------------------------------
// Workspace model (Jira-style)
// ---------------------------------------------------------------------------

export const team = sqliteTable('team', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull().defaultNow(),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull().defaultNow(),
})

export const project = sqliteTable('project', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(), // e.g. "ORB" -> task keys "ORB-101"
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  leadUserId: text('leadUserId').references(() => user.id, { onDelete: 'set null' }),
  teamId: text('teamId')
    .notNull()
    .references(() => team.id, { onDelete: 'cascade' }),
  issueCounter: integer('issueCounter').notNull().default(100), // next sequential key number
  createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull().defaultNow(),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull().defaultNow(),
})

export const teamMember = sqliteTable('teamMember', {
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
  createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull().defaultNow(),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull().defaultNow(),
})

export const epic = sqliteTable('epic', {
  id: text('id').primaryKey(),
  projectId: text('projectId')
    .notNull()
    .references(() => project.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  status: text('status').notNull().default('Open'), // Open | In progress | Done
  createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull().defaultNow(),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull().defaultNow(),
})

export const sprint = sqliteTable('sprint', {
  id: text('id').primaryKey(),
  projectId: text('projectId')
    .notNull()
    .references(() => project.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  goal: text('goal').notNull().default(''),
  status: text('status').notNull().default('planned'), // planned | active | completed
  startsAt: integer('startsAt', { mode: 'timestamp_ms' }),
  endsAt: integer('endsAt', { mode: 'timestamp_ms' }),
  completedAt: integer('completedAt', { mode: 'timestamp_ms' }),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull().defaultNow(),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull().defaultNow(),
})

export const task = sqliteTable('task', {
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
  dueDate: integer('dueDate', { mode: 'timestamp_ms' }),
  area: text('area').notNull().default('Engineering'),
  points: integer('points').notNull().default(3),
  assigneeId: text('assigneeId').references(() => user.id, { onDelete: 'set null' }),
  reporterId: text('reporterId').notNull().references(() => user.id, { onDelete: 'restrict' }),
  sprintId: text('sprintId').references(() => sprint.id, { onDelete: 'set null' }),
  blocked: integer('blocked', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull().defaultNow(),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull().defaultNow(),
})

export const taskComment = sqliteTable('taskComment', {
  id: text('id').primaryKey(),
  taskId: text('taskId')
    .notNull()
    .references(() => task.id, { onDelete: 'cascade' }),
  authorId: text('authorId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull().defaultNow(),
})

export const activity = sqliteTable('activity', {
  id: text('id').primaryKey(),
  actorId: text('actorId').notNull().references(() => user.id, { onDelete: 'set null' }),
  taskId: text('taskId').references(() => task.id, { onDelete: 'cascade' }),
  action: text('action').notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull().defaultNow(),
})

// Shared row types for the client
export type User = typeof user.$inferSelect
export type Project = typeof project.$inferSelect
export type Team = typeof team.$inferSelect
export type TeamMember = typeof teamMember.$inferSelect
export type Epic = typeof epic.$inferSelect
export type Sprint = typeof sprint.$inferSelect
export type Task = typeof task.$inferSelect
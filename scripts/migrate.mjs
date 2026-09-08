// Local SQLite migration + seed. Idempotent: safe to re-run.
// Mirrors lib/db/schema.ts 1:1 — column names must match drizzle definitions.
// Usage: node scripts/migrate.mjs [--fresh]   (--fresh drops & recreates everything)
import Database from 'better-sqlite3'
import { mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const dataDir = path.join(process.cwd(), 'data')
const dbPath = path.join(dataDir, 'orbit.db')
const fresh = process.argv.includes('--fresh')

if (fresh) rmSync(dataDir, { recursive: true, force: true })
mkdirSync(dataDir, { recursive: true })

const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

const DDL = /* sql */ `
CREATE TABLE IF NOT EXISTS user (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  emailVerified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
  updatedAt INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY NOT NULL,
  expiresAt INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  ipAddress TEXT,
  userAgent TEXT,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS account (
  id TEXT PRIMARY KEY NOT NULL,
  accountId TEXT NOT NULL,
  providerId TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  accessToken TEXT,
  refreshToken TEXT,
  idToken TEXT,
  accessTokenExpiresAt INTEGER,
  refreshTokenExpiresAt INTEGER,
  scope TEXT,
  password TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS verification (
  id TEXT PRIMARY KEY NOT NULL,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expiresAt INTEGER NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS team (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
  updatedAt INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS project (
  id TEXT PRIMARY KEY NOT NULL,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  leadUserId TEXT REFERENCES user(id) ON DELETE SET NULL,
  teamId TEXT NOT NULL REFERENCES team(id) ON DELETE CASCADE,
  issueCounter INTEGER NOT NULL DEFAULT 100,
  createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
  updatedAt INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS teamMember (
  id TEXT PRIMARY KEY NOT NULL,
  teamId TEXT NOT NULL REFERENCES team(id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  displayName TEXT NOT NULL DEFAULT '',
  avatarColor TEXT NOT NULL DEFAULT 'bg-violet-600',
  createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
  updatedAt INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS epic (
  id TEXT PRIMARY KEY NOT NULL,
  projectId TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Open',
  createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
  updatedAt INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS sprint (
  id TEXT PRIMARY KEY NOT NULL,
  projectId TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  goal TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'planned',
  startsAt INTEGER,
  endsAt INTEGER,
  completedAt INTEGER,
  createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
  updatedAt INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS task (
  id TEXT PRIMARY KEY NOT NULL,
  key TEXT NOT NULL UNIQUE,
  projectId TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  epicId TEXT REFERENCES epic(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'Task',
  priority TEXT NOT NULL DEFAULT 'Medium',
  status TEXT NOT NULL DEFAULT 'To do',
  dueDate INTEGER,
  area TEXT NOT NULL DEFAULT 'Engineering',
  points INTEGER NOT NULL DEFAULT 3,
  assigneeId TEXT REFERENCES user(id) ON DELETE SET NULL,
  reporterId TEXT NOT NULL REFERENCES user(id) ON DELETE RESTRICT,
  sprintId TEXT REFERENCES sprint(id) ON DELETE SET NULL,
  blocked INTEGER NOT NULL DEFAULT 0,
  createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
  updatedAt INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS taskComment (
  id TEXT PRIMARY KEY NOT NULL,
  taskId TEXT NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  authorId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  createdAt INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS activity (
  id TEXT PRIMARY KEY NOT NULL,
  actorId TEXT NOT NULL REFERENCES user(id) ON DELETE SET NULL,
  taskId TEXT REFERENCES task(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  createdAt INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_task_sprint ON task(sprintId);
CREATE INDEX IF NOT EXISTS idx_task_epic ON task(epicId);
`

db.exec(DDL)

// ---- Seed defaults (only when the workspace is empty) ----
const now = Math.floor(Date.now() / 1000)

let defaultTeamId = null
const teamCount = db.prepare('SELECT COUNT(*) AS c FROM team').get().c
if (teamCount === 0) {
  defaultTeamId = randomUUID()
  db.prepare(
    'INSERT INTO team (id, name, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)'
  ).run(defaultTeamId, 'Engineering', 'Core engineering team', now, now)
  console.log('  seeded default team Engineering')
} else {
  defaultTeamId = db.prepare('SELECT id FROM team ORDER BY createdAt LIMIT 1').get().id
}

const projectCount = db.prepare('SELECT COUNT(*) AS c FROM project').get().c
if (projectCount === 0) {
  db.prepare(
    'INSERT INTO project (id, key, name, description, teamId, issueCounter, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, 100, ?, ?)'
  ).run(randomUUID(), 'ORB', 'Core Console', 'Default project', defaultTeamId, now, now)
  console.log('  seeded default project ORB (Core Console)')
}

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all()
console.log(`\nMigration complete (${fresh ? 'fresh ' : ''}${dbPath})`)
console.log('Tables:', tables.map((t) => t.name).join(', '))

db.close()
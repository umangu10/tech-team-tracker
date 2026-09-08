// Postgres migration + seed. Idempotent: safe to re-run.
// Mirrors lib/db/schema.ts 1:1 - table/column names must match drizzle definitions.
// Usage: node scripts/migrate.mjs [--fresh]   (--fresh drops & recreates the public schema)
import pg from 'pg'

const { Pool } = pg

if (!process.env.DATABASE_URL) {
  console.log('migrate: DATABASE_URL not set - skipping (expected in local dev without Postgres)')
  process.exit(0)
}

const fresh = process.argv.includes('--fresh')
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

// ---- schema DDL (quoted identifiers: Postgres lowercases unquoted names) ----
const DDL = /* sql */ `
CREATE TABLE IF NOT EXISTS "user" (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL DEFAULT false,
  image text,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "session" (
  id text PRIMARY KEY,
  "expiresAt" timestamp NOT NULL,
  token text NOT NULL UNIQUE,
  "createdAt" timestamp NOT NULL,
  "updatedAt" timestamp NOT NULL,
  "ipAddress" text,
  "userAgent" text,
  "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "account" (
  id text PRIMARY KEY,
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamp,
  "refreshTokenExpiresAt" timestamp,
  scope text,
  password text,
  "createdAt" timestamp NOT NULL,
  "updatedAt" timestamp NOT NULL
);

CREATE TABLE IF NOT EXISTS "verification" (
  id text PRIMARY KEY,
  identifier text NOT NULL,
  value text NOT NULL,
  "expiresAt" timestamp NOT NULL,
  "createdAt" timestamp NOT NULL,
  "updatedAt" timestamp NOT NULL
);

CREATE TABLE IF NOT EXISTS "team" (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "project" (
  id text PRIMARY KEY,
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  "leadUserId" text REFERENCES "user"(id) ON DELETE SET NULL,
  "teamId" text NOT NULL REFERENCES "team"(id) ON DELETE CASCADE,
  "issueCounter" integer NOT NULL DEFAULT 100,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "teamMember" (
  id text PRIMARY KEY,
  "teamId" text NOT NULL REFERENCES "team"(id) ON DELETE CASCADE,
  "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  "displayName" text NOT NULL DEFAULT '',
  "avatarColor" text NOT NULL DEFAULT 'bg-violet-600',
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "epic" (
  id text PRIMARY KEY,
  "projectId" text NOT NULL REFERENCES "project"(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'Open',
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "sprint" (
  id text PRIMARY KEY,
  "projectId" text NOT NULL REFERENCES "project"(id) ON DELETE CASCADE,
  name text NOT NULL,
  goal text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'planned',
  "startsAt" timestamp,
  "endsAt" timestamp,
  "completedAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "task" (
  id text PRIMARY KEY,
  key text NOT NULL UNIQUE,
  "projectId" text NOT NULL REFERENCES "project"(id) ON DELETE CASCADE,
  "epicId" text REFERENCES "epic"(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  type text NOT NULL DEFAULT 'Task',
  priority text NOT NULL DEFAULT 'Medium',
  status text NOT NULL DEFAULT 'To do',
  "dueDate" timestamp,
  area text NOT NULL DEFAULT 'Engineering',
  points integer NOT NULL DEFAULT 3,
  "assigneeId" text REFERENCES "user"(id) ON DELETE SET NULL,
  "reporterId" text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  "sprintId" text REFERENCES "sprint"(id) ON DELETE SET NULL,
  blocked boolean NOT NULL DEFAULT false,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "taskComment" (
  id text PRIMARY KEY,
  "taskId" text NOT NULL REFERENCES "task"(id) ON DELETE CASCADE,
  "authorId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  body text NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "activity" (
  id text PRIMARY KEY,
  "actorId" text NOT NULL REFERENCES "user"(id) ON DELETE SET NULL,
  "taskId" text REFERENCES "task"(id) ON DELETE CASCADE,
  action text NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_task_sprint" ON "task" ("sprintId");
CREATE INDEX IF NOT EXISTS "idx_task_epic" ON "task" ("epicId");
`

async function columnExists(table, column) {
  const { rows } = await pool.query(
    'SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2 LIMIT 1',
    [table, column],
  )
  return rows.length > 0
}

async function main() {
  const client = await pool.connect()
  try {
    if (fresh) {
      await client.query('DROP SCHEMA public CASCADE')
      await client.query('CREATE SCHEMA public')
      console.log('  dropped & recreated public schema')
    }

    // Legacy pre-teams layout: task had no projectId (it used a workspace_id /
    // workspace_member model). Detect and drop the whole family on the old shape;
    // the auth tables (user/session/account/verification) are preserved.
    const taskExists = await columnExists('task', 'id')
    const taskHasProjectId = await columnExists('task', 'projectId')
    if (taskExists && !taskHasProjectId) {
      console.log('  legacy task table detected (no projectId) - dropping workspace family...')
      const legacyTables = [
        'task_comment', 'taskComment', 'activity', 'task', 'sprint', 'epic',
        'teamMember', 'project', 'team', 'workspace_member',
      ]
      for (const t of legacyTables) {
        await client.query(`DROP TABLE IF EXISTS "${t}" CASCADE`)
      }
    }

    await client.query(DDL)

    // ---- seed defaults (only when the workspace is empty) ----
    const defaultTeamId = '61c5d519-9886-4720-9112-cf9d5b581670'
    const teamCount = (await client.query('SELECT COUNT(*)::int AS c FROM "team"')).rows[0].c
    let seedTeamId = defaultTeamId
    if (teamCount === 0) {
      await client.query(
        'INSERT INTO "team" (id, name, description, "createdAt", "updatedAt") VALUES ($1, $2, $3, now(), now())',
        [seedTeamId, 'Engineering', 'Core engineering team'],
      )
      console.log('  seeded default team Engineering')
    } else {
      const row = await client.query('SELECT id FROM "team" ORDER BY "createdAt" LIMIT 1')
      if (row.rows[0]) seedTeamId = row.rows[0].id
    }

    const projectCount = (await client.query('SELECT COUNT(*)::int AS c FROM "project"')).rows[0].c
    if (projectCount === 0) {
      await client.query(
        'INSERT INTO "project" (id, key, name, description, "teamId", "issueCounter", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, 100, now(), now())',
        ['7bc1c349-bea3-4c89-9fea-bccc21dc7e98', 'ORB', 'Core Console', 'Default project', seedTeamId],
      )
      console.log('  seeded default project ORB (Core Console)')
    }

    const { rows: tables } = await client.query(
      "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
    )
    const target = process.env.DATABASE_URL.split('@').pop() ?? '?'
    console.log(`\nMigration complete (${fresh ? 'fresh ' : ''}${target})`)
    console.log('Tables:', tables.map((t) => t.name).join(', '))
  } finally {
    client.release()
  }
}

main()
  .catch((err) => {
    console.error('migrate: failed:', err)
    process.exitCode = 1
  })
  .finally(() => pool.end())
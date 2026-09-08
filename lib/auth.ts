import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { db } from '@/lib/db'
import { user, session, account, verification } from '@/lib/db/schema'

const origin = (value?: string) => value ? (value.startsWith('http') ? value : `https://${value}`) : undefined
const trustedOrigins = [
  'http://localhost:3000',
  origin(process.env.V0_RUNTIME_URL), origin(process.env.V0_DEV_APP_URL), origin(process.env.V0_BUILD_URL), origin(process.env.V0_SANDBOX_URL),
  origin(process.env.VERCEL_URL), origin(process.env.VERCEL_PROJECT_PRODUCTION_URL),
].filter(Boolean) as string[]

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg', schema: { user, session, account, verification } }),
  emailAndPassword: { enabled: true },
  baseURL: origin(process.env.BETTER_AUTH_URL) || origin(process.env.VERCEL_PROJECT_PRODUCTION_URL) || origin(process.env.VERCEL_URL) || origin(process.env.V0_RUNTIME_URL) || 'http://localhost:3000',
  trustedOrigins,
})
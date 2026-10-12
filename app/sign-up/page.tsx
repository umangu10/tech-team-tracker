'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'

const field =
  'h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-4 focus:ring-zinc-900/10'

export default function SignUpPage() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setLoading(true)
    const data = new FormData(event.currentTarget)
    const result = await authClient.signUp.email({
      name: String(data.get('name')),
      email: String(data.get('email')),
      password: String(data.get('password')),
    })
    if (result.error) {
      setError('Unable to create your account. Try a different email.')
      setLoading(false)
    } else {
      router.push('/')
      router.refresh()
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-6">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-900 text-sm font-semibold text-white">
            O
          </div>
          <span className="text-sm font-semibold tracking-tight text-zinc-900">Orbit</span>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Create your account</h1>
        <p className="mt-1.5 text-sm text-zinc-500">Start organizing engineering work with your team.</p>

        <form onSubmit={submit} className="mt-7 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-zinc-700">Name</span>
            <input name="name" required autoComplete="name" placeholder="Your name" className={field} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-zinc-700">Email</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@company.com"
              className={field}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-zinc-700">Password</span>
            <input
              name="password"
              type="password"
              minLength={8}
              required
              autoComplete="new-password"
              placeholder="At least 8 characters"
              className={field}
            />
          </label>
          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
              {error}
            </p>
          )}
          <button
            disabled={loading}
            className="mt-1 h-11 rounded-lg bg-zinc-900 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-60"
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-500">
          Already have an account?{' '}
          <a className="font-medium text-zinc-900 underline-offset-4 hover:underline" href="/sign-in">
            Sign in
          </a>
        </p>
      </div>
    </main>
  )
}

'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'

export default function SignInPage() {
  const router = useRouter()
  const [error, setError] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('')
    const data = new FormData(event.currentTarget)
    const result = await authClient.signIn.email({ email: String(data.get('email')), password: String(data.get('password')) })
    if (result.error) setError('Unable to sign in. Check your email and password.')
    else { router.push('/'); router.refresh() }
  }
  return <main className="flex min-h-screen items-center justify-center bg-background p-6"><form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-5 rounded-xl border bg-card p-8 shadow-sm"><div><p className="text-sm font-semibold text-primary">Orbit</p><h1 className="mt-2 text-2xl font-semibold tracking-tight">Welcome back</h1><p className="mt-1 text-sm text-muted-foreground">Sign in to manage your team work.</p></div><label className="flex flex-col gap-2 text-sm font-medium">Email<input name="email" type="email" required className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></label><label className="flex flex-col gap-2 text-sm font-medium">Password<input name="password" type="password" required className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></label>{error && <p className="text-sm text-destructive">{error}</p>}<button className="h-10 rounded-md bg-primary text-sm font-semibold text-primary-foreground">Sign in</button><a className="text-center text-sm text-muted-foreground hover:text-foreground" href="/sign-up">Create an account</a></form></main>
}

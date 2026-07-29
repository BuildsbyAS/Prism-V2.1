'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase, isSupabaseConfigured, isAllowedEmail, ALLOWED_EMAIL_DOMAIN } from '@/lib/supabase'

type Mode = 'signin' | 'signup'

/**
 * Where to go after signing in. `next` comes from the URL, so it's attacker-
 * controllable: only same-site paths are honoured. `//evil.com` is a
 * protocol-relative URL that browsers treat as another origin, hence the second
 * check — a lone `startsWith('/')` would wave it through.
 */
function safeNext(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/creator'
  return next
}

/**
 * `useSearchParams` opts the tree below it out of prerendering, so the form sits
 * behind a Suspense boundary — without one the whole route fails to prerender at
 * build time.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm />
    </Suspense>
  )
}

/** Matches the real page's frame, so the swap on hydration isn't a jump. */
function LoginFallback() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col justify-center px-5 py-10">
      <p className="text-[14px] font-medium text-muted">Prism</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-[28px]">Sign in</h1>
    </main>
  )
}

function LoginForm() {
  const router = useRouter()
  const next = safeNext(useSearchParams().get('next'))
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function emailPassword() {
    if (!supabase) return
    setError(null)
    if (!isAllowedEmail(email)) {
      setError(`Use your ${ALLOWED_EMAIL_DOMAIN} email address.`)
      return
    }
    setBusy(true)
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
          },
        })
        if (error) return setError(error.message)
        setError('Check your inbox to confirm your email, then sign in.')
        setMode('signin')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) return setError(error.message)
        router.push(next)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col justify-center px-5 py-10">
      <p className="text-[14px] font-medium text-muted">Prism</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-[28px]">
        Sign in to build forms
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">
        Prism is a Noon internal tool — sign in with your{' '}
        <span className="font-medium text-ink">{ALLOWED_EMAIL_DOMAIN}</span> account.
      </p>

      <div className="mt-7 rounded-[26px] border border-line bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_16px_44px_-24px_rgba(0,0,0,0.18)]">
        {!isSupabaseConfigured ? (
          <>
            <div className="rounded-xl border border-line bg-black/[0.015] px-4 py-3 text-[14px] leading-relaxed text-muted">
              <b className="text-ink">Demo mode.</b> No Supabase project is connected, so auth is
              stubbed. Continue as a demo creator to explore the builder — your forms save to this
              browser only.
            </div>
            <button
              type="button"
              onClick={() => router.push('/creator')}
              className="mt-4 w-full rounded-[16px] bg-ink px-5 py-2.5 text-[14px] font-medium text-white transition hover:opacity-90"
            >
              Continue in demo mode →
            </button>
          </>
        ) : (
          <>
            <div className="space-y-2.5">
              <div>
                <label htmlFor="email" className="mb-1.5 block text-[14px] font-medium">
                  Work email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  autoComplete="email"
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={`you${ALLOWED_EMAIL_DOMAIN}`}
                  className="w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm outline-none placeholder:text-muted focus:border-ink"
                />
              </div>
              <div>
                <label htmlFor="password" className="mb-1.5 block text-[14px] font-medium">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm outline-none placeholder:text-muted focus:border-ink"
                />
              </div>
            </div>

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

            <button
              type="button"
              onClick={emailPassword}
              disabled={busy}
              className="mt-4 w-full rounded-[16px] bg-ink px-5 py-2.5 text-[14px] font-medium text-white transition enabled:hover:opacity-90 disabled:opacity-40"
            >
              {busy ? 'Working…' : mode === 'signup' ? 'Create account' : 'Sign in'}
            </button>

            <button
              type="button"
              onClick={() => {
                setMode(mode === 'signup' ? 'signin' : 'signup')
                setError(null)
              }}
              className="mt-3 w-full text-center text-[14px] font-medium text-muted transition hover:text-ink"
            >
              {mode === 'signup'
                ? 'Already have an account? Sign in'
                : 'Need an account? Create one'}
            </button>
          </>
        )}
      </div>
    </main>
  )
}

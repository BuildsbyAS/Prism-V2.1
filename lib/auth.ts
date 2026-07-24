'use client'

import { useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured, isAllowedEmail } from './supabase'
import { DEMO_CREATOR_ID, DEMO_CREATOR_EMAIL } from './store'

export interface CurrentUser {
  id: string
  email: string
}

export interface AuthState {
  user: CurrentUser | null
  loading: boolean
  /** Demo mode = no Supabase project; a stub creator is always signed in. */
  demo: boolean
}

/**
 * Current creator, client-side. In demo mode a stub @noon.com user is always
 * present so the creator flow is explorable. In real mode this reflects the
 * Supabase session and only surfaces @noon.com accounts.
 */
export function useCurrentUser(): AuthState {
  // Demo mode is decided by a build-time constant, so seed it in the initializer
  // rather than via a synchronous setState in the effect.
  const [state, setState] = useState<AuthState>(() =>
    isSupabaseConfigured
      ? { user: null, loading: true, demo: false }
      : { user: { id: DEMO_CREATOR_ID, email: DEMO_CREATOR_EMAIL }, loading: false, demo: true },
  )

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return // demo user already seeded

    let active = true
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return
      const email = data.user?.email ?? null
      setState({
        user: data.user && isAllowedEmail(email) ? { id: data.user.id, email: email! } : null,
        loading: false,
        demo: false,
      })
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const email = session?.user?.email ?? null
      setState({
        user: session?.user && isAllowedEmail(email) ? { id: session.user.id, email: email! } : null,
        loading: false,
        demo: false,
      })
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  return state
}

export async function signOut(): Promise<void> {
  if (isSupabaseConfigured && supabase) await supabase.auth.signOut()
}

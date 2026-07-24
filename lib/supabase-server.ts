import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { isSupabaseConfigured } from './supabase'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

/**
 * Request-scoped server client that reads/writes the auth cookie. Use this in
 * Server Components, Route Handlers, and proxy to read the current session under
 * RLS. Returns null in demo mode. `cookies()` is async in this Next version.
 */
export async function getServerSupabase(): Promise<SupabaseClient | null> {
  if (!isSupabaseConfigured) return null
  const cookieStore = await cookies()
  return createServerClient(url as string, anonKey as string, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Called from a Server Component where cookies are read-only — the
          // session refresh is handled by proxy instead. Safe to ignore.
        }
      },
    },
  })
}

/**
 * Service-role client that bypasses RLS. ONLY for trusted server routes that do
 * their own authorization — e.g. the public results link that validates a
 * results_token before returning aggregates. Never expose this to the browser.
 */
export function getServiceSupabase(): SupabaseClient | null {
  if (!url || !serviceKey) return null
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

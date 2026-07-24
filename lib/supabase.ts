import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

/**
 * True only when both public env vars are present. When false the app runs in
 * demo mode: auth is a stubbed local creator and all data lives in the browser's
 * localStorage (see lib/store.ts), so the product is fully clickable with no
 * Supabase project wired up.
 */
export const isSupabaseConfigured = Boolean(url && anonKey)

/**
 * Browser Supabase client (cookie-based session via @supabase/ssr). The anon key
 * is public — every table is gated by Row-Level Security (see supabase/schema.sql).
 * Null in demo mode.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createBrowserClient(url as string, anonKey as string)
  : null

/** Email domain every account is restricted to. */
export const ALLOWED_EMAIL_DOMAIN = '@noon.com'

/** Individual addresses allowed alongside the domain (e.g. the project owner
 *  signing in with a personal account for testing). */
const ALLOWED_EMAILS = ['anuragshastri98@gmail.com']

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const e = email.toLowerCase()
  return e.endsWith(ALLOWED_EMAIL_DOMAIN) || ALLOWED_EMAILS.includes(e)
}

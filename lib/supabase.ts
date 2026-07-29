import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
export { ALLOWED_EMAIL_DOMAIN, isAllowedEmail } from './access'

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

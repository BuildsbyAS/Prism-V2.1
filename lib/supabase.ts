import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

/** True only when both public env vars are present at build time. */
export const isSupabaseConfigured = Boolean(url && anonKey)

/**
 * Browser Supabase client. The anon key is meant to be public — all access is
 * gated by Row-Level Security policies (see supabase/schema.sql). Null when the
 * env vars aren't set, so the UI can fall back to a local demo mode.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string)
  : null

/** Identifies this poll's rows so the table can host more polls later. */
export const POLL_SLUG = 'rnr-pills-vs-checkbox'

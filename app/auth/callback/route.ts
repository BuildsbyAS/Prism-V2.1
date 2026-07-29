import { NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase-server'
import { isAllowedEmail } from '@/lib/supabase'

/**
 * OAuth / email-confirmation return point. Exchanges the code for a session,
 * then enforces the @noon.com domain gate server-side — signing the user out and
 * bouncing them if their email doesn't match. Belt-and-suspenders with RLS.
 */
/** Only same-site paths are honoured — see the note in the login page. */
function safeNext(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/creator'
  return next
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeNext(searchParams.get('next'))

  const supabase = await getServerSupabase()
  if (!supabase || !code) {
    return NextResponse.redirect(`${origin}/login`)
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=auth`)
  }

  const { data } = await supabase.auth.getUser()
  if (!isAllowedEmail(data.user?.email)) {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/login?error=domain`)
  }

  return NextResponse.redirect(`${origin}${next}`)
}

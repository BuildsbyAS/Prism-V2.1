import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { isAllowedEmail } from '@/lib/access'

// NOTE: in this Next.js version the `middleware` file convention was renamed to
// `proxy`. This runs before /creator routes render, refreshing the Supabase
// session cookie and enforcing auth + the @noon.com domain gate server-side.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export async function proxy(request: NextRequest) {
  // Demo mode (no Supabase project): there is no real auth, so let the creator
  // flow through — it runs against the localStorage store.
  if (!url || !anonKey) return NextResponse.next()

  let response = NextResponse.next({ request })

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const allowed = Boolean(user) && isAllowedEmail(user?.email)

  if (!allowed) {
    // Wrong domain but a live session → sign out so they aren't stuck.
    if (user) await supabase.auth.signOut()
    const loginUrl = new URL('/login', request.url)
    if (user) loginUrl.searchParams.set('error', 'domain')
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: ['/creator/:path*'],
}

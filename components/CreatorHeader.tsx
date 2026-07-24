'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCurrentUser, signOut } from '@/lib/auth'

/** Shared top bar for the creator area: wordmark, account, sign out. */
export default function CreatorHeader() {
  const router = useRouter()
  const { user, demo } = useCurrentUser()

  async function handleSignOut() {
    await signOut()
    router.push('/login')
  }

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/80 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-[1100px] items-center justify-between px-4 sm:px-6">
        <Link href="/creator" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          <span className="grid h-6 w-6 place-items-center rounded-lg bg-ink text-[13px] font-bold text-white">
            P
          </span>
          Prism
          {demo && (
            <span className="ml-1 rounded-full bg-draft-bg px-2 py-0.5 text-[13px] font-medium text-draft">
              Demo
            </span>
          )}
        </Link>
        <div className="flex items-center gap-3 text-[14px]">
          {user && <span className="hidden text-muted sm:inline">{user.email}</span>}
          <button
            type="button"
            onClick={handleSignOut}
            className="rounded-[16px] border border-line px-3 py-1.5 font-medium text-ink transition hover:bg-black/[0.03]"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  )
}

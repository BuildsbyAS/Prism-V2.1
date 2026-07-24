'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCurrentUser, signOut } from '@/lib/auth'

/** Pastel account avatar with a small dropdown (email + sign out). */
export default function UserMenu() {
  const router = useRouter()
  const { user, demo } = useCurrentUser()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const initials = (user?.email?.replace(/@.*/, '') ?? 'you').slice(0, 2).toUpperCase()

  async function handleSignOut() {
    await signOut()
    router.push('/login')
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Account"
        className="grid h-9 w-9 place-items-center rounded-full bg-open-bg text-[14px] font-bold text-open transition hover:opacity-90"
      >
        {initials}
      </button>
      {open && (
        <div className="u-popover absolute right-0 z-30 mt-2 w-56 origin-top-right overflow-hidden rounded-2xl border border-line bg-card p-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_16px_44px_-24px_rgba(0,0,0,0.18)]">
          <div className="px-2.5 py-2">
            <p className="text-[14px] font-medium">{user?.email ?? 'Signed out'}</p>
            <p className="mt-0.5 text-[13px] text-muted">{demo ? 'Demo workspace' : 'Noon workspace'}</p>
          </div>
          <div className="my-1 border-t border-line" />
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full rounded-xl px-2.5 py-2 text-left text-[14px] font-medium transition hover:bg-black/[0.04]"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

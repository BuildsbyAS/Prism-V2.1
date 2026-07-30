'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCurrentUser } from '@/lib/auth'
import UpdatesMenu from './UpdatesMenu'
import UserMenu from './UserMenu'

/**
 * Shared top bar for the creator area: wordmark and the two dashboard views on
 * the left, account on the right. The account is a single avatar — email and
 * sign out live inside its dropdown rather than sitting in the bar. The builder
 * has no account control at all; you sign out from here.
 */
export default function CreatorHeader() {
  const { demo } = useCurrentUser()

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-[1100px] items-center justify-between px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-4 sm:gap-7">
          <Link href="/creator" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
            <span className="grid h-6 w-6 place-items-center rounded-lg bg-ink text-[13px] font-bold text-white">
              P
            </span>
            Prism
            {demo && (
              <span className="ml-1 hidden rounded-full bg-draft-bg px-2 py-0.5 text-[13px] font-medium text-draft sm:inline">
                Demo
              </span>
            )}
          </Link>
          <DashboardNav />
        </div>
        <div className="flex items-center gap-1.5">
          <UpdatesMenu />
          <UserMenu />
        </div>
      </div>
    </header>
  )
}

const NAV = [
  { href: '/creator', label: 'My forms' },
  { href: '/creator/team', label: 'Team' },
]

/**
 * The two dashboard views, as links rather than tabs — they are separate routes,
 * so they work from the results page too and the back button behaves. Full-bar
 * height puts each underline on the header's own hairline.
 */
function DashboardNav() {
  const pathname = usePathname()

  return (
    <nav aria-label="Dashboard views" className="flex items-center gap-4 sm:gap-6">
      {NAV.map(({ href, label }) => {
        // Everything outside the team feed — /creator, and a form's results
        // — belongs to your own workspace.
        const active = href === '/creator/team' ? pathname === href : pathname !== '/creator/team'
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`relative flex h-14 items-center whitespace-nowrap text-[14px] font-medium transition ${
              active ? 'text-ink' : 'text-muted hover:text-ink'
            }`}
          >
            {label}
            <span
              className={`absolute inset-x-0 -bottom-px h-[2px] rounded-full transition ${
                active ? 'bg-ink' : 'bg-transparent'
              }`}
            />
          </Link>
        )
      })}
    </nav>
  )
}

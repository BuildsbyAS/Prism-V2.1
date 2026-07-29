'use client'

import { Bell } from '@phosphor-icons/react'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getUpdates, markAllResponsesSeen, markUpdateSeen, type FormUpdate } from '@/lib/store'
import { useCurrentUser } from '@/lib/auth'
import { timeAgo } from '@/lib/format'

/** Background refresh cadence. Responses arrive from voters, not from this tab,
 *  so there is nothing local to react to — it has to be polled. */
const POLL_MS = 45_000

/**
 * Bell menu for form lifecycle and collaboration activity. The database creates
 * recipient-specific events for publishing, votes, collaborator changes and
 * expiry, so every editor gets their own read state.
 */
export default function UpdatesMenu() {
  const router = useRouter()
  const { user } = useCurrentUser()
  const creatorId = user?.id
  const [updates, setUpdates] = useState<FormUpdate[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const refresh = useCallback(() => {
    if (!creatorId) return
    getUpdates(creatorId)
      .then(setUpdates)
      // A failed poll shouldn't surface an error in the header; the next tick retries.
      .catch(() => {})
  }, [creatorId])

  // Poll, and also catch up whenever the tab regains focus after being away.
  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, POLL_MS)
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [refresh])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const total = updates.filter((update) => !update.readAt).length

  async function openForm(u: FormUpdate) {
    setOpen(false)
    setUpdates((prev) =>
      prev.map((update) =>
        update.id === u.id
          ? { ...update, readAt: update.readAt ?? new Date().toISOString() }
          : update,
      ),
    )
    await markUpdateSeen(u.id)
    if (u.actionPath) router.push(u.actionPath)
  }

  async function markAll() {
    if (!creatorId) return
    setUpdates([])
    await markAllResponsesSeen(creatorId)
    refresh()
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o)
          if (!open) refresh()
        }}
        aria-label={total ? `Updates — ${total} new` : 'Updates'}
        className="relative grid h-9 w-9 place-items-center rounded-full text-muted transition hover:bg-black/[0.04] hover:text-ink"
      >
        <BellIcon />
        {total > 0 && (
          // An unread dot rather than a count pill: a "9+" pill is wider than the
          // bell itself, so it either buries the glyph or floats off it. Same
          // green dot the list below uses for unread; the total lives in the
          // panel header and in this button's aria-label.
          <span
            aria-hidden="true"
            className="u-circle absolute right-1 top-1 h-2 w-2 rounded-full bg-open ring-2 ring-bg"
          />
        )}
      </button>

      {open && (
        <div className="u-popover absolute right-0 z-[200] mt-2 w-[340px] origin-top-right overflow-hidden rounded-2xl border border-line bg-card shadow-[0_1px_2px_rgba(0,0,0,0.03),0_16px_44px_-24px_rgba(0,0,0,0.18)]">
          <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
            <p className="text-[14px] font-medium">
              Updates
              {total > 0 && <span className="ml-1.5 text-muted tabular-nums">{total}</span>}
            </p>
            {total > 0 && (
              <button
                type="button"
                onClick={markAll}
                className="text-[13px] font-medium text-muted transition hover:text-ink"
              >
                Mark all read
              </button>
            )}
          </div>

          {updates.length === 0 ? (
            <div className="px-3.5 py-6 text-center">
              <p className="text-[14px] font-medium">You&rsquo;re all caught up</p>
              <p className="mt-1 text-[13px] text-muted">New form activity will show up here.</p>
            </div>
          ) : (
            <ul className="max-h-[340px] overflow-y-auto p-1.5">
              {updates.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => openForm(u)}
                    className="flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition hover:bg-black/[0.04]"
                  >
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                        u.readAt ? 'bg-black/15' : 'bg-open'
                      }`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium">{u.title}</span>
                      <span className="mt-0.5 block text-[13px] leading-snug text-muted">{u.message}</span>
                      <span className="mt-1 block text-[12px] text-muted">{timeAgo(u.createdAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function BellIcon() {
  return <Bell size={18} aria-hidden="true" />
}

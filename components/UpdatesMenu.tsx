'use client'

import { Bell } from '@phosphor-icons/react'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getUpdates, markAllResponsesSeen, markResponsesSeen, type FormUpdate } from '@/lib/store'
import { useCurrentUser } from '@/lib/auth'
import { timeAgo } from '@/lib/format'

/** Background refresh cadence. Responses arrive from voters, not from this tab,
 *  so there is nothing local to react to — it has to be polled. */
const POLL_MS = 45_000

/**
 * Bell menu listing forms that have picked up responses since the creator last
 * opened their results. Selecting one goes straight to that form's results page,
 * which is also what clears it (see markResponsesSeen).
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

  const total = updates.reduce((n, u) => n + u.newCount, 0)

  async function openForm(u: FormUpdate) {
    setOpen(false)
    // Clear it here as well as on the results page, so the badge drops
    // immediately rather than after the destination has mounted and fetched.
    setUpdates((prev) => prev.filter((x) => x.formId !== u.formId))
    await markResponsesSeen(u.formId)
    router.push(`/creator/${u.formId}/results`)
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
        <div className="u-popover absolute right-0 z-30 mt-2 w-[320px] origin-top-right overflow-hidden rounded-2xl border border-line bg-card shadow-[0_1px_2px_rgba(0,0,0,0.03),0_16px_44px_-24px_rgba(0,0,0,0.18)]">
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
              <p className="mt-1 text-[13px] text-muted">New responses will show up here.</p>
            </div>
          ) : (
            <ul className="max-h-[340px] overflow-y-auto p-1.5">
              {updates.map((u) => (
                <li key={u.formId}>
                  <button
                    type="button"
                    onClick={() => openForm(u)}
                    className="flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition hover:bg-black/[0.04]"
                  >
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-open" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium">{u.title}</span>
                      <span className="mt-0.5 block text-[13px] text-muted">
                        {u.newCount} new {u.newCount === 1 ? 'response' : 'responses'} · {timeAgo(u.lastResponseAt)}
                      </span>
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

'use client'

import { useSyncExternalStore } from 'react'

/**
 * Below Tailwind's `md`. The builder's three columns need real width, so on a
 * phone the editor becomes a read-only preview instead (see the edit route).
 */
const QUERY = '(max-width: 767px)'

// Same shape as the other client stores here (saved rail width, dashboard view):
// useSyncExternalStore keeps the server snapshot and the client in step, so
// there's no hydration mismatch to paper over.
let mql: MediaQueryList | null = null

function subscribe(cb: () => void) {
  if (typeof window === 'undefined') return () => {}
  mql ??= window.matchMedia(QUERY)
  mql.addEventListener('change', cb)
  return () => mql?.removeEventListener('change', cb)
}

function getSnapshot(): boolean {
  mql ??= window.matchMedia(QUERY)
  return mql.matches
}

/**
 * The server can't know the viewport, so it answers "not mobile" and the client
 * corrects on mount. Desktop — where editing actually happens — therefore renders
 * right first time; a phone shows the editor for a frame before swapping.
 */
function getServerSnapshot(): boolean {
  return false
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

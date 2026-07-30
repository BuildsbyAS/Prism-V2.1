'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase, isSupabaseConfigured } from './supabase'
import { DEMO_CREATOR_EMAIL } from './store'

/** One person in a form's editor right now. */
export interface PresencePeer {
  email: string
  /** Which screen they have open: 'welcome', 'end', or a page id. */
  screen: string
  /** True for the viewer's own entry — the stack shows you alongside everyone else. */
  self: boolean
}

/** How often a tab says it's still here, and how long silence is tolerated. */
const HEARTBEAT_MS = 4000
const STALE_MS = 14000

/**
 * Demo mode has no accounts: every tab is the same stub creator, so presence
 * would only ever have one person in it and there would be nothing to follow.
 * Each tab after the first therefore adopts a stand-in colleague — the same
 * addresses the seeded forms list as collaborators, so names and avatar colours
 * match the rest of the app. The first tab stays the demo creator, so whoever
 * opened the form first is still its owner.
 */
const DEMO_SEATS = [DEMO_CREATOR_EMAIL, 'sara.k@noon.com', 'dan.ito@noon.com', 'priya.n@noon.com']
const SEAT_KEY = 'prism.presence.seat'
const SEAT_CLAIMS_KEY = 'prism.presence.claims'
/** A claim outlives a heartbeat, so a live tab never loses its seat. */
const CLAIM_TTL_MS = 20000

function readClaims(): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(SEAT_CLAIMS_KEY) ?? '{}')
    return raw && typeof raw === 'object' ? (raw as Record<string, number>) : {}
  } catch {
    return {}
  }
}

/**
 * Take the first seat nobody currently holds, and hold it.
 *
 * Leases rather than a counter: a counter only ever went up, so after a few tabs
 * had been opened and closed *nobody* was the demo creator any more — the person
 * whose forms these are would have been a stranger in their own editor. Expiring
 * claims mean a lone tab is always the creator again.
 *
 * sessionStorage is per tab and survives a reload, so a tab keeps its identity;
 * the claims live in localStorage, which is what the tabs share.
 */
function demoSeat(): string {
  try {
    const now = Date.now()
    const claims = readClaims()
    for (const [seat, until] of Object.entries(claims)) if (until < now) delete claims[seat]
    const held = sessionStorage.getItem(SEAT_KEY)
    const seat = held ?? DEMO_SEATS.find((s) => !(s in claims)) ?? DEMO_SEATS[0]
    claims[seat] = now + CLAIM_TTL_MS
    localStorage.setItem(SEAT_CLAIMS_KEY, JSON.stringify(claims))
    sessionStorage.setItem(SEAT_KEY, seat)
    return seat
  } catch {
    return DEMO_SEATS[0]
  }
}

/** Keep a seat while the tab is still in an editor — see demoSeat. */
function renewSeat(seat: string) {
  try {
    const claims = readClaims()
    claims[seat] = Date.now() + CLAIM_TTL_MS
    localStorage.setItem(SEAT_CLAIMS_KEY, JSON.stringify(claims))
  } catch {
    /* private browsing */
  }
}

/** Distinguishes two tabs belonging to the same person. */
function newTabId(): string {
  return Math.random().toString(36).slice(2, 10)
}

interface Wire {
  type: 'here' | 'gone' | 'who'
  tabId: string
  email?: string
  screen?: string
}

interface Entry {
  /** The form this entry belongs to — see the note about switching forms below. */
  room: string
  email: string
  screen: string
  /** Last heartbeat, ms — what actually decides whether a tab is still open. */
  at: number
}

/**
 * Who else is in this form's editor, and which screen each of them is on.
 *
 * Two transports behind one hook. With Supabase it's Realtime presence, which is
 * built for exactly this — a channel per form, one tracked entry per tab, and a
 * roster that arrives on every join and leave. In demo mode there is no server,
 * so tabs of the same browser gossip over a BroadcastChannel instead; that is
 * also what makes the feature demonstrable without a backend.
 *
 * You are not in the transport's roster at all — your own entry is added here,
 * from what this tab already knows. It costs no round trip, it can't lag behind
 * your own navigation, and it means the stack is never empty.
 *
 * Entries are per person, not per tab: someone with the form open twice is one
 * avatar, on whichever screen they touched last. A stack that grew every time a
 * colleague duplicated a tab would read as a crowd that isn't there.
 */
export function useFormPresence(
  formId: string | null,
  /** The screen the viewer is on — republished whenever it changes. */
  screen: string,
  /** The signed-in creator's address; ignored in demo mode, which seats tabs. */
  viewerEmail: string | null,
  /** Presence is for the editor. Pass false and nothing is published or read. */
  enabled = true,
  /**
   * A peer moved to another screen. Called from the transport, so a follower can
   * navigate in response without an effect watching presence state — the "they
   * moved" event is exactly that, an event.
   */
  onPeerScreen?: (email: string, screen: string) => void,
): { me: string | null; peers: PresencePeer[] } {
  const [tabId] = useState(newTabId)
  // Demo mode's stand-in identity. Read once, in a lazy initialiser rather than
  // an effect, so `me` is a plain derived value and the first render already
  // knows who it is.
  const [seat] = useState(() => (typeof window === 'undefined' || isSupabaseConfigured ? null : demoSeat()))
  const me = (isSupabaseConfigured ? viewerEmail : seat) || null
  const active = Boolean(formId) && enabled && Boolean(me)

  /** Everyone *else*, keyed by tab. Only ever written from a transport callback. */
  const [tabs, setTabs] = useState<Record<string, Entry>>({})

  // The screen the transport should publish, and the caller's move handler.
  // Both in refs so neither a navigation nor a re-render tears the channel down:
  // resubscribing on every click would make everyone else's stack flicker.
  const screenRef = useRef(screen)
  const publishRef = useRef<((screen: string) => void) | null>(null)
  const movedRef = useRef(onPeerScreen)

  useEffect(() => {
    movedRef.current = onPeerScreen
  }, [onPeerScreen])

  useEffect(() => {
    if (!active || !formId || !me) return

    // Which screen each tab was last seen on, so "they moved" can be told apart
    // from a heartbeat repeating what we already knew.
    const wasOn = new Map<string, string>()
    const mark = (id: string, email: string, at: string) => {
      const moved = wasOn.get(id) !== at
      wasOn.set(id, at)
      setTabs((prev) => ({ ...prev, [id]: { room: formId, email, screen: at, at: Date.now() } }))
      if (moved) movedRef.current?.(email, at)
    }
    const drop = (id: string) => {
      wasOn.delete(id)
      setTabs((prev) => {
        if (!(id in prev)) return prev
        const next = { ...prev }
        delete next[id]
        return next
      })
    }

    if (isSupabaseConfigured && supabase) {
      // Held in a local so the cleanup below doesn't have to re-narrow it.
      const client = supabase
      const channel = client.channel(`presence:form:${formId}`, {
        config: { presence: { key: tabId } },
      })
      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState<{ email: string; screen: string }>()
          const seen = new Set<string>()
          for (const [key, entries] of Object.entries(state)) {
            const entry = entries[0]
            // Our own tracked entry is skipped: `me` covers it, and its screen
            // would trail a round trip behind the one on screen.
            if (key === tabId || !entry?.email) continue
            seen.add(key)
            mark(key, entry.email, entry.screen ?? 'welcome')
          }
          // The server's roster is authoritative about who left, so anyone
          // missing from a sync is gone — no heartbeat needed to notice.
          for (const key of [...wasOn.keys()]) if (!seen.has(key)) drop(key)
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') void channel.track({ email: me, screen: screenRef.current })
        })
      publishRef.current = (s) => void channel.track({ email: me, screen: s })
      return () => {
        publishRef.current = null
        void client.removeChannel(channel)
      }
    }

    // ---- Demo: tabs of this browser, over a BroadcastChannel ---------------
    let bc: BroadcastChannel
    try {
      bc = new BroadcastChannel(`prism.presence.${formId}`)
    } catch {
      return // no BroadcastChannel (older Safari): you simply see only yourself
    }
    const say = (msg: Wire) => bc.postMessage(msg)
    bc.onmessage = (event: MessageEvent<Wire>) => {
      const msg = event.data
      if (msg.tabId === tabId) return
      if (msg.type === 'gone') return drop(msg.tabId)
      if (msg.type === 'who') {
        // Someone just arrived and has no idea who is already here.
        say({ type: 'here', tabId, email: me, screen: screenRef.current })
        return
      }
      if (msg.email) mark(msg.tabId, msg.email, msg.screen ?? 'welcome')
    }
    say({ type: 'who', tabId })
    say({ type: 'here', tabId, email: me, screen: screenRef.current })

    // A tab that crashes, or is closed while asleep, never sends 'gone' — so
    // freshness is what really decides who is still here.
    const beat = setInterval(() => {
      say({ type: 'here', tabId, email: me, screen: screenRef.current })
      renewSeat(me)
      const cutoff = Date.now() - STALE_MS
      setTabs((prev) => {
        const next: Record<string, Entry> = {}
        for (const [id, p] of Object.entries(prev)) {
          if (p.at > cutoff) next[id] = p
          else wasOn.delete(id)
        }
        return next
      })
    }, HEARTBEAT_MS)

    const leave = () => say({ type: 'gone', tabId })
    window.addEventListener('pagehide', leave)
    publishRef.current = (s) => say({ type: 'here', tabId, email: me, screen: s })

    return () => {
      publishRef.current = null
      window.removeEventListener('pagehide', leave)
      clearInterval(beat)
      leave()
      bc.close()
    }
  }, [active, formId, me, tabId])

  // Tell the others where you are now. In an effect, so it runs after the join
  // above has had a chance to install a publisher.
  useEffect(() => {
    screenRef.current = screen
    publishRef.current?.(screen)
  }, [screen])

  const peers = useMemo(() => {
    if (!active || !me || !formId) return []
    // You first — the anchor for everything beside you.
    const out: PresencePeer[] = [{ email: me, screen, self: true }]
    const seen = new Set([me.trim().toLowerCase()])
    // Freshest tab wins, so someone with two tabs open shows on the screen they
    // most recently touched. Entries are also filtered by form: opening another
    // form reuses this hook, and its roster must not inherit the last one's.
    for (const entry of Object.values(tabs).sort((a, b) => b.at - a.at)) {
      if (entry.room !== formId) continue
      const key = entry.email.trim().toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ email: entry.email, screen: entry.screen, self: false })
    }
    return out
  }, [tabs, me, screen, active, formId])

  return { me, peers }
}

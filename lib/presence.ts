'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase, isSupabaseConfigured } from './supabase'
import { DEMO_CREATOR_EMAIL } from './store'
import type { Form, Option, Page, Widget } from './types'

/** One person in a form's editor right now. */
export interface PresencePeer {
  email: string
  /** Which screen they have open: 'welcome', 'end', or a page id. */
  screen: string
  /**
   * What they have selected, as a key the editor can match against its own
   * selection — see `selectionKey`. Null while they have nothing selected.
   */
  selection: string | null
  /** True for the viewer's own entry — the stack shows you alongside everyone else. */
  self: boolean
}

/**
 * A collaborator's claim on something, in their avatar's colour.
 *
 * The colour is the whole point: it's what ties an outline on the canvas to a
 * face in the header, so "who is editing this" needs no explaining.
 */
export interface PeerMark {
  color: string
  /** First name — enough to tell two collaborators apart in a small tag. */
  name: string
}

/**
 * One change to the document, as it happens.
 *
 * Field patches carry only the keys that changed, so two people working on
 * different fields of the same option don't overwrite each other. The `rows`
 * forms carry a whole collection, which is what adding, deleting, duplicating
 * and reordering all amount to.
 *
 * `reload` says "fetch it yourself": the escape hatch for an edit too big to put
 * on the wire (a pasted data URL in demo mode) and for anything that needs a
 * clean slate.
 */
export type DocEdit =
  | { t: 'form'; patch: Partial<Form> }
  | { t: 'page'; id: string; patch: Partial<Page> }
  | { t: 'option'; id: string; patch: Partial<Option> }
  | { t: 'widget'; id: string; patch: Partial<Widget> }
  | { t: 'pages'; rows: Page[] }
  | { t: 'options'; rows: Option[] }
  | { t: 'widgets'; rows: Widget[] }
  | { t: 'reload' }

/** How often a tab says it's still here, and how long silence is tolerated. */
const HEARTBEAT_MS = 4000
const STALE_MS = 14000

/**
 * Supabase Realtime caps a broadcast payload (256KB). Demo mode's data URLs sail
 * past that, so anything approaching it is sent as `reload` instead — the peer
 * reads the change from storage rather than from the message.
 */
const MAX_EDIT_BYTES = 180_000

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
  type: 'here' | 'gone' | 'who' | 'edit'
  tabId: string
  email?: string
  screen?: string
  selection?: string | null
  /** When this tab last navigated or selected something; heartbeats preserve it. */
  activityAt?: number
  edit?: DocEdit
}

interface Entry {
  /** The form this entry belongs to — see the note about switching forms below. */
  room: string
  email: string
  screen: string
  selection: string | null
  /** Last heartbeat received, ms — what decides whether a tab is still open. */
  seenAt: number
  /**
   * Last real navigation/selection in this tab.
   *
   * This deliberately does not advance with a heartbeat. If one collaborator
   * has two editor tabs open, an idle tab must not beat the tab they are
   * actively using merely because its heartbeat happened to arrive last.
   */
  activityAt: number
}

interface Where {
  screen: string
  selection: string | null
  activityAt: number
}

/**
 * The live side of a form's editor: who else is in it, where they are, and the
 * edits they're making.
 *
 * Two transports behind one hook. With Supabase it's a Realtime channel —
 * presence for the roster, broadcast for the edits. In demo mode there is no
 * server, so tabs of the same browser gossip over a BroadcastChannel instead;
 * that is also what makes collaboration demonstrable without a backend.
 *
 * You are not in the transport's roster at all — your own entry is added here,
 * from what this tab already knows. It costs no round trip, it can't lag behind
 * your own navigation, and it means the stack is never empty.
 *
 * Entries are per person, not per tab: someone with the form open twice is one
 * avatar, on whichever screen they touched last. A stack that grew every time a
 * colleague duplicated a tab would read as a crowd that isn't there.
 */
export function useFormRoom({
  formId,
  screen,
  selection,
  viewerEmail,
  enabled = true,
  onPeerLocation,
  onEdit,
}: {
  formId: string | null
  /** The screen the viewer is on — republished whenever it changes. */
  screen: string
  /** What the viewer has selected, for everyone else's outlines. */
  selection: string | null
  /** The signed-in creator's address; ignored in demo mode, which seats tabs. */
  viewerEmail: string | null
  /** Presence is for the editor. Pass false and nothing is published or read. */
  enabled?: boolean
  /** A peer changed screen or selection, so a follower can mirror their view. */
  onPeerLocation?: (email: string, screen: string, selection: string | null) => void
  /** A peer changed the document. Apply it to local state. */
  onEdit?: (edit: DocEdit) => void
}): { me: string | null; peers: PresencePeer[]; send: (edit: DocEdit) => void } {
  const [tabId] = useState(newTabId)
  const [joinedAt] = useState(Date.now)
  // Demo mode's stand-in identity. Read once, in a lazy initialiser rather than
  // an effect, so `me` is a plain derived value and the first render already
  // knows who it is.
  const [seat] = useState(() => (typeof window === 'undefined' || isSupabaseConfigured ? null : demoSeat()))
  const me = (isSupabaseConfigured ? viewerEmail : seat) || null
  const active = Boolean(formId) && enabled && Boolean(me)

  /** Everyone *else*, keyed by tab. Only ever written from a transport callback. */
  const [tabs, setTabs] = useState<Record<string, Entry>>({})

  // What to publish, and the caller's handlers. All in refs so neither a
  // navigation nor a re-render tears the channel down: resubscribing on every
  // keystroke would make everyone else's stack flicker.
  const whereRef = useRef<Where>({ screen, selection, activityAt: joinedAt })
  const publishRef = useRef<((where: Where) => void) | null>(null)
  const sendRef = useRef<((edit: DocEdit) => void) | null>(null)
  const movedRef = useRef(onPeerLocation)
  const editedRef = useRef(onEdit)

  useEffect(() => {
    movedRef.current = onPeerLocation
    editedRef.current = onEdit
  }, [onPeerLocation, onEdit])

  useEffect(() => {
    if (!active || !formId || !me) return

    // Which location each tab was last seen at, so a real screen/selection move
    // can be told apart from a heartbeat repeating the same presence payload.
    const wasAt = new Map<string, { screen: string; selection: string | null }>()
    const mark = (
      id: string,
      email: string,
      at: string,
      selection: string | null,
      activityAt = Date.now(),
    ) => {
      const previous = wasAt.get(id)
      const moved = previous?.screen !== at || previous.selection !== selection
      wasAt.set(id, { screen: at, selection })
      setTabs((prev) => ({
        ...prev,
        [id]: {
          room: formId,
          email,
          screen: at,
          selection,
          seenAt: Date.now(),
          activityAt,
        },
      }))
      if (moved) movedRef.current?.(email, at, selection)
    }
    const drop = (id: string) => {
      wasAt.delete(id)
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
          const state = channel.presenceState<{
            email: string
            screen: string
            selection: string | null
            activityAt?: number
          }>()
          const seen = new Set<string>()
          for (const [key, entries] of Object.entries(state)) {
            const entry = entries[0]
            // Our own tracked entry is skipped: `me` covers it, and its screen
            // would trail a round trip behind the one on screen.
            if (key === tabId || !entry?.email) continue
            seen.add(key)
            mark(
              key,
              entry.email,
              entry.screen ?? 'welcome',
              entry.selection ?? null,
              entry.activityAt,
            )
          }
          // The server's roster is authoritative about who left, so anyone
          // missing from a sync is gone — no heartbeat needed to notice.
          for (const key of [...wasAt.keys()]) if (!seen.has(key)) drop(key)
        })
        // Broadcast, not presence: an edit is an event that happened once, not a
        // fact about who is here. Realtime doesn't echo it back to the sender.
        .on('broadcast', { event: 'edit' }, (msg) => editedRef.current?.(msg.payload as DocEdit))
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') void channel.track({ email: me, ...whereRef.current })
        })
      publishRef.current = (where) => void channel.track({ email: me, ...where })
      sendRef.current = (edit) => void channel.send({ type: 'broadcast', event: 'edit', payload: edit })
      return () => {
        publishRef.current = null
        sendRef.current = null
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
    const here = (): Wire => ({ type: 'here', tabId, email: me, ...whereRef.current })
    bc.onmessage = (event: MessageEvent<Wire>) => {
      const msg = event.data
      if (msg.tabId === tabId) return
      if (msg.type === 'edit') return void (msg.edit && editedRef.current?.(msg.edit))
      if (msg.type === 'gone') return drop(msg.tabId)
      if (msg.type === 'who') {
        // Someone just arrived and has no idea who is already here.
        say(here())
        return
      }
      if (msg.email) {
        mark(
          msg.tabId,
          msg.email,
          msg.screen ?? 'welcome',
          msg.selection ?? null,
          msg.activityAt,
        )
      }
    }
    say({ type: 'who', tabId })
    say(here())

    // A tab that crashes, or is closed while asleep, never sends 'gone' — so
    // freshness is what really decides who is still here.
    const beat = setInterval(() => {
      say(here())
      renewSeat(me)
      const cutoff = Date.now() - STALE_MS
      setTabs((prev) => {
        const next: Record<string, Entry> = {}
        for (const [id, p] of Object.entries(prev)) {
          if (p.seenAt > cutoff) next[id] = p
          else wasAt.delete(id)
        }
        return next
      })
    }, HEARTBEAT_MS)

    const leave = () => say({ type: 'gone', tabId })
    window.addEventListener('pagehide', leave)
    publishRef.current = (where) => say({ type: 'here', tabId, email: me, ...where })
    sendRef.current = (edit) => say({ type: 'edit', tabId, edit })

    return () => {
      publishRef.current = null
      sendRef.current = null
      window.removeEventListener('pagehide', leave)
      clearInterval(beat)
      leave()
      bc.close()
    }
  }, [active, formId, me, tabId])

  // Tell the others where you are now. In an effect, so it runs after the join
  // above has had a chance to install a publisher.
  useEffect(() => {
    const activityAt = Math.max(Date.now(), whereRef.current.activityAt + 1)
    const where = { screen, selection, activityAt }
    whereRef.current = where
    publishRef.current?.(where)
  }, [screen, selection])

  const send = useCallback((edit: DocEdit) => {
    if (!sendRef.current) return
    // Editing is activity too. A collaborator may keep typing in the same field,
    // so their screen and selection do not change; advancing the activity clock
    // here still keeps that working tab ahead of an idle duplicate tab.
    const activityAt = Math.max(Date.now(), whereRef.current.activityAt + 1)
    const where = { ...whereRef.current, activityAt }
    whereRef.current = where
    publishRef.current?.(where)
    // Too big for the wire — tell them to read it from storage instead. Measured
    // rather than assumed: only media-carrying patches ever get near the cap.
    if (edit.t !== 'reload' && JSON.stringify(edit).length > MAX_EDIT_BYTES) {
      sendRef.current({ t: 'reload' })
      return
    }
    sendRef.current(edit)
  }, [])

  const peers = useMemo(() => {
    if (!active || !me || !formId) return []
    // You first — the anchor for everything beside you.
    const out: PresencePeer[] = [{ email: me, screen, selection, self: true }]
    const seen = new Set([me.trim().toLowerCase()])
    // The tab they most recently interacted with wins, not the one whose
    // heartbeat arrived last. Entries are also filtered by form: opening
    // another form reuses this hook, and its roster must not inherit the last
    // one's.
    for (const entry of Object.values(tabs).sort(
      (a, b) => b.activityAt - a.activityAt || b.seenAt - a.seenAt,
    )) {
      if (entry.room !== formId) continue
      const key = entry.email.trim().toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ email: entry.email, screen: entry.screen, selection: entry.selection, self: false })
    }
    return out
  }, [tabs, me, screen, selection, active, formId])

  return { me, peers, send }
}

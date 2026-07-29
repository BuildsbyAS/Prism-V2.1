'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

/** Keyboard nudge, for the same reason the handle is focusable at all. */
const STEP = 16

interface PanelSpec {
  key: string
  min: number
  max: number
  def: number
  /** Which edge the handle sits on — also which drag direction grows the panel. */
  side: 'left' | 'right'
  label: string
}

const RAIL: PanelSpec = {
  key: 'prism.builder.railWidth',
  min: 150,
  max: 400,
  def: 216,
  side: 'left',
  label: 'Resize sidebar',
}

const PANEL: PanelSpec = {
  key: 'prism.builder.panelWidth',
  min: 260,
  max: 400,
  def: 320,
  side: 'right',
  label: 'Resize properties panel',
}

const clamp = (spec: PanelSpec, w: number) => Math.min(spec.max, Math.max(spec.min, Math.round(w)))

/**
 * One width store per panel. The saved value lives in localStorage and reaches
 * React through useSyncExternalStore, which keeps the server snapshot (the
 * default) and the client in step without a hydration gap — the same shape the
 * dashboard uses for its view preference.
 */
function makeStore(spec: PanelSpec) {
  let cache = spec.def
  let read = false
  const listeners = new Set<() => void>()

  return {
    spec,
    subscribe(cb: () => void) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    get(): number {
      // Read once. Re-reading on every snapshot would clobber the live value a
      // drag is pushing through the cache, since that isn't written until release.
      if (!read) {
        read = true
        const saved = Number(localStorage.getItem(spec.key))
        if (saved) cache = clamp(spec, saved)
      }
      return cache
    },
    getServer(): number {
      return spec.def
    },
    set(w: number) {
      cache = w
      listeners.forEach((cb) => cb())
    },
    // Persisted on release, not per frame — one drag fires dozens of moves and
    // localStorage writes are synchronous.
    save(w: number) {
      localStorage.setItem(spec.key, String(w))
    },
  }
}

const railStore = makeStore(RAIL)
const panelStore = makeStore(PANEL)

type Store = ReturnType<typeof makeStore>

function usePanelWidthFrom(store: Store) {
  const width = useSyncExternalStore(store.subscribe, store.get, store.getServer)
  const onResize = useCallback((w: number) => store.set(w), [store])
  const onCommit = useCallback((w: number) => store.save(w), [store])
  return { spec: store.spec, width, onResize, onCommit }
}

/** Width of the builder's left rail, in px. */
export function useRailWidth() {
  return usePanelWidthFrom(railStore)
}

/** Width of the builder's right properties panel, in px. */
export function usePanelWidth() {
  return usePanelWidthFrom(panelStore)
}

/**
 * Drag handle on a panel's inner edge. Absolutely positioned against the builder
 * grid rather than living inside the panel itself: both panels scroll, so a child
 * of one would slide out of view with its content.
 */
export default function PanelResizer({
  spec,
  width,
  onResize,
  onCommit,
}: {
  spec: PanelSpec
  width: number
  onResize: (w: number) => void
  onCommit: (w: number) => void
}) {
  const start = useRef<{ x: number; w: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  // A left panel grows as the pointer moves right; a right panel grows as it
  // moves left, since its inner edge travels the other way.
  const grow = spec.side === 'left' ? 1 : -1

  // Without this, dragging across the canvas selects the copy underneath it.
  useEffect(() => {
    if (!dragging) return
    const prev = document.body.style.userSelect
    document.body.style.userSelect = 'none'
    return () => {
      document.body.style.userSelect = prev
    }
  }, [dragging])

  function nudge(delta: number) {
    const next = clamp(spec, width + delta)
    onResize(next)
    onCommit(next)
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={spec.label}
      aria-valuenow={width}
      aria-valuemin={spec.min}
      aria-valuemax={spec.max}
      tabIndex={0}
      onDoubleClick={() => nudge(spec.def - width)}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
        e.preventDefault()
        // Arrow keys follow the pointer: the key that would drag the edge
        // outward is the one that makes the panel bigger.
        nudge((e.key === 'ArrowLeft' ? -STEP : STEP) * grow)
      }}
      onPointerDown={(e) => {
        start.current = { x: e.clientX, w: width }
        setDragging(true)
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        if (!start.current) return
        onResize(clamp(spec, start.current.w + (e.clientX - start.current.x) * grow))
      }}
      onPointerUp={(e) => {
        if (!start.current) return
        start.current = null
        setDragging(false)
        e.currentTarget.releasePointerCapture(e.pointerId)
        onCommit(width)
      }}
      // The panel's own border stays put; this draws a heavier line over it
      // while the handle is hovered, dragged, or focused.
      className={`absolute inset-y-0 z-10 hidden w-2 cursor-col-resize after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:transition-colors hover:after:bg-ink/20 focus-visible:outline-none focus-visible:after:bg-ink/40 md:block ${
        spec.side === 'left' ? '-translate-x-1/2' : 'translate-x-1/2'
      } ${dragging ? 'after:bg-ink/40' : 'after:bg-transparent'}`}
      style={spec.side === 'left' ? { left: width } : { right: width }}
    />
  )
}

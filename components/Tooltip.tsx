'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/** Matches the delay the CSS-only version used before. */
const OPEN_DELAY = 300

/**
 * Small hover tooltip for icon-only controls.
 *
 * The label is fixed and portalled to `document.body`. Fixed positioning escapes
 * scrolling columns that would otherwise clip it; the portal also escapes
 * transformed ancestors such as animated dashboard cards, which establish a new
 * containing block and would reinterpret viewport coordinates relative to the
 * card.
 */
export default function Tooltip({
  label,
  side = 'top',
  className = '',
  /** For triggers whose size is computed — a chart segment's width, say. */
  style,
  children,
}: {
  label: string
  side?: 'top' | 'bottom'
  className?: string
  style?: React.CSSProperties
  children: React.ReactNode
}) {
  const triggerRef = useRef<HTMLSpanElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [open, setOpen] = useState(false)

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }, [])

  const show = useCallback(() => {
    cancel()
    timer.current = setTimeout(() => setOpen(true), OPEN_DELAY)
  }, [cancel])

  const hide = useCallback(() => {
    cancel()
    setOpen(false)
  }, [cancel])

  useEffect(() => cancel, [cancel])

  // A fixed label would otherwise hang in place while the column scrolls away
  // underneath it. Capture, so it fires for any scrolling ancestor.
  useEffect(() => {
    if (!open) return
    window.addEventListener('scroll', hide, true)
    return () => window.removeEventListener('scroll', hide, true)
  }, [open, hide])

  // Measured after mount so the label can be centred on the trigger and kept
  // inside the viewport — its width isn't known until it renders.
  const place = useCallback(
    (node: HTMLSpanElement | null) => {
      const r = triggerRef.current?.getBoundingClientRect()
      if (!node || !r) return
      const { offsetWidth: w, offsetHeight: h } = node
      const centred = r.left + r.width / 2 - w / 2
      node.style.left = `${Math.min(Math.max(8, centred), window.innerWidth - w - 8)}px`
      node.style.top = side === 'top' ? `${Math.max(8, r.top - h - 8)}px` : `${r.bottom + 8}px`
    },
    [side],
  )

  return (
    <span
      ref={triggerRef}
      className={`relative inline-flex ${className}`}
      style={style}
      onPointerEnter={show}
      onPointerLeave={hide}
      onPointerDown={hide}
      onFocusCapture={show}
      onBlurCapture={hide}
    >
      {children}
      {open &&
        createPortal(
          <span
            ref={place}
            role="tooltip"
            className="u-popover pointer-events-none fixed z-50 whitespace-nowrap rounded-lg bg-ink px-2 py-1 text-[13px] font-medium text-white shadow-[0_4px_12px_-4px_rgba(0,0,0,0.4)]"
            style={{ transformOrigin: side === 'top' ? 'bottom' : 'top' }}
          >
            {label}
          </span>,
          document.body,
        )}
    </span>
  )
}

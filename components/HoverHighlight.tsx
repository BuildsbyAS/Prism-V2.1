'use client'

import { useRef, useState } from 'react'

interface Box {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Luma-style moving highlight: a single soft box that slides/morphs to whatever
 * child you hover, instead of each item toggling its own background. Mark the
 * hoverable children with `data-hl`. The box tracks their bounds and eases into
 * position — same-size items animate transform-only (GPU); differing sizes also
 * ease width/height.
 */
export default function HoverHighlight({
  children,
  className = '',
  radius = 12,
  tone = 'rgba(0,0,0,0.05)',
}: {
  children: React.ReactNode
  className?: string
  radius?: number
  tone?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const last = useRef<HTMLElement | null>(null)
  const [box, setBox] = useState<Box | null>(null)
  const [on, setOn] = useState(false)

  function track(e: React.PointerEvent) {
    const target = (e.target as HTMLElement).closest('[data-hl]') as HTMLElement | null
    const container = ref.current
    if (!target || !container) {
      last.current = null
      setOn(false)
      return
    }
    if (target === last.current) {
      if (!on) setOn(true)
      return // same item — skip the state churn from every pointer move
    }
    last.current = target
    const c = container.getBoundingClientRect()
    const t = target.getBoundingClientRect()
    setBox({ x: t.left - c.left, y: t.top - c.top, w: t.width, h: t.height })
    setOn(true)
  }

  return (
    <div
      ref={ref}
      onPointerMove={track}
      onPointerLeave={() => {
        last.current = null
        setOn(false)
      }}
      className={`relative ${className}`}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0"
        style={{
          borderRadius: radius,
          background: tone,
          width: box?.w ?? 0,
          height: box?.h ?? 0,
          transform: `translate(${box?.x ?? 0}px, ${box?.y ?? 0}px)`,
          opacity: on && box ? 1 : 0,
          transition:
            'transform 220ms var(--ease-out), width 220ms var(--ease-out), height 220ms var(--ease-out), opacity 160ms var(--ease-out)',
        }}
      />
      {children}
    </div>
  )
}

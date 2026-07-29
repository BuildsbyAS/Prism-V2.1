'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarBlank, CaretLeft, CaretRight } from '@phosphor-icons/react'

/**
 * Date field + calendar, in the product's own language.
 *
 * `<input type="date">` hands the calendar to the browser, which draws it in
 * system blue and system type — the one control in the app that looks like it
 * came from somewhere else (and looks different on every OS). This keeps the
 * native input's contract — a local `YYYY-MM-DD` string, so the caller's
 * timezone handling is untouched — and draws the rest itself.
 */

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

/** Popover width; also what decides which edge it hangs from. */
const PANEL_W = 268

/** 'YYYY-MM-DD' → local midnight. `new Date(str)` would read it as UTC and
 *  land on the previous day for anyone west of Greenwich. */
function parseDay(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

function toDayString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function startOfToday(): Date {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate())
}

export default function DatePicker({
  value,
  onChange,
  min,
  invalid = false,
  placeholder = 'Pick a date',
  id,
}: {
  /** Local `YYYY-MM-DD`, or '' for none. */
  value: string
  onChange: (value: string) => void
  /** Earliest selectable day, same format. */
  min?: string
  invalid?: boolean
  placeholder?: string
  id?: string
}) {
  const [open, setOpen] = useState(false)
  const [alignRight, setAlignRight] = useState(false)
  const selected = parseDay(value)
  const minDay = min ? parseDay(min) : null
  const today = startOfToday()

  // Which month the grid is showing, and which day the keyboard is on.
  const [view, setView] = useState(() => {
    const base = selected ?? today
    return new Date(base.getFullYear(), base.getMonth(), 1)
  })
  const [focusDay, setFocusDay] = useState<Date>(selected ?? today)

  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  /** Opening lands on the chosen month, not wherever the last visit left the
   *  grid. Done on the way in rather than in an effect watching `open`, so the
   *  calendar never paints one month and then jumps to another. */
  function toggle() {
    if (!open) {
      const base = selected ?? today
      setView(new Date(base.getFullYear(), base.getMonth(), 1))
      setFocusDay(base)
      // Hang from whichever edge keeps the panel inside. Measured against the
      // dialog it sits in when there is one — this field is the right-hand half
      // of a narrow modal, so growing rightwards would put the calendar outside
      // the card even though there's viewport to spare.
      const r = triggerRef.current?.getBoundingClientRect()
      const box = triggerRef.current?.closest('.u-modal')?.getBoundingClientRect()
      const limit = box ? box.right : window.innerWidth
      setAlignRight(Boolean(r && r.left + PANEL_W > limit - 8))
    }
    setOpen((o) => !o)
  }

  // Dismiss on outside click or Escape, and hand focus back to the field.
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('mousedown', onDown)
    // Capture: the dialog this sits in also closes on Escape, and the calendar
    // is the innermost layer — it should be what closes first.
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  // Move DOM focus with the keyboard cursor so the grid is actually navigable.
  useEffect(() => {
    if (!open) return
    gridRef.current?.querySelector<HTMLElement>('[data-focused="true"]')?.focus()
  }, [open, focusDay, view])

  const days = useMemo(() => {
    const year = view.getFullYear()
    const month = view.getMonth()
    const lead = new Date(year, month, 1).getDay()
    const out: Date[] = []
    // Six rows always, so the popover doesn't resize as you page through months.
    for (let i = 0; i < 42; i++) out.push(new Date(year, month, 1 - lead + i))
    return out
  }, [view])

  const disabled = (d: Date) => Boolean(minDay && d < minDay)

  function pick(d: Date) {
    if (disabled(d)) return
    onChange(toDayString(d))
    setOpen(false)
    triggerRef.current?.focus()
  }

  function shiftFocus(deltaDays: number) {
    const next = new Date(focusDay.getFullYear(), focusDay.getMonth(), focusDay.getDate() + deltaDays)
    setFocusDay(next)
    if (next.getMonth() !== view.getMonth() || next.getFullYear() !== view.getFullYear()) {
      setView(new Date(next.getFullYear(), next.getMonth(), 1))
    }
  }

  function onGridKey(e: React.KeyboardEvent) {
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
    if (e.key in moves) {
      e.preventDefault()
      shiftFocus(moves[e.key])
      return
    }
    if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault()
      const dir = e.key === 'PageUp' ? -1 : 1
      const next = new Date(focusDay.getFullYear(), focusDay.getMonth() + dir, focusDay.getDate())
      setFocusDay(next)
      setView(new Date(next.getFullYear(), next.getMonth(), 1))
    }
  }

  const monthLabel = view.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        id={id}
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`flex w-full items-center justify-between gap-2 rounded-xl border bg-white px-3.5 py-2.5 text-left text-sm outline-none transition ${
          invalid
            ? 'border-red-500'
            : open
              ? 'border-ink'
              : 'border-line hover:border-line-strong focus-visible:border-ink'
        }`}
      >
        <span className={selected ? '' : 'text-muted'}>
          {selected ? selected.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : placeholder}
        </span>
        <CalendarBlank size={15} aria-hidden="true" className="shrink-0 text-muted" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Choose a date"
          className={`u-popover absolute top-full z-50 mt-1.5 w-[268px] rounded-[16px] border border-line bg-card p-3 shadow-[0_4px_12px_-2px_rgba(0,0,0,0.08),0_16px_40px_-12px_rgba(0,0,0,0.22)] ${alignRight ? 'right-0 origin-top-right' : 'left-0 origin-top-left'}`}
        >
          <div className="flex items-center justify-between">
            <p className="text-[14px] font-semibold tracking-tight">{monthLabel}</p>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}
                aria-label="Previous month"
                className="u-circle grid h-7 w-7 place-items-center rounded-full text-muted transition hover:bg-black/[0.05] hover:text-ink"
              >
                <CaretLeft size={14} weight="bold" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}
                aria-label="Next month"
                className="u-circle grid h-7 w-7 place-items-center rounded-full text-muted transition hover:bg-black/[0.05] hover:text-ink"
              >
                <CaretRight size={14} weight="bold" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="mt-2.5 grid grid-cols-7 gap-y-1">
            {WEEKDAYS.map((d, i) => (
              <span key={i} className="grid h-7 place-items-center text-[11px] font-semibold uppercase text-muted">
                {d}
              </span>
            ))}
            <div ref={gridRef} className="col-span-7 grid grid-cols-7 gap-y-1" onKeyDown={onGridKey}>
              {days.map((d) => {
                const outside = d.getMonth() !== view.getMonth()
                const isSelected = selected ? sameDay(d, selected) : false
                const isToday = sameDay(d, today)
                const off = disabled(d)
                const focused = sameDay(d, focusDay)
                return (
                  <button
                    key={d.toISOString()}
                    type="button"
                    // One tab stop for the whole grid; the arrow keys move within it.
                    tabIndex={focused ? 0 : -1}
                    data-focused={focused}
                    disabled={off}
                    onClick={() => pick(d)}
                    aria-label={d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
                    aria-pressed={isSelected}
                    aria-current={isToday ? 'date' : undefined}
                    className={`u-circle mx-auto grid h-8 w-8 place-items-center rounded-full text-[13px] tabular-nums outline-none transition ${
                      isSelected
                        ? 'bg-ink font-semibold text-white'
                        : off
                          ? 'cursor-not-allowed text-muted/40'
                          : outside
                            ? 'text-muted/60 hover:bg-black/[0.04]'
                            : 'text-ink hover:bg-black/[0.06]'
                    } ${isToday && !isSelected ? 'font-semibold ring-1 ring-inset ring-line-strong' : ''} ${
                      focused && !isSelected ? 'ring-2 ring-inset ring-ink/20' : ''
                    }`}
                  >
                    {d.getDate()}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
            <button
              type="button"
              onClick={() => {
                onChange('')
                setOpen(false)
                triggerRef.current?.focus()
              }}
              className="rounded-[10px] px-2 py-1 text-[13px] font-medium text-muted transition hover:bg-black/[0.04] hover:text-ink"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => pick(minDay && today < minDay ? minDay : today)}
              className="rounded-[10px] px-2 py-1 text-[13px] font-medium text-ink transition hover:bg-black/[0.04]"
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

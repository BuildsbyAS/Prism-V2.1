'use client'

import { useEffect, useId, useRef } from 'react'

/**
 * Confirmation for a destructive action that can't be undone.
 *
 * A dialog rather than an inline two-step because the rail's delete is an icon
 * button in a narrow row — there is nowhere to grow a "sure?" affordance — and
 * because losing a page's contents deserves a beat of friction.
 */
export default function ConfirmDialog({
  title,
  body,
  confirmLabel = 'Delete',
  onConfirm,
  onCancel,
}: {
  title: string
  body?: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const confirmRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    const restoreTo = document.activeElement as HTMLElement | null
    confirmRef.current?.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCancel()
        return
      }
      // Keep Tab inside the dialog so focus can't wander to the builder behind.
      if (e.key !== 'Tab' || !dialogRef.current) return
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled])')
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      restoreTo?.focus?.()
    }
  }, [onCancel])

  return (
    <div
      className="u-overlay fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
      onMouseDown={onCancel}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="u-modal w-full max-w-[400px] overflow-hidden rounded-[22px] border border-line bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_24px_60px_-24px_rgba(0,0,0,0.35)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-[17px] font-semibold tracking-tight">
          {title}
        </h2>
        {body && <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{body}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-[14px] border border-line-strong px-3.5 py-2 text-[14px] font-medium transition hover:bg-black/[0.03]"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className="rounded-[14px] bg-red-600 px-3.5 py-2 text-[14px] font-semibold text-white transition hover:opacity-90"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

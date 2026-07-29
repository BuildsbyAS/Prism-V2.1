'use client'

/**
 * A prompt that rises from the bottom of the canvas once a screen is finished,
 * pointing at whatever comes next.
 *
 * Sticky rather than fixed. The canvas is its own scroll column, so a fixed bar
 * would float over the rail and the properties panel too — and it would stay put
 * when the creator moves to a screen that has nothing to suggest. Sticky pins it
 * to the bottom of the column it belongs to while there's overflow, and simply
 * settles under the card when the screen is short enough not to scroll.
 *
 * `u-rise` is the same entrance the voter's page transition uses, so arriving
 * here reads as part of the same vocabulary. Reduced motion is handled globally
 * in app/globals.css.
 */
export default function CanvasNudge({
  title,
  body,
  cta,
  onAct,
  onDismiss,
}: {
  title: string
  body: string
  cta: string
  onAct: () => void
  onDismiss: () => void
}) {
  return (
    // pointer-events-none on the track so the sticky strip doesn't swallow
    // clicks on the card it overlaps; the panel itself takes them back.
    <div className="pointer-events-none sticky bottom-0 z-20 flex justify-center pt-6">
      <div className="u-rise pointer-events-auto mb-1 flex w-full max-w-[540px] items-center gap-3 rounded-[20px] border border-line bg-card px-4 py-3 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08),0_20px_48px_-16px_rgba(0,0,0,0.28)]">
        <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-ink text-[15px] font-semibold text-white" aria-hidden="true">
          ✓
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold tracking-tight">{title}</p>
          <p className="text-[13px] leading-relaxed text-muted">{body}</p>
        </div>
        <button
          type="button"
          onClick={onAct}
          className="flex-none rounded-[14px] bg-ink px-3.5 py-2 text-[13px] font-semibold text-white transition hover:opacity-90"
        >
          {cta}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="grid h-7 w-7 flex-none place-items-center rounded-full text-muted transition hover:bg-black/[0.05] hover:text-ink"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}

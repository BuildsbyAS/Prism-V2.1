'use client'

import { useEffect, useId, useRef } from 'react'
import type { EmbedType, Option } from '@/lib/types'
import { EMBED_TYPE_LABEL } from '@/lib/embed'
import { brightnessStyle } from '@/lib/image'
import MediaEmbed from './MediaEmbed'

/** Everything the viewer needs about one piece of media. */
export interface LightboxMedia {
  type: EmbedType
  src: string
  /** Shown as the caption — an option's name, or "Introduction hero". */
  title?: string
  /** Alt text; empty string means decorative. */
  alt?: string
  brightness?: number
}

/**
 * An option's media as the viewer wants it — the same mapping every caller
 * already does for MediaEmbed, in one place so the enlarged copy can't drift
 * from the thumbnail (decorative images stay unlabelled, brightness carries).
 */
export function optionMedia(
  o: Pick<Option, 'embed_type' | 'embed_url' | 'name' | 'alt_text' | 'is_decorative' | 'brightness'>,
): LightboxMedia {
  return {
    type: o.embed_type,
    src: o.embed_url,
    title: o.name,
    alt: o.is_decorative ? '' : o.alt_text || o.name,
    brightness: o.brightness,
  }
}

/**
 * Full-screen viewer for any media in a form — the creator's canvas, the media
 * picker, and the voter's page all open the same one.
 *
 * Every surface that shows media is bounded by the column it sits in: an option
 * card is a third of a row, the builder thumbnail caps at 320px, the voter's
 * embed at 70vh. That's right for comparing options side by side and wrong for
 * judging one, which is what this is for — the same media, given the whole
 * window, with nothing cropped.
 *
 * Follows the repo's overlay conventions rather than portalling (nothing here
 * portals): a fixed scrim dismissed on mouseDown, `u-overlay`/`u-modal` for the
 * entrance via @starting-style, Escape to close, and focus parked inside and
 * restored on the way out. The scrim is heavier than a dialog's `bg-black/30`
 * because this one is about looking at what's on it.
 */
export default function MediaLightbox({ media, onClose }: { media: LightboxMedia; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    const restoreTo = document.activeElement as HTMLElement | null
    dialogRef.current?.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        // stopPropagation, as ConfirmDialog does: this can be opened from inside
        // the media picker, whose own Escape listener is on `document` and would
        // otherwise close both at once.
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab' || !dialogRef.current) return
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')
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
  }, [onClose])

  const caption = media.title?.trim() || EMBED_TYPE_LABEL[media.type]

  return (
    // z-[70]: above the media picker (z-50) and the confirm dialog (z-[60]),
    // since it can be opened from on top of either.
    <div
      className="u-overlay fixed inset-0 z-[70] flex flex-col bg-black/85 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div className="flex flex-none items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <p id={titleId} className="min-w-0 truncate text-[14px] font-medium text-white/90">
          {caption}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="u-circle grid h-9 w-9 flex-none place-items-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        // The media itself keeps clicks: only the scrim around it closes.
        onMouseDown={(e) => e.stopPropagation()}
        className="u-modal flex min-h-0 flex-1 items-center justify-center px-4 pb-6 outline-none sm:px-6"
      >
        {media.type === 'image' ? (
          // Rendered here rather than through MediaEmbed: its <img> is capped at
          // 70vh and framed for a card, and this one wants the window.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={media.src}
            alt={media.alt ?? media.title ?? ''}
            style={brightnessStyle(media.brightness)}
            className="max-h-full max-w-full rounded-xl object-contain"
          />
        ) : (
          // Arbitrary variants lift MediaEmbed's own caps, the same way the media
          // picker tightens them — it takes no className of its own.
          <div className="flex max-h-full w-full max-w-[1100px] items-center justify-center [&_img]:max-h-[82vh] [&_video]:max-h-[82vh]">
            <MediaEmbed type={media.type} src={media.src} title={media.title} alt={media.alt} brightness={media.brightness} />
          </div>
        )}
      </div>
    </div>
  )
}

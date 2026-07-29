'use client'

import { ArrowsOut } from '@phosphor-icons/react'

import { useState } from 'react'
import MediaEmbed from './MediaEmbed'
import MediaLightbox, { type LightboxMedia } from './MediaLightbox'

/**
 * A piece of media on the voter's page, plus the way to see it full screen.
 *
 * The corner button carries the action for everything except an image: videos
 * and prototypes exist to be clicked *through*, and a click-to-zoom wrapper
 * would swallow the first tap on a play button or a hotspot. An image has
 * nothing to interact with, so it takes the click as well — which is what
 * anyone tries first.
 *
 * The button stays visible under `sm`: `hover:` only matches on a device with a
 * pointer, so a hover-reveal alone would leave it permanently invisible on a
 * phone, where the media is smallest and enlarging it matters most.
 */
export default function ZoomableMedia({
  media,
  /** Bumped to remount a prototype back to its starting state (the ↻ Reset button). */
  embedKey,
}: {
  media: LightboxMedia
  embedKey?: number
}) {
  const [open, setOpen] = useState(false)
  const embed = <MediaEmbed key={embedKey} type={media.type} src={media.src} title={media.title} alt={media.alt} brightness={media.brightness} />

  // Nothing to enlarge: MediaEmbed is showing a placeholder, not media.
  if (!media.src) return embed

  const label = `View ${media.title?.trim() || 'media'} full screen`

  return (
    <div className="group/zoom relative flex max-w-full items-center justify-center">
      {media.type === 'image' ? (
        <button type="button" onClick={() => setOpen(true)} aria-label={label} className="block max-w-full cursor-zoom-in">
          {embed}
        </button>
      ) : (
        embed
      )}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-lg bg-ink/70 text-white opacity-0 transition hover:bg-ink focus-visible:opacity-100 group-hover/zoom:opacity-100 max-sm:opacity-100"
      >
        <ArrowsOut size={16} aria-hidden="true" />
      </button>
      {open && <MediaLightbox media={media} onClose={() => setOpen(false)} />}
    </div>
  )
}

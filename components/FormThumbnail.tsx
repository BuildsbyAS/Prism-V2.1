'use client'

import HeroPanel from '@/components/HeroPanel'
import { placeholderThumbnail } from '@/lib/thumbnail'
import type { ListedForm } from '@/lib/store'

/** The inset the media sits at inside the card's thumbnail, on all four sides. */
const THUMB_PADDING = 12

/**
 * A form's face on the dashboard: its welcome hero, on the backdrop the creator
 * chose, at card size.
 *
 * Rendered through the same HeroPanel the builder and the voter use, so the card
 * is a true miniature rather than a second interpretation of the same fields —
 * gradient, dither texture and the contain-don't-crop rule all come along.
 *
 * A form with no hero yet gets one of five pieces of placeholder art instead.
 * That one *does* cover the frame: it's decorative, chosen for the form rather
 * than uploaded to it, so there's nothing in it the creator needs to see whole,
 * and letterboxing it would just reintroduce the empty box it exists to avoid.
 */
export default function FormThumbnail({ form }: { form: ListedForm }) {
  const hero = form.hero_image_url

  if (!hero) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={placeholderThumbnail(form.id)}
        alt=""
        loading="lazy"
        className="h-full w-full object-cover"
      />
    )
  }

  return (
    <HeroPanel
      src={hero}
      bg={form.hero_bg}
      dither={form.hero_dither}
      padding={THUMB_PADDING}
      className="h-full"
    />
  )
}

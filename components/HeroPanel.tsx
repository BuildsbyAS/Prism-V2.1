'use client'

import { HERO_GLYPH_TILE, hasHeroBg, heroBgCss, isHeroGradient } from '@/lib/hero'

/** Fixed inset between the media and the edge of its column, on all four sides. */
const PANEL_PADDING = 40

/**
 * The welcome screen's media panel: a full-bleed colour/gradient field with the
 * media sitting on top (shots.so style). Shared by the builder canvas and the
 * voter screen so the preview always matches what ships.
 *
 * Sizing contract: the caller gives the panel a definite height (one viewport on
 * desktop). Padding then carves a 40px inset out of it, and the media is a
 * direct child of that padded box capped at `max-h-full` / `max-w-full` — so it
 * can never be taller than the panel (a viewport) nor wider than the column
 * (half the screen), whatever its aspect ratio. The percentages resolve because
 * the media's containing block is the panel itself, which has a definite size;
 * an intermediate shrink-wrapping element would make them resolve to `none` and
 * let a tall image overflow and get clipped.
 *
 * `children` lets the builder swap in its interactive upload surface in place of
 * the plain <img>. It must obey the same contract: fill the padded box and cap
 * the media inside it.
 */
export default function HeroPanel({
  src,
  bg,
  dither = true,
  className = '',
  onExpand,
  children,
}: {
  src?: string
  bg: string
  /** Creator's dither toggle. Only ever applies to gradients. */
  dither?: boolean
  className?: string
  /** Offer a full-screen view of the media. See the button below for why it
   *  isn't simply a wrapper around the <img>. */
  onExpand?: () => void
  children?: React.ReactNode
}) {
  const painted = hasHeroBg(bg)
  // `!== false` so a form saved before `hero_dither` existed still gets the
  // texture rather than silently losing it to an undefined column.
  const dithered = isHeroGradient(bg) && dither !== false

  return (
    // `isolate` confines the dither layers' soft-light blending to this panel, so
    // they modulate the gradient and nothing behind it.
    <div
      className={`group/hero relative isolate flex w-full items-center justify-center overflow-hidden ${className}`}
      style={{
        padding: PANEL_PADDING,
        ...(painted ? { background: heroBgCss(bg) } : null),
      }}
    >
      {dithered && (
        <>
          <div className="hero-dither" aria-hidden="true" />
          <div className="hero-dither-fine" aria-hidden="true" />
          {/* Tile comes from JS because it's generated; the repeat, blend and
              mask live in the stylesheet. */}
          <div className="hero-glyphs" aria-hidden="true" style={{ backgroundImage: HERO_GLYPH_TILE }} />
        </>
      )}
      {children ?? (
        // `relative z-10` lifts the media above the absolutely-positioned dither
        // layers without wrapping it — a wrapper would give its max-h/max-w
        // percentages an auto-height parent to resolve against, which is exactly
        // the bug that let tall images overflow.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          onClick={onExpand}
          className={`relative z-10 block max-h-full max-w-full rounded-[18px] object-contain ${onExpand ? 'cursor-zoom-in' : ''}`}
        />
      )}
      {/* Absolutely positioned rather than wrapping the media, for the reason
          above: the <img> has to stay a direct child of the padded box or its
          percentage caps stop resolving. That rules out a <button> around it,
          so the click on the image is paired with this for keyboard reach. */}
      {onExpand && (
        <button
          type="button"
          onClick={onExpand}
          aria-label="View hero image full screen"
          className="absolute right-3 top-3 z-20 grid h-8 w-8 place-items-center rounded-lg bg-ink/70 text-white opacity-0 transition hover:bg-ink focus-visible:opacity-100 group-hover/hero:opacity-100 max-sm:opacity-100"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </div>
  )
}

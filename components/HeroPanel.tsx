import { hasHeroBg, heroBgCss, isDarkHeroBg } from '@/lib/hero'

/** Fixed inset between the media and the edge of its column, on all four sides. */
const PANEL_PADDING = 40

/**
 * The welcome screen's media panel: a full-bleed colour/gradient field with the
 * media floating on top (shots.so style). Shared by the builder canvas and the
 * voter screen so the preview always matches what ships.
 *
 * Sizing contract: the caller gives the panel a definite height (viewport height
 * on desktop). The media then fits *inside* that box minus the 40px inset —
 * capped at the panel's height and at the column's width (half the screen in the
 * two-column layout) — and keeps its aspect ratio via object-contain, whatever
 * shape it is. No cropping, no stretching.
 *
 * `children` lets the builder swap in its interactive upload surface in place of
 * the plain <img>.
 */
export default function HeroPanel({
  src,
  bg,
  className = '',
  children,
}: {
  src?: string
  bg: string
  className?: string
  children?: React.ReactNode
}) {
  const painted = hasHeroBg(bg)

  return (
    <div
      className={`flex w-full items-center justify-center overflow-hidden ${className}`}
      style={{
        padding: PANEL_PADDING,
        ...(painted ? { background: heroBgCss(bg) } : null),
      }}
    >
      {/* Shrink-wraps the media so the rounding and shadow hug it exactly. */}
      <div
        className={`flex max-h-full max-w-full overflow-hidden rounded-[18px] ${
          painted
            ? isDarkHeroBg(bg)
              ? 'shadow-[0_24px_60px_-12px_rgba(0,0,0,0.65)]'
              : 'shadow-[0_24px_60px_-12px_rgba(0,0,0,0.35)]'
            : ''
        }`}
      >
        {children ?? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="block max-h-full max-w-full object-contain" />
        )}
      </div>
    </div>
  )
}

'use client'

import Tooltip from '@/components/Tooltip'

/**
 * The chart language, shared by the creator's Results page and the voter's end
 * screen so the two read as one report.
 *
 * Colour does exactly one job per chart:
 *
 *   • Options are *identity* — which design won — so they take a categorical
 *     palette, assigned by the option's position on its page and never by rank.
 *     Filtering or reordering can't repaint a survivor: A is always blue.
 *   • Ratings are *ordered* (1★ → 5★), so they take a one-hue ramp, light to
 *     dark. Colour there restates the order, which is the point.
 *   • Everything else — nominal buckets like a multiple choice — is one series,
 *     so it takes a single hue and no legend.
 *
 * Both palettes are validated rather than eyeballed (worst adjacent CVD ΔE 24.2
 * for the options, monotone lightness with a 2.11:1 light end for the ramp).
 * Two option hues sit under 3:1 against white, which is legal only because every
 * value is also written out beside its mark — never hover-only.
 */
export const OPTION_COLORS = ['#2a78d6', '#1baf7a', '#eda100', '#008300'] as const

/** Blue 250→650. Light end still clears the surface; steps read as an order. */
export const RATING_RAMP = ['#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#104281'] as const

/** Option identity by position on its page — never by tally. */
export function optionColor(index: number): string {
  return OPTION_COLORS[index % OPTION_COLORS.length]
}

/**
 * The shape every mark shares: 28px tall, 10px radius. Chunky enough to carry a
 * label inside it and to read as one object rather than a rule.
 */
const BAR = 'h-7 rounded-[10px]'

/**
 * The rail a mark runs in — its own hue at a tenth strength rather than grey.
 * It reads as "the rest of this bar" instead of as a separate element.
 */
function tint(color: string, pct = 12): string {
  return `color-mix(in srgb, ${color} ${pct}%, white)`
}

/**
 * Text sitting *on* a mark takes its colour from the mark's luminance, not from
 * a fixed choice: white on the mid blue clears 4.4:1, but white on the amber
 * would land at 2.2:1 — that one needs ink.
 */
function onColor(hex: string): string {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const l = 0.2126 * lin(channels[0]) + 0.7152 * lin(channels[1]) + 0.0722 * lin(channels[2])
  return l > 0.25 ? '#18191d' : '#ffffff'
}

export interface Slice {
  id: string
  label: string
  value: number
  color: string
}

/**
 * One row of the vote as a whole: a 100%-wide bar split by option.
 *
 * Part-to-whole is the actual question here ("what share went to B?"), and at
 * two to four options a single bar answers it in one look — where four separate
 * bars make the reader add up. The 2px gaps are the surface showing through, not
 * strokes: white does the separating, so neighbouring segments stay distinct
 * without any extra ink.
 */
export function ShareBar({ slices, total }: { slices: Slice[]; total: number }) {
  const shown = slices.filter((s) => s.value > 0)
  if (!total || shown.length === 0) {
    return <div className={`${BAR} w-full bg-black/[0.04]`} />
  }
  return (
    <div className={`flex w-full gap-[3px] overflow-hidden bg-black/[0.04] ${BAR}`}>
      {shown.map((s) => {
        const pct = (s.value / total) * 100
        return (
          // The width rides the tooltip wrapper: it *is* the segment, and a
          // percentage on a child of an auto-width inline-flex resolves to zero.
          <Tooltip
            key={s.id}
            label={`${s.label} · ${s.value} ${s.value === 1 ? 'vote' : 'votes'} (${Math.round(pct)}%)`}
            className="h-7 items-center justify-center transition-[width] duration-500"
            style={{ width: `${pct}%`, background: s.color }}
          >
            {/* The share is written on the mark itself once the segment is wide
                enough to hold it — the reader shouldn't have to trace a length
                back down to the legend for the number. */}
            {pct >= 11 ? (
              <span className="text-[12px] font-semibold tabular-nums" style={{ color: onColor(s.color) }}>
                {Math.round(pct)}%
              </span>
            ) : (
              <span className="sr-only">{s.label}</span>
            )}
          </Tooltip>
        )
      })}
    </div>
  )
}

/**
 * The share bar's key, and its table view in one: a swatch carries identity, the
 * name and numbers carry the values. Nothing here is hover-only, which is what
 * lets the two lighter option hues clear the accessibility bar.
 */
export function ShareLegend({
  slices,
  total,
  leadId,
  mineId,
}: {
  slices: Slice[]
  total: number
  /** The option in front — worth saying out loud rather than leaving to be read off lengths. */
  leadId?: string | null
  /** This voter's pick. */
  mineId?: string | null
}) {
  return (
    <ul className="space-y-2">
      {slices.map((s) => {
        const pct = total ? Math.round((s.value / total) * 100) : 0
        const lead = s.id === leadId
        return (
          <li key={s.id} className="flex items-center gap-2.5 text-sm">
            <span className="h-3 w-3 flex-none rounded-[4px]" style={{ background: s.color }} aria-hidden="true" />
            <span className={`min-w-0 flex-1 truncate ${lead ? 'font-semibold' : 'font-medium'}`}>{s.label}</span>
            {lead && (
              <span className="flex-none rounded-full bg-ink px-2 py-0.5 text-[12px] font-medium text-white">Leading</span>
            )}
            {s.id === mineId && (
              <span className="flex-none rounded-full bg-black/[0.06] px-2 py-0.5 text-[12px] text-muted">Your pick</span>
            )}
            <span className="flex-none tabular-nums text-muted">
              <span className={lead ? 'font-semibold text-ink' : 'text-ink'}>{pct}%</span> · {s.value}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/** How tall a column's rail stands. The tallest value fills it exactly. */
const COLUMN_H = 132

/**
 * Ordered buckets as columns — a rating's shape is the story ("clustered at 4"),
 * and a column chart shows shape where a stack of rows shows only lengths.
 *
 * Every column stands in a full-height rail tinted with its own hue, so the
 * chart has a frame without an axis rule and an empty bucket reads as an empty
 * rail rather than as a missing column.
 */
export function DistributionColumns({
  buckets,
  ramp = RATING_RAMP,
  unit = 'answer',
}: {
  buckets: { label: string; value: number }[]
  ramp?: readonly string[]
  unit?: string
}) {
  const max = Math.max(...buckets.map((b) => b.value), 1)
  return (
    <div className="flex items-end gap-2 sm:gap-3">
      {buckets.map((b, i) => {
        const color = ramp[i % ramp.length]
        const h = b.value === 0 ? 0 : Math.max(10, Math.round((b.value / max) * COLUMN_H))
        return (
          <div key={b.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <span
              className={`text-[12px] tabular-nums ${
                b.value === max ? 'font-semibold text-ink' : 'font-medium text-muted'
              }`}
            >
              {b.value}
            </span>
            <Tooltip label={`${b.label} · ${b.value} ${b.value === 1 ? unit : `${unit}s`}`} className="w-full justify-center">
              <span
                className="relative block w-full max-w-[44px] overflow-hidden rounded-[10px]"
                style={{ height: COLUMN_H, background: tint(color) }}
                aria-hidden="true"
              >
                <span
                  className="absolute inset-x-0 bottom-0 rounded-[10px] transition-[height] duration-500"
                  style={{ height: h, background: color }}
                />
              </span>
            </Tooltip>
            <span className="w-full truncate text-center text-[12px] text-muted">{b.label}</span>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Nominal buckets — a multiple choice, where the labels have no order. One
 * series, so one hue for every bar: colouring them by size would spend the
 * identity channel restating the length.
 */
export function NominalBars({ buckets, total }: { buckets: { label: string; value: number }[]; total: number }) {
  // Length reads as share of everyone who answered, which is what the number
  // beside it says — the track is the 100%. Scaling to the largest bucket
  // instead would make a 42% winner look like the whole vote.
  const basis = total || Math.max(...buckets.map((b) => b.value), 1)
  return (
    <ul className="space-y-3">
      {buckets.map((b) => {
        const pct = Math.round((b.value / basis) * 100)
        return (
          // The label sits above its bar rather than in a fixed column beside it:
          // these are written answers ("It was obvious which slots were taken"),
          // and any column narrow enough to leave room for the bar truncated them
          // to three words.
          <li key={b.label}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 font-medium">{b.label}</span>
              <span className="flex-none tabular-nums text-muted">
                <span className="text-ink">{pct}%</span> · {b.value}
              </span>
            </div>
            {/* The rail is the hue at a tenth strength, so the row reads as one
                bar that's part full rather than a mark sitting in a grey tube. */}
            <span
              className={`mt-2 block w-full overflow-hidden ${BAR}`}
              style={{ background: tint(OPTION_COLORS[0]) }}
            >
              <span
                className={`block transition-[width] duration-500 ${BAR}`}
                style={{ width: `${(b.value / basis) * 100}%`, background: OPTION_COLORS[0] }}
              />
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * The one number a report leads with. Set in the display face at 48px+, because
 * it is the headline rather than a field — every other number on the page is a
 * supporting detail in the UI sans.
 */
export function HeroFigure({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div>
      <p className="text-[13px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 font-pixel text-[52px] font-semibold leading-none tracking-tight">{value}</p>
      {sub && <p className="mt-2 text-[13px] text-muted">{sub}</p>}
    </div>
  )
}

/** A supporting number beside the hero — label, value, optional note. */
export function StatTile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card px-4 py-3.5">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-[17px] font-semibold leading-tight tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 text-[12px] text-muted">{sub}</p>}
    </div>
  )
}

/** The card every chart sits on, so the report reads as one surface. */
export function ChartCard({
  title,
  meta,
  children,
}: {
  title: string
  meta?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    // Flat: a border is enough to hold a card together on a white page, and a
    // column of drop shadows made the report read as a stack of floating panels
    // rather than one document.
    <section className="rounded-[22px] border border-line bg-card p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="min-w-0 font-sans text-sm font-semibold tracking-tight">{title}</h2>
        {meta && <span className="flex-none text-[13px] text-muted">{meta}</span>}
      </div>
      {children}
    </section>
  )
}

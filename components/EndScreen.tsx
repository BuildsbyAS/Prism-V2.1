'use client'

import { CaretUp, Check } from '@phosphor-icons/react'

import type { FormResults, Option, Page, Widget } from '@/lib/types'
import { WIDGET_META, neutralChoiceKey, neutralChoiceLabel } from '@/lib/builder'
import {
  ChartCard,
  DistributionColumns,
  NominalBars,
  ShareBar,
  ShareLegend,
  optionColor,
  type Slice,
} from '@/components/Charts'

/**
 * The screen a voter lands on after submitting — and, in the builder, the
 * preview of it.
 *
 * One component for both so they can't drift: the creator's end screen is the
 * only screen they can't reach by previewing their own form without also
 * submitting to it, which is exactly why it was the least considered part of the
 * product. The builder passes `sample` results (see sampleResults) and slots an
 * editable field in as `message`; the voter passes real ones and plain text.
 */
export function EndScreen({
  headline,
  message,
  results,
  pages,
  options,
  onUpvote,
  sample = false,
  children,
}: {
  headline: string
  /** Text on the voter's screen, an inline editor in the builder. */
  message: React.ReactNode
  results: FormResults | null
  pages: Page[]
  options: Option[]
  onUpvote?: (id: string) => void
  /** Results are illustrative — label them as such and don't invite clicks. */
  sample?: boolean
  /** Extra actions under the message (the preview's "Start over"). */
  children?: React.ReactNode
}) {
  const feedbackPages = pages.filter((p) => p.type === 'feedback')

  return (
    <div className="mx-auto w-full max-w-[640px]">
      {/* The moment itself, centred: a single confirmation, given room. The old
          screen opened with a 22px tick beside a line of text, which read as a
          system notice rather than the end of something. */}
      <div className="flex flex-col items-center text-center">
        {/* u-circle opts out of the global corner smoothing: on a square with a
            full radius, `superellipse(4)` renders a visible squircle rather
            than the circle this wants to be. */}
        <span className="u-circle u-pop grid h-16 w-16 place-items-center rounded-full bg-ink text-white ring-8 ring-ink/[0.07]">
          <Check size={30} weight="bold" aria-hidden="true" />
        </span>
        <h1 className="mt-6 text-[26px] font-semibold leading-tight tracking-tight sm:text-[32px]">{headline}</h1>
        <div className="mt-3 w-full text-[15px] leading-relaxed text-muted">{message}</div>
        {children}
      </div>

      {results && (
        <div className="mt-10 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] font-semibold uppercase tracking-wide text-muted">Results so far</p>
            {sample ? (
              <span className="rounded-full bg-black/[0.06] px-2.5 py-1 text-[12px] font-medium text-muted">Sample data</span>
            ) : (
              <span className="flex items-baseline gap-1.5">
                <span className="text-[18px] font-semibold leading-none tabular-nums">{results.total}</span>
                <span className="text-[13px] text-muted">{results.total === 1 ? 'response' : 'responses'}</span>
              </span>
            )}
          </div>

          {feedbackPages.map((page) => (
            <PageShare
              key={page.id}
              page={page}
              options={options.filter((o) => o.page_id === page.id)}
              results={results}
            />
          ))}

          {results.widgets.map((b) => (
            <ChartCard
              key={b.widget.id}
              title={widgetTitle(b.widget)}
              meta={b.average !== null ? `Average ${b.average}` : undefined}
            >
              {b.widget.type === 'voice' || b.widget.type === 'text' ? (
                <ul className="space-y-2">
                  {b.textAnswers.length === 0 && <li className="text-[14px] text-muted">No responses yet.</li>}
                  {b.textAnswers.map((t) => (
                    <li
                      key={t.id}
                      className={`flex gap-3 rounded-xl border border-line px-3.5 py-2.5 ${
                        b.widget.type === 'voice' ? 'items-center' : 'items-start text-sm leading-relaxed'
                      }`}
                    >
                      {b.widget.type === 'voice' ? (
                        <audio src={t.value} controls className="h-9 w-full min-w-0 max-w-[280px]" />
                      ) : (
                        <span className="min-w-0 flex-1">{t.value}</span>
                      )}
                      {/* A sample answer isn't upvotable — there's nothing behind it. */}
                      {sample || !onUpvote ? (
                        <span className="inline-flex flex-none items-center gap-1 rounded-full bg-black/[0.06] px-2 py-0.5 text-[13px] text-muted">
                          <CaretUp size={11} weight="bold" aria-hidden="true" />
                          {t.upvotes}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onUpvote(t.id)}
                          className="inline-flex flex-none items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[13px] font-medium text-muted transition hover:text-ink"
                        >
                          <CaretUp size={11} weight="bold" aria-hidden="true" />
                          {t.upvotes}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : b.widget.type === 'rating' ? (
                <DistributionColumns buckets={ratingBuckets(b.distribution)} unit="rating" />
              ) : b.widget.type === 'slider' ? (
                <DistributionColumns
                  buckets={sliderBuckets(b.distribution, b.widget.config.min ?? 0, b.widget.config.max ?? 100)}
                  unit="answer"
                />
              ) : (
                <NominalBars buckets={toBuckets(b.distribution)} total={b.count} />
              )}
            </ChartCard>
          ))}
        </div>
      )}
    </div>
  )
}

/** One comparison's whole vote: the split, then the rows that name it. */
function PageShare({
  page,
  options,
  results,
}: {
  page: Page
  options: Option[]
  results: FormResults
}) {
  if (options.length === 0) return null
  const slices: Slice[] = options.map((o, i) => ({
    id: o.id,
    label: o.name,
    value: results.optionCounts[o.id] ?? 0,
    color: optionColor(i),
  }))
  const neutralCount = results.optionCounts[neutralChoiceKey(page.id)] ?? 0
  if (page.show_neutral_option !== false || neutralCount > 0) {
    slices.push({
      id: neutralChoiceKey(page.id),
      label: neutralChoiceLabel(page, options.length),
      value: neutralCount,
      color: optionColor(options.length),
    })
  }
  const voted = slices.reduce((sum, s) => sum + s.value, 0)
  const lead = slices.reduce((best, s) => (s.value > best.value ? s : best), slices[0])
  return (
    <ChartCard
      title={page.title || 'Where people landed'}
      meta={voted ? `${voted} ${voted === 1 ? 'vote' : 'votes'}` : 'No votes yet'}
    >
      <div className="space-y-3.5">
        <ShareBar slices={slices} total={voted} />
        <ShareLegend slices={slices} total={voted} leadId={lead.value > 0 ? lead.id : null} />
      </div>
    </ChartCard>
  )
}

function widgetTitle(w: Widget): string {
  return w.config.label?.trim() || WIDGET_META[w.type].label
}

/** 1★…5★ always shows all five buckets — a missing rating is information. */
export function ratingBuckets(distribution: Record<string, number>) {
  return ['1', '2', '3', '4', '5'].map((k) => ({ label: `${k}★`, value: distribution[k] ?? 0 }))
}

/**
 * A slider's answers are points on a continuous scale, so the raw distribution is
 * one bucket per distinct value — a dozen identical full-width bars that say
 * nothing. Binned into fifths of the scale it becomes a shape you can read.
 */
export function sliderBuckets(distribution: Record<string, number>, min = 0, max = 100) {
  const span = Math.max(1, max - min)
  const size = span / 5
  const buckets = Array.from({ length: 5 }, (_, i) => ({
    label: `${Math.round(min + i * size)}–${Math.round(min + (i + 1) * size)}`,
    value: 0,
  }))
  for (const [k, n] of Object.entries(distribution)) {
    const v = Number(k)
    if (Number.isNaN(v)) continue
    const i = Math.min(4, Math.max(0, Math.floor(((v - min) / span) * 5)))
    buckets[i].value += n
  }
  return buckets
}

export function toBuckets(distribution: Record<string, number>) {
  return Object.entries(distribution)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([label, value]) => ({ label, value }))
}

/**
 * Plausible results for the builder's preview.
 *
 * Deterministic on purpose — a random tally would reshuffle on every keystroke
 * (the canvas re-renders as the creator types) and would differ between the
 * server and client render. Weights are just "first option leads", which is
 * enough to show what the screen does with a winner.
 */
const SAMPLE_TOTAL = 24
const SAMPLE_WEIGHTS = [0.46, 0.29, 0.17, 0.08]

export function sampleResults(pages: Page[], options: Option[], widgets: Widget[]): FormResults {
  const optionCounts: Record<string, number> = {}
  for (const page of pages) {
    const opts = options.filter((o) => o.page_id === page.id)
    opts.forEach((o, i) => {
      optionCounts[o.id] = Math.round(SAMPLE_TOTAL * (SAMPLE_WEIGHTS[i] ?? 0.05))
    })
  }

  return {
    total: SAMPLE_TOTAL,
    firstAt: null,
    lastAt: null,
    optionCounts,
    widgets: widgets.map((w) => {
      if (w.type === 'text' || w.type === 'voice') {
        return {
          widget: w,
          count: 2,
          average: null,
          distribution: {},
          textAnswers:
            w.type === 'voice'
              ? []
              : [
                  { id: `${w.id}-s1`, value: 'The second one felt quicker to scan.', upvotes: 4 },
                  { id: `${w.id}-s2`, value: 'Either works, but the first is more familiar.', upvotes: 1 },
                ],
        }
      }
      // rating / slider / radio — a small spread with a clear mode.
      const buckets = w.type === 'rating' ? ['1', '2', '3', '4', '5'] : ['A', 'B', 'C']
      const spread = w.type === 'rating' ? [1, 2, 4, 10, 7] : [13, 8, 3]
      const distribution: Record<string, number> = {}
      buckets.forEach((k, i) => {
        distribution[k] = spread[i] ?? 0
      })
      return {
        widget: w,
        count: SAMPLE_TOTAL,
        average: w.type === 'rating' ? 4.0 : null,
        distribution,
        textAnswers: [],
      }
    }),
  }
}

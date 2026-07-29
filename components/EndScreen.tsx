'use client'

import type { FormResults, Option, Page, Widget } from '@/lib/types'
import { WIDGET_META } from '@/lib/builder'

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
  chosenIds,
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
  /** This voter's picks, so their own row can be marked. */
  chosenIds?: Set<string>
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
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <h1 className="mt-6 text-[26px] font-semibold leading-tight tracking-tight sm:text-[32px]">{headline}</h1>
        <div className="mt-3 w-full text-[15px] leading-relaxed text-muted">{message}</div>
        {children}
      </div>

      {results && (
        <div className="mt-10 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] font-semibold uppercase tracking-wide text-muted">Results so far</p>
            {sample ? (
              <span className="rounded-full bg-black/[0.06] px-2.5 py-1 text-[12px] font-medium text-muted">Sample data</span>
            ) : (
              <span className="flex items-baseline gap-1.5">
                <span className="font-pixel text-[18px] font-semibold leading-none tabular-nums">{results.total}</span>
                <span className="text-[13px] text-muted">{results.total === 1 ? 'response' : 'responses'}</span>
              </span>
            )}
          </div>

          {feedbackPages.map((page) => {
            const opts = options.filter((o) => o.page_id === page.id)
            if (opts.length === 0) return null
            // The leading option carries the full-strength bar and the chip;
            // everything else steps back, so the answer is legible at a glance
            // instead of being read off four equally-weighted rows.
            const top = opts.reduce((best, o) =>
              (results.optionCounts[o.id] ?? 0) > (results.optionCounts[best.id] ?? 0) ? o : best,
            )
            const topCount = results.optionCounts[top.id] ?? 0
            return (
              <Card key={page.id} title={page.title || 'Where people landed'}>
                {opts.map((o) => {
                  const n = results.optionCounts[o.id] ?? 0
                  const pct = results.total ? Math.round((n / results.total) * 100) : 0
                  return (
                    <Bar
                      key={o.id}
                      label={o.name}
                      pct={pct}
                      n={n}
                      lead={topCount > 0 && n === topCount}
                      mine={chosenIds?.has(o.id) ?? false}
                    />
                  )
                })}
              </Card>
            )
          })}

          {results.widgets.map((b) => (
            <Card key={b.widget.id} title={widgetTitle(b.widget)}>
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
                        <span className="flex-none rounded-full bg-black/[0.06] px-2 py-0.5 text-[13px] text-muted">▲ {t.upvotes}</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onUpvote(t.id)}
                          className="flex-none rounded-full border border-line px-2 py-0.5 text-[13px] font-medium text-muted transition hover:text-ink"
                        >
                          ▲ {t.upvotes}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <>
                  {b.average !== null && (
                    <p className="text-[14px] text-muted">
                      Average <span className="font-medium text-ink">{b.average}</span>
                    </p>
                  )}
                  {Object.entries(b.distribution)
                    .sort((a, c) => (a[0] < c[0] ? -1 : 1))
                    .map(([k, n]) => (
                      <Bar key={k} label={k} pct={b.count ? Math.round((n / b.count) * 100) : 0} n={n} />
                    ))}
                </>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function widgetTitle(w: Widget): string {
  return w.config.label?.trim() || WIDGET_META[w.type].label
}

/** Same card chrome the creator's results page uses, so the two read as one report. */
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[22px] border border-line bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_16px_44px_-24px_rgba(0,0,0,0.18)]">
      <h2 className="mb-4 text-sm font-semibold tracking-tight">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

function Bar({ label, pct, n, lead = false, mine = false }: { label: string; pct: number; n: number; lead?: boolean; mine?: boolean }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
        <span className="flex min-w-0 items-center gap-2">
          <span className={`truncate ${lead ? 'font-semibold' : 'font-medium'}`}>{label}</span>
          {lead && <span className="flex-none rounded-full bg-ink px-2 py-0.5 text-[12px] font-medium text-white">Leading</span>}
          {mine && <span className="flex-none rounded-full bg-black/[0.06] px-2 py-0.5 text-[12px] text-muted">Your pick</span>}
        </span>
        <span className="flex-none tabular-nums text-muted">
          <span className={lead ? 'font-semibold text-ink' : ''}>{pct}%</span> · {n}
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/[0.06]">
        <div
          className={`h-full rounded-full transition-all duration-500 ${lead ? 'bg-ink' : 'bg-ink/30'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
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

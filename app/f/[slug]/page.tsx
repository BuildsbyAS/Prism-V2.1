'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import type { AnswerValue, FullForm, FormResults, Option, Page } from '@/lib/types'
import { getPublicForm, submitResponse, getResults, upvoteAnswer } from '@/lib/store'
import MediaEmbed from '@/components/MediaEmbed'
import WidgetInput from '@/components/WidgetInput'
import { WIDGET_META } from '@/lib/builder'
import HeroPanel from '@/components/HeroPanel'

type Phase = 'welcome' | 'vote' | 'submitting' | 'done'

function sessionId(slug: string): string {
  const key = `prism-session:${slug}`
  try {
    let s = localStorage.getItem(key)
    if (!s) {
      s = crypto.randomUUID?.() ?? 'sess-' + Math.random().toString(36).slice(2)
      localStorage.setItem(key, s)
    }
    return s
  } catch {
    return 'sess-anon'
  }
}

export default function VoterPage() {
  const params = useParams<{ slug: string }>()
  const slug = params.slug

  const [full, setFull] = useState<FullForm | null>(null)
  // Options per page, order randomised once (creator can't lock it yet — V1).
  const [voteOptions, setVoteOptions] = useState<Record<string, Option[]>>({})
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading')
  const [phase, setPhase] = useState<Phase>('welcome')
  const [choices, setChoices] = useState<Record<string, string>>({}) // page_id -> option_id | 'tie'
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({})
  const [results, setResults] = useState<FormResults | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hasVoted, setHasVoted] = useState(false)
  // Per-option counter — bumping it remounts that option's embed to reset a
  // react/figma/video prototype back to its starting state (preview only).
  const [protoResets, setProtoResets] = useState<Record<string, number>>({})
  const submittingRef = useRef(false)
  // Preview mode (from the builder): fresh every time (no vote-lock, no persistence).
  const [preview] = useState(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('preview') === '1')
  const pendingScroll = useRef<string | null>(null)

  useEffect(() => {
    getPublicForm(slug).then((f) => {
      if (!f) return setState('missing')
      setFull(f)
      const byPage: Record<string, Option[]> = {}
      for (const page of f.pages) {
        const opts = f.options.filter((o) => o.page_id === page.id).sort((a, b) => a.order_index - b.order_index)
        byPage[page.id] = page.type === 'feedback' ? [...opts].sort(() => Math.random() - 0.5) : opts
      }
      setVoteOptions(byPage)
      setState('ready')

      if (preview) {
        // Start on the screen the creator hit Preview from; never carry a lock.
        const start = new URLSearchParams(window.location.search).get('start')
        if (start === 'end') {
          if (f.form.show_results_to_voters) getResults(f.form.id).then(setResults)
          setPhase('done')
        } else if (start && start !== 'welcome') {
          pendingScroll.current = start
          setPhase('vote')
        }
        return
      }
      // Every visit begins fresh on the welcome screen — no cross-session vote
      // lock (it only produced confusing "already voted / 0 responses" states).
    })
  }, [slug, preview])

  // In preview, jump to the page the creator was editing.
  useEffect(() => {
    if (phase !== 'vote' || !pendingScroll.current) return
    const id = pendingScroll.current
    pendingScroll.current = null
    const t = setTimeout(() => document.getElementById(`page-${id}`)?.scrollIntoView({ block: 'start' }), 60)
    return () => clearTimeout(t)
  }, [phase])

  async function submit() {
    if (!full || submittingRef.current || hasVoted) return
    // Every comparison must have a pick (an option or "they all feel equal") —
    // a response with no choice is meaningless.
    const undecided = full.pages.filter(
      (p) => p.type === 'feedback' && (voteOptions[p.id]?.length ?? 0) > 0 && !choices[p.id],
    )
    if (undecided.length) {
      setError('Please choose an option on each comparison before submitting.')
      return
    }
    const missing = full.widgets.filter((w) => w.config.required && answers[w.id] === undefined)
    if (missing.length) {
      setError('Please answer the required questions.')
      return
    }
    submittingRef.current = true
    setError(null)
    setPhase('submitting')
    try {
      await submitResponse(full.form.id, sessionId(slug), { choices, answers })
      // In-session flag only — prevents an immediate double-submit; not persisted.
      setHasVoted(true)
      if (full.form.show_results_to_voters) setResults(await getResults(full.form.id))
      setPhase('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
      setPhase('vote')
    } finally {
      submittingRef.current = false
    }
  }

  // Preview-only: reset the whole submission flow back to the welcome screen so
  // the creator can run through the form again without reloading.
  function restart() {
    setChoices({})
    setAnswers({})
    setResults(null)
    setHasVoted(false)
    setError(null)
    setPhase('welcome')
    window.scrollTo({ top: 0 })
  }

  if (state === 'loading') return <Centered>Loading…</Centered>
  if (state === 'missing' || !full) {
    return (
      <Centered>
        <h1 className="text-xl font-semibold">Form not found</h1>
        <p className="mt-2 text-[15px] text-muted">This link may be closed or mistyped.</p>
      </Centered>
    )
  }

  const { form } = full
  // Animate on screen change (welcome ↔ vote ↔ done); submitting stays on vote.
  const screen = phase === 'submitting' ? 'vote' : phase

  // Welcome + hero media gets its own full-bleed split layout: copy on the left,
  // the media on its backdrop running edge to edge on the right. Below lg
  // (tablet and mobile) the two halves stack.
  if (phase === 'welcome' && form.hero_image_url) {
    return (
      // On desktop each column is exactly half the screen and the media column
      // is exactly one viewport tall, so the media can never exceed 50vw × 100dvh.
      <main className="grid min-h-dvh w-full lg:h-dvh lg:grid-cols-2">
        <div className="u-rise flex flex-col justify-center px-6 py-14 sm:px-10 lg:px-14 lg:overflow-y-auto">
          <p className="text-[14px] font-medium text-muted">{form.title || 'Feedback'}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-[32px]">{form.title || 'Share your feedback'}</h1>
          {form.body_copy && <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">{form.body_copy}</p>}
          <div className="mt-8">
            <button type="button" onClick={() => setPhase('vote')} className="rounded-[16px] bg-ink px-5 py-2.5 text-[14px] font-medium text-white transition hover:opacity-90">
              Get started
            </button>
            {form.show_time_estimate && (
              <p className="mt-2.5 text-[13px] text-muted">
                Takes about {form.estimated_minutes} minute{form.estimated_minutes === 1 ? '' : 's'}
              </p>
            )}
          </div>
        </div>
        <HeroPanel src={form.hero_image_url} bg={form.hero_bg} className="h-[60vh] lg:h-full" />
      </main>
    )
  }

  return (
    // Vertically center the content: my-auto centers it when short, and collapses
    // to top-aligned + scrollable when the content is taller than the viewport.
    <main className="flex min-h-dvh w-full flex-col">
    <div className="mx-auto my-auto w-full max-w-[900px] px-4 py-10 sm:py-14">
      <p className="text-[14px] font-medium text-muted">{form.title || 'Feedback'}</p>

      <div key={screen} className="u-rise">
      {/* ------------------------------ Welcome ----------------------------- */}
      {phase === 'welcome' && (
        // No hero media — the copy simply runs full width. The media variant is
        // handled by the full-bleed split layout above.
        <>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-[28px]">{form.title || 'Share your feedback'}</h1>
          {form.body_copy && <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">{form.body_copy}</p>}
          <div className="mt-8">
            <button type="button" onClick={() => setPhase('vote')} className="rounded-[16px] bg-ink px-5 py-2.5 text-[14px] font-medium text-white transition hover:opacity-90">
              Get started
            </button>
            {form.show_time_estimate && (
              <p className="mt-2.5 text-[13px] text-muted">
                Takes about {form.estimated_minutes} minute{form.estimated_minutes === 1 ? '' : 's'}
              </p>
            )}
          </div>
        </>
      )}

      {/* ------------------------------- Vote ------------------------------- */}
      {(phase === 'vote' || phase === 'submitting') && (
        <>
          <div className="mt-6 space-y-12">
            {full.pages.map((page) => {
              const opts = voteOptions[page.id] ?? []
              const wids = full.widgets.filter((w) => w.page_id === page.id).sort((a, b) => a.order_index - b.order_index)
              return (
                <section key={page.id} id={`page-${page.id}`} className="scroll-mt-6 space-y-5">
                  {(page.title || page.body) && (
                    <div>
                      {page.title && <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{page.title}</h2>}
                      {page.body && <p className="mt-1.5 max-w-xl text-[15px] leading-relaxed text-muted">{page.body}</p>}
                    </div>
                  )}

                  {page.type === 'feedback' ? (
                    <>
                      {opts.length > 0 && (
                        <div className="space-y-4 rounded-[26px] border border-line bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_16px_44px_-24px_rgba(0,0,0,0.18)]">
                          <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${opts.length === 3 ? 'lg:grid-cols-3' : ''}`}>
                            {opts.map((o) => {
                              const selected = choices[page.id] === o.id
                              return (
                                <div key={o.id} className={`flex flex-col overflow-hidden rounded-2xl border bg-card transition ${selected ? 'border-ink' : 'border-line'}`}>
                                  <div className="flex items-center justify-between border-b border-line px-5 py-3">
                                    <span className="text-[15px] font-semibold tracking-tight">{o.name}</span>
                                    {o.embed_url && o.embed_type !== 'image' ? (
                                      <button type="button" onClick={() => setProtoResets((r) => ({ ...r, [o.id]: (r[o.id] ?? 0) + 1 }))} className="inline-flex items-center gap-1 rounded-[12px] border border-line-strong px-2.5 py-1 text-[13px] font-medium text-muted transition hover:bg-black/[0.03] hover:text-ink">
                                        <span aria-hidden="true">↻</span> Reset
                                      </button>
                                    ) : (
                                      <span className="text-[13px] text-muted">try it ↓</span>
                                    )}
                                  </div>
                                  {o.description && <p className="border-b border-line px-5 py-2.5 text-[14px] text-muted">{o.description}</p>}
                                  <div className="flex justify-center px-5 py-6">
                                    <MediaEmbed key={protoResets[o.id] ?? 0} type={o.embed_type} src={o.embed_url} title={o.name} alt={o.is_decorative ? '' : o.alt_text || o.name} focalX={o.focal_x} focalY={o.focal_y} brightness={o.brightness} />
                                  </div>
                                  <div className="mt-auto border-t border-line p-3">
                                    <button type="button" onClick={() => setChoices((c) => ({ ...c, [page.id]: o.id }))} disabled={hasVoted} className={`w-full rounded-[16px] py-2 text-[14px] font-semibold text-ink transition disabled:cursor-not-allowed ${selected ? 'border border-transparent bg-black/[0.06]' : 'border border-line-strong hover:bg-black/[0.03]'}`}>
                                      {selected ? `✓ ${o.name} selected` : `Select ${o.name}`}
                                    </button>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                          {opts.length >= 2 && (
                            <button type="button" onClick={() => setChoices((c) => ({ ...c, [page.id]: 'tie' }))} disabled={hasVoted} className={`w-full rounded-[16px] border py-2.5 text-[14px] font-semibold text-ink transition disabled:cursor-not-allowed ${choices[page.id] === 'tie' ? 'border-transparent bg-black/[0.06]' : 'border-line-strong hover:bg-black/[0.03]'}`}>
                              {choices[page.id] === 'tie' ? '✓ They all feel equal' : opts.length === 2 ? 'Both feel equal' : 'They all feel equal'}
                            </button>
                          )}
                        </div>
                      )}
                      {wids.map((w) => (
                        <div key={w.id} className="rounded-[26px] border border-line bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_16px_44px_-24px_rgba(0,0,0,0.18)] sm:p-6">
                          <WidgetInput widget={w} value={answers[w.id]} onChange={(v) => setAnswers((a) => ({ ...a, [w.id]: v }))} hideLabel={w.config.showTitle === false} />
                        </div>
                      ))}
                    </>
                  ) : (
                    // Static page — media shown for context, not selectable.
                    <div className={`grid grid-cols-1 gap-4 ${opts.length >= 2 ? 'sm:grid-cols-2' : ''}`}>
                      {opts.map((o) => (
                        <div key={o.id} className="overflow-hidden rounded-[26px] border border-line bg-card shadow-[0_1px_2px_rgba(0,0,0,0.03),0_16px_44px_-24px_rgba(0,0,0,0.18)]">
                          {(o.name || o.description) && (
                            <div className="border-b border-line px-5 py-3">
                              {o.name && <span className="text-[15px] font-semibold tracking-tight">{o.name}</span>}
                              {o.description && <p className="mt-0.5 text-[14px] text-muted">{o.description}</p>}
                            </div>
                          )}
                          <div className="flex justify-center px-5 py-6">
                            <MediaEmbed type={o.embed_type} src={o.embed_url} title={o.name} alt={o.is_decorative ? '' : o.alt_text || o.name} focalX={o.focal_x} focalY={o.focal_y} brightness={o.brightness} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )
            })}
          </div>

          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

          <button type="button" onClick={submit} disabled={phase === 'submitting' || hasVoted} className="mt-8 ml-auto block w-fit rounded-[16px] bg-ink px-6 py-2.5 text-[14px] font-medium text-white transition enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
            {phase === 'submitting' ? 'Submitting…' : 'Submit'}
          </button>
        </>
      )}

      {/* ----------------------------- Thank you ---------------------------- */}
      {phase === 'done' && (
        <ThankYou
          form={full}
          results={form.show_results_to_voters ? results : null}
          chosenIds={new Set(Object.values(choices))}
          preview={preview}
          onRestart={restart}
          onUpvote={async (id) => {
            await upvoteAnswer(id)
            setResults(await getResults(full.form.id))
          }}
        />
      )}
      </div>
    </div>
    </main>
  )
}

function ThankYou({
  form,
  results,
  chosenIds,
  preview,
  onRestart,
  onUpvote,
}: {
  form: FullForm
  results: FormResults | null
  chosenIds: Set<string>
  preview: boolean
  onRestart: () => void
  onUpvote: (id: string) => void
}) {
  const optionsByPage = (page: Page) => form.options.filter((o) => o.page_id === page.id)
  const feedbackPages = form.pages.filter((p) => p.type === 'feedback')

  return (
    <div className="mt-6">
      <div className="flex items-center gap-2.5">
        <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" className="u-pop">
          <circle cx="11" cy="11" r="11" fill="#18191d" />
          <path d="M6 11.2l3.2 3.2L16 7.6" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <h1 className="text-xl font-semibold">{form.form.thank_you_message ? 'Thanks!' : "Thanks — your feedback's in."}</h1>
      </div>
      {form.form.thank_you_message && <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-muted">{form.form.thank_you_message}</p>}

      {preview && (
        <button
          type="button"
          onClick={onRestart}
          className="mt-5 inline-flex items-center gap-1.5 rounded-[16px] border border-line-strong px-4 py-2 text-[14px] font-medium text-ink transition hover:bg-black/[0.03]"
        >
          <span aria-hidden="true">↻</span> Start over
        </button>
      )}

      {results && (
        <div className="mt-8 space-y-8">
          <p className="text-sm font-semibold">
            {results.total} {results.total === 1 ? 'response' : 'responses'} so far
          </p>

          {feedbackPages.map((page) => {
            const opts = optionsByPage(page)
            if (opts.length === 0) return null
            return (
              <section key={page.id}>
                <h2 className="text-sm font-semibold">{page.title || 'Where people landed'}</h2>
                <div className="mt-3 space-y-3">
                  {opts.map((o) => {
                    const n = results.optionCounts[o.id] ?? 0
                    const pct = results.total ? Math.round((n / results.total) * 100) : 0
                    const mine = chosenIds.has(o.id)
                    return (
                      <div key={o.id}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="font-medium">
                            {o.name}
                            {mine && <span className="ml-2 rounded-full bg-black/[0.06] px-2 py-0.5 text-[13px] text-muted">your pick</span>}
                          </span>
                          <span className="tabular-nums text-muted">{pct}% · {n}</span>
                        </div>
                        <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/[0.06]">
                          <div className="h-full rounded-full bg-ink transition-all duration-500" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}

          {results.widgets.map((b) => (
            <section key={b.widget.id}>
              <h3 className="text-sm font-semibold">{b.widget.config.label || WIDGET_META[b.widget.type].label}</h3>
              {b.widget.type === 'voice' ? (
                <ul className="mt-2 space-y-2">
                  {b.textAnswers.length === 0 && <li className="text-[14px] text-muted">No responses yet.</li>}
                  {b.textAnswers.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3.5 py-2.5">
                      <audio src={t.value} controls className="h-9 w-full min-w-0 max-w-[280px]" />
                      <button type="button" onClick={() => onUpvote(t.id)} className="flex-none rounded-full border border-line px-2 py-0.5 text-[13px] font-medium text-muted transition hover:text-ink">
                        ▲ {t.upvotes}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : b.widget.type === 'text' ? (
                <ul className="mt-2 space-y-2">
                  {b.textAnswers.length === 0 && <li className="text-[14px] text-muted">No responses yet.</li>}
                  {b.textAnswers.map((t) => (
                    <li key={t.id} className="flex items-start justify-between gap-3 rounded-xl border border-line px-3.5 py-2.5 text-sm leading-relaxed">
                      <span>{t.value}</span>
                      <button type="button" onClick={() => onUpvote(t.id)} className="flex-none rounded-full border border-line px-2 py-0.5 text-[13px] font-medium text-muted transition hover:text-ink">
                        ▲ {t.upvotes}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-2 space-y-2">
                  {b.average !== null && <p className="text-[14px] text-muted">Average: <span className="font-medium text-ink">{b.average}</span></p>}
                  {Object.entries(b.distribution).map(([k, n]) => {
                    const pct = b.count ? Math.round((n / b.count) * 100) : 0
                    return (
                      <div key={k}>
                        <div className="mb-1 flex items-center justify-between text-[14px]">
                          <span>{k}</span>
                          <span className="tabular-nums text-muted">{pct}% · {n}</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-black/[0.06]">
                          <div className="h-full rounded-full bg-ink" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex min-h-dvh max-w-[600px] flex-col justify-center px-6 text-center">{children}</main>
}

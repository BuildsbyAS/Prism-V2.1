'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import type { AnswerValue, FullForm, FormResults, Option } from '@/lib/types'
import {
  getPublicForm,
  submitResponse,
  getResults,
  upvoteAnswer,
  hasResponded,
  isAlreadyResponded,
  isLoginRequired,
  VOTING_REQUIRES_LOGIN,
} from '@/lib/store'
import { useCurrentUser } from '@/lib/auth'
import { ALLOWED_EMAIL_DOMAIN } from '@/lib/supabase'
import Link from 'next/link'
import ZoomableMedia from '@/components/ZoomableMedia'
import MediaLightbox, { optionMedia, type LightboxMedia } from '@/components/MediaLightbox'
import WidgetInput from '@/components/WidgetInput'
import { EndScreen } from '@/components/EndScreen'
import { formName } from '@/lib/builder'
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
  const { user, loading: authLoading } = useCurrentUser()

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
  // Voted on an earlier visit, rather than just now — changes the done screen's
  // wording from "thanks" to "you've already responded".
  const [alreadyVoted, setAlreadyVoted] = useState(false)
  // Decided once, when the form loads: reading the clock during render is both
  // impure and pointless, since nothing re-renders this page as time passes.
  const [expired, setExpired] = useState(false)
  // Per-option counter — bumping it remounts that option's embed to reset a
  // react/figma/video prototype back to its starting state (preview only).
  const [protoResets, setProtoResets] = useState<Record<string, number>>({})
  const submittingRef = useRef(false)
  // Preview mode (from the builder): fresh every time (no vote-lock, no persistence).
  const [preview] = useState(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('preview') === '1')
  // Only the hero needs the page to hold this; every other piece of media on the
  // voter's page owns its own viewer through ZoomableMedia.
  const [zoom, setZoom] = useState<LightboxMedia | null>(null)
  const pendingScroll = useRef<string | null>(null)

  useEffect(() => {
    getPublicForm(slug).then((f) => {
      if (!f) return setState('missing')
      setFull(f)
      if (!preview && f.form.expires_at && Date.now() > Date.parse(f.form.expires_at)) setExpired(true)
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

      // One response per account (per browser in demo mode). Asked of the store
      // rather than a local "voted" flag: an earlier lock kept that flag in
      // localStorage, where it drifted out of sync and showed "already voted" on
      // forms with zero responses. Derived from the rows, the lock goes away if
      // the responses do.
      //
      // Waits for auth to settle — running this mid-resolution would ask "has
      // nobody responded?", get false, and quietly hand a second vote to someone
      // who already has one.
      if (authLoading) return
      hasResponded(f.form.id, { userId: user?.id ?? null, sessionId: sessionId(slug) }).then((already) => {
        if (!already) return
        setHasVoted(true)
        setAlreadyVoted(true)
        setPhase('done')
        if (f.form.show_results_to_voters) getResults(f.form.id).then(setResults)
      })
    })
  }, [slug, preview, authLoading, user?.id])

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
    // Only inputs the voter can actually see. A page switched to static keeps its
    // inputs (so switching back restores them) but never renders them, and
    // validating those would block submit on a question that isn't on screen.
    const askedPageIds = new Set(full.pages.filter((p) => p.type === 'feedback').map((p) => p.id))
    const missing = full.widgets.filter(
      (w) => askedPageIds.has(w.page_id) && w.config.required && answers[w.id] === undefined,
    )
    if (missing.length) {
      setError('Please answer the required questions.')
      return
    }
    submittingRef.current = true
    setError(null)
    setPhase('submitting')
    try {
      await submitResponse(full.form.id, { userId: user?.id ?? null, sessionId: sessionId(slug) }, { choices, answers })
      setHasVoted(true)
      if (full.form.show_results_to_voters) setResults(await getResults(full.form.id))
      setPhase('done')
    } catch (e) {
      // The store rejected it because this browser already has a response —
      // another tab got there first, or the page was open from before. Not an
      // error to shout about: land on the same screen a returning voter sees.
      if (isAlreadyResponded(e)) {
        setHasVoted(true)
        setAlreadyVoted(true)
        if (full.form.show_results_to_voters) setResults(await getResults(full.form.id))
        setPhase('done')
        return
      }
      // The session expired between loading the form and submitting.
      if (isLoginRequired(e)) {
        setError('Your session expired. Sign in again to submit your response.')
        setPhase('vote')
        return
      }
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

  // Past its expiry date the form is shut, whatever `status` still says — the
  // creator set a date so they wouldn't have to come back and close it by hand.
  // Preview ignores it, so an expired form is still checkable by its creator.
  if (expired && full.form.expires_at) {
    return (
      <Centered>
        <h1 className="text-xl font-semibold">This form has closed</h1>
        <p className="mt-2 text-[15px] text-muted">
          It stopped taking responses on{' '}
          {new Date(full.form.expires_at).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}.
        </p>
      </Centered>
    )
  }

  // Responses are one-per-account, so voting needs a signed-in account. Gate the
  // whole form rather than only the submit: filling a form in and being asked to
  // sign in at the end risks losing the answers to the round trip.
  //
  // Not in preview — that's the creator checking their own work, already signed
  // in, and it never records a response.
  if (VOTING_REQUIRES_LOGIN && !preview && !authLoading && !user) {
    return <SignInGate slug={slug} />
  }

  const { form } = full
  // Animate on screen change (welcome ↔ vote ↔ done); submitting stays on vote.
  const screen = phase === 'submitting' ? 'vote' : phase

  // The overline names the form — it's the one thing on screen that stays put
  // across the welcome, vote and thank-you screens. It used to print `title`,
  // which is the welcome *headline*, so it read as a duplicate of the <h1>
  // directly beneath it. It shows the creator's name for the form instead.
  //
  // An unnamed form is still known by its headline (see formName), so on the
  // welcome screen that fallback would reintroduce the very duplicate — there,
  // and only there, a neutral label stands in.
  const named = formName(form)
  const echoesHeadline = phase === 'welcome' && named === (form.title ?? '').trim()
  const overline = (echoesHeadline ? '' : named) || 'Feedback'

  // Welcome + hero media gets its own full-bleed split layout: copy on the left,
  // the media on its backdrop running edge to edge on the right. Below lg
  // (tablet and mobile) the two halves stack.
  if (phase === 'welcome' && form.hero_image_url) {
    return (
      // On desktop each column is exactly half the screen and the media column
      // is exactly one viewport tall, so the media can never exceed 50vw × 100dvh.
      <main className="grid min-h-dvh w-full lg:h-dvh lg:grid-cols-2">
        <div className="u-rise flex flex-col justify-center px-6 py-14 sm:px-10 lg:px-14 lg:overflow-y-auto">
          <p className="truncate text-[14px] font-medium text-muted">{overline}</p>
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
        <HeroPanel
          src={form.hero_image_url}
          bg={form.hero_bg}
          dither={form.hero_dither}
          className="h-[60vh] lg:h-full"
          onExpand={() => setZoom({ type: 'image', src: form.hero_image_url, title: form.title || 'Hero image', alt: '' })}
        />
        {zoom && <MediaLightbox media={zoom} onClose={() => setZoom(null)} />}
      </main>
    )
  }

  return (
    // Vertically center the content: my-auto centers it when short, and collapses
    // to top-aligned + scrollable when the content is taller than the viewport.
    <main className="flex min-h-dvh w-full flex-col">
    <div className="mx-auto my-auto w-full max-w-[900px] px-4 py-10 sm:py-14">
      <p className="truncate text-[14px] font-medium text-muted">{overline}</p>

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
                                  {/* Media keeps its own aspect ratio, so options
                                      in a row can differ in height; the grid
                                      stretches every card to the tallest and
                                      this cell centres its media in what's left. */}
                                  <div className="flex flex-1 items-center justify-center px-5 py-6">
                                    <ZoomableMedia media={optionMedia(o)} embedKey={protoResets[o.id] ?? 0} />
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
                          {/* No name/description header: a static page shows the
                              media alone, and the builder hides those editors for
                              it. Rendering them would surface the "Option A"
                              defaults a page carries over when it's switched
                              from feedback to static. */}
                          <div className="flex h-full items-center justify-center px-5 py-6">
                            <ZoomableMedia media={optionMedia(o)} />
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
          returning={alreadyVoted}
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
  returning,
  onRestart,
  onUpvote,
}: {
  form: FullForm
  results: FormResults | null
  chosenIds: Set<string>
  preview: boolean
  /** Arrived already having responded, rather than having just submitted. */
  returning: boolean
  onRestart: () => void
  onUpvote: (id: string) => void
}) {
  return (
    <EndScreen
      headline={
        returning ? 'You\u2019ve already responded' : form.form.thank_you_message ? 'Thanks!' : "Thanks \u2014 your feedback's in."
      }
      message={
        returning
          ? // Say where the limit comes from, so it reads as a rule rather than a
            // glitch — and so someone who genuinely needs to redo it knows how.
            VOTING_REQUIRES_LOGIN
            ? 'This form takes one response per person, and yours has already been counted.'
            : 'This form takes one response per browser, and this one has already been counted.'
          : form.form.thank_you_message
      }
      results={results}
      pages={form.pages}
      options={form.options}
      chosenIds={chosenIds}
      onUpvote={onUpvote}
    >
      {preview && (
        <button
          type="button"
          onClick={onRestart}
          className="mt-6 inline-flex items-center gap-1.5 rounded-[16px] border border-line-strong px-4 py-2 text-[14px] font-medium text-ink transition hover:bg-black/[0.03]"
        >
          <span aria-hidden="true">↻</span> Start over
        </button>
      )}
    </EndScreen>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex min-h-dvh max-w-[600px] flex-col justify-center px-6 text-center">{children}</main>
}

/**
 * Shown in place of the form when nobody is signed in. Carries the form's slug
 * through to /login so signing in returns here rather than dumping the voter on
 * the creator dashboard — they arrived from a share link and want the form.
 */
function SignInGate({ slug }: { slug: string }) {
  return (
    <Centered>
      <h1 className="text-xl font-semibold">Sign in to respond</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">
        Responses are one per person, so this form needs your{' '}
        <span className="font-medium text-ink">{ALLOWED_EMAIL_DOMAIN}</span> account. You&rsquo;ll come
        straight back here.
      </p>
      <Link
        href={`/login?next=${encodeURIComponent(`/f/${slug}`)}`}
        className="mx-auto mt-6 inline-block rounded-[16px] bg-ink px-5 py-2.5 text-[14px] font-medium text-white transition hover:opacity-90"
      >
        Sign in
      </Link>
    </Centered>
  )
}

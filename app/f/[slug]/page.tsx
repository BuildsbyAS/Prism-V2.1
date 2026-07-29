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
  isFormNotAccepting,
  VOTING_REQUIRES_LOGIN,
} from '@/lib/store'
import { useCurrentUser } from '@/lib/auth'
import { ALLOWED_EMAIL_DOMAIN } from '@/lib/supabase'
import { ArrowClockwise, ArrowDown, ArrowLeft, Check } from '@phosphor-icons/react'
import Link from 'next/link'
import ZoomableMedia from '@/components/ZoomableMedia'
import MediaLightbox, { optionMedia, type LightboxMedia } from '@/components/MediaLightbox'
import WidgetInput from '@/components/WidgetInput'
import { EndScreen } from '@/components/EndScreen'
import { formName, neutralChoiceLabel } from '@/lib/builder'
import HeroPanel from '@/components/HeroPanel'

type Phase = 'welcome' | 'vote' | 'submitting' | 'done'

/**
 * How the media column lays out, by option count.
 *
 * Written out in full rather than composed (`'xl:grid-cols-' + n`): Tailwind
 * scans source for complete class names, so a constructed one is never
 * generated and the column silently keeps the previous layout. Four options go
 * 2×2 rather than four abreast — a quarter-width prototype is unreadable.
 */
const MEDIA_GRID: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2',
}

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
  // Which page the voter is on. The form used to render every page in one long
  // scroll; it is a sequence of steps now, so exactly one is on screen at a time.
  const [step, setStep] = useState(0)
  // The option the pointer is over on the left, which lifts its media on the
  // right and dims the rest.
  const [hovered, setHovered] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({})
  const [answerSaving, setAnswerSaving] = useState<Record<string, boolean>>({})
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
          // Open the screen the creator hit Preview from. It's a step index now,
          // not a scroll target.
          const at = f.pages.findIndex((p) => p.id === start)
          if (at >= 0) setStep(at)
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

  /**
   * What a single step still needs before the voter can move on.
   *
   * Checked per step rather than only at the end: the form is one page at a
   * time now, so an unanswered question three screens back can't be pointed at
   * — it has to be caught while it's still on screen.
   */
  function stepBlocker(pageIndex: number): string | null {
    if (!full) return null
    const page = full.pages[pageIndex]
    if (!page || page.type !== 'feedback') return null
    if (full.widgets.some((w) => w.page_id === page.id && answerSaving[w.id])) {
      return 'Wait for your recording to finish saving.'
    }
    if ((voteOptions[page.id]?.length ?? 0) > 0 && !choices[page.id]) {
      return 'Choose an option to continue.'
    }
    const unanswered = full.widgets.filter(
      (w) => w.page_id === page.id && w.config.required && answers[w.id] === undefined,
    )
    return unanswered.length ? 'Please answer the required questions.' : null
  }

  function goToStep(next: number) {
    setError(null)
    setStep(next)
    // Each step is its own screen, so it starts at the top like a page load.
    window.scrollTo({ top: 0 })
  }

  function nextStep() {
    const blocker = stepBlocker(step)
    if (blocker) return setError(blocker)
    goToStep(step + 1)
  }

  async function submit() {
    if (!full || submittingRef.current || hasVoted) return
    if (Object.values(answerSaving).some(Boolean)) {
      setError('Wait for your recording to finish saving.')
      return
    }
    // The step in front of the voter answers for itself first: every earlier one
    // was cleared on the way through, so naming "each comparison" here would
    // point at pages they can no longer see.
    const here = stepBlocker(step)
    if (here) {
      setError(here)
      return
    }
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
    // The creator walking their own form. They see the whole flow through to the
    // end screen — that's what preview is for — but nothing is recorded: a
    // rehearsal must not land in the tally they'll read the real results from.
    if (preview) {
      setHasVoted(true)
      if (full.form.show_results_to_voters) setResults(await getResults(full.form.id))
      setPhase('done')
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
      // Closed, unpublished, or expired between loading the form and submitting.
      if (isFormNotAccepting(e)) {
        setError('This form isn’t taking responses any more.')
        setPhase('vote')
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
    setAnswerSaving({})
    setResults(null)
    setHasVoted(false)
    setError(null)
    setStep(0)
    setPhase('welcome')
    window.scrollTo({ top: 0 })
  }

  if (state === 'loading') return <Centered>Loading…</Centered>
  if (state === 'missing' || !full) {
    return (
      <Centered>
        <h1 className="font-sans text-xl font-semibold">Form not found</h1>
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
        <h1 className="font-sans text-xl font-semibold">This form has closed</h1>
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

  // The overline names the form across the welcome and vote screens. It used to print `title`,
  // which is the welcome *headline*, so it read as a duplicate of the <h1>
  // directly beneath it. It shows the creator's name for the form instead.
  //
  // The thank-you screen deliberately omits it: the response confirmation is
  // the only identity it needs. An unnamed form is still known by its headline (see formName), so on the
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

  // ------------------------------- Vote ------------------------------------
  // One page per screen, moved through with Back / Next — the form used to
  // render every page in a single scroll, which buried the second comparison
  // and made "submit" mean "you're done with all of it" rather than "with this".
  //
  // Two columns: the brief and the decision on the left at 40%, the work being
  // judged on the right at 60%. The media is the reason the voter is here, so
  // it gets the room; the question stays beside it rather than above it, where
  // a tall prototype would push it off screen.
  if (phase === 'vote' || phase === 'submitting') {
    const page = full.pages[step]
    if (!page) return <Centered>This form has nothing to vote on yet.</Centered>

    const opts = voteOptions[page.id] ?? []
    const wids = full.widgets
      .filter((w) => w.page_id === page.id)
      .sort((a, b) => a.order_index - b.order_index)
    const isLast = step === full.pages.length - 1
    const picked = choices[page.id]
    const answerBusy = wids.some((w) => answerSaving[w.id])
    const busy = phase === 'submitting' || answerBusy
    // Dimming is a hover behaviour, not a record of the answer: a chosen option
    // marks itself (border, badge, button) without greying out the others, so
    // the voter can still compare — and change their mind — afterwards.
    const focus = hovered
    const selectable = page.type === 'feedback' && opts.length > 0
    // Nothing to argue about: until an answer is picked there is no response to
    // record, so the way forward stays shut rather than erroring on click.
    const needsPick = selectable && !picked

    return (
      <main className="flex min-h-dvh w-full flex-col">
        {/* Mobile reads in narrative order: first understand the question, then
            inspect the options, then answer the follow-up and continue. The
            desktop heading stays in the left column beside the media. */}
        <div className="u-rise px-6 pt-10 sm:px-10 lg:hidden">
          <p className="truncate text-[14px] font-medium text-muted">{overline}</p>
          {page.title && (
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-[30px]">{page.title}</h1>
          )}
          {page.body && (
            <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-muted">{page.body}</p>
          )}
        </div>

        {/* The 40/60 split holds whether or not anything was uploaded: a context
            screen with no media should read exactly like one with it, and
            collapsing to a single column re-centred the copy mid-page — the
            same words jumped position between two steps of the same form. */}
        <div className="grid w-full flex-1 grid-cols-1 lg:grid-cols-[30fr_70fr]">
          {/* Left — the brief, questions and way on. Below lg it follows the
              media; the mobile-only heading above means the question still
              leads while the feedback controls stay after the options. */}
          <div className="order-2 flex flex-col justify-center px-6 py-10 sm:px-10 lg:order-1 lg:h-dvh lg:overflow-y-auto lg:px-14">
            <div key={page.id} className="u-rise mx-auto w-full max-w-[560px]">
              <div className="hidden lg:block">
                <p className="truncate text-[14px] font-medium text-muted">{overline}</p>
                {page.title && (
                  <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-[30px]">{page.title}</h1>
                )}
                {page.body && (
                  <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-muted">{page.body}</p>
                )}
              </div>

              {page.type === 'feedback' &&
                wids.map((w) => (
                  <div key={w.id} className="mt-6">
                    <WidgetInput
                      widget={w}
                      value={answers[w.id]}
                      onChange={(v) => setAnswers((a) => ({ ...a, [w.id]: v }))}
                      onBusyChange={(saving) =>
                        setAnswerSaving((current) => ({ ...current, [w.id]: saving }))
                      }
                      hideLabel={w.config.showTitle === false}
                    />
                  </div>
                ))}

              {error && <p className="mt-4 text-[14px] text-red-600">{error}</p>}

              <div className="mt-8 flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => (step === 0 ? setPhase('welcome') : goToStep(step - 1))}
                  disabled={busy}
                  className="rounded-[16px] border border-line-strong px-4 py-2.5 text-[14px] font-medium text-ink transition hover:bg-black/[0.03] disabled:opacity-40"
                >
                  Back
                </button>
                {isLast ? (
                  <button
                    type="button"
                    onClick={submit}
                    disabled={busy || hasVoted || needsPick}
                    className="rounded-[16px] bg-ink px-6 py-2.5 text-[14px] font-medium text-white transition enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {busy ? 'Submitting…' : 'Submit'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={nextStep}
                    disabled={needsPick || busy}
                    className="rounded-[16px] bg-ink px-6 py-2.5 text-[14px] font-medium text-white transition enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next
                  </button>
                )}
                {full.pages.length > 1 && (
                  <span className="ml-auto text-[13px] tabular-nums text-muted">
                    {step + 1} of {full.pages.length}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right — what is being judged. With nothing to show it still holds
              the column open on desktop, but stays out of the way on a phone,
              where an empty panel above the copy would just read as broken. */}
          {opts.length === 0 ? (
            <div className="order-1 hidden bg-black/[0.04] lg:order-2 lg:block lg:h-dvh" />
          ) : (
            <div className="order-1 bg-black/[0.04] p-4 sm:p-6 lg:order-2 lg:h-dvh lg:overflow-y-auto">
              <div className={`grid gap-4 ${MEDIA_GRID[Math.min(opts.length, 4)] ?? MEDIA_GRID[2]}`}>
                {opts.map((o, i) => (
                  <MediaCell
                    key={o.id}
                    option={o}
                    badge={String.fromCharCode(65 + i)}
                    labelled={selectable}
                    dimmed={Boolean(focus) && focus !== o.id}
                    lifted={focus === o.id}
                    selected={picked === o.id}
                    onSelect={selectable ? () => setChoices((c) => ({ ...c, [page.id]: o.id })) : undefined}
                    disabled={hasVoted || busy}
                    resetKey={protoResets[o.id] ?? 0}
                    onReset={() => setProtoResets((r) => ({ ...r, [o.id]: (r[o.id] ?? 0) + 1 }))}
                    onHover={(on) => selectable && setHovered(on ? o.id : null)}
                  />
                ))}
              </div>
              {/* The creator controls whether this generated neutral answer is
                  offered. It lives with the options but has no media of its own. */}
              {selectable && opts.length >= 2 && page.show_neutral_option !== false && (
                <div className="mt-4">
                  <ChoiceRow
                    label={neutralChoiceLabel(opts.length)}
                    selected={picked === 'tie'}
                    disabled={hasVoted || busy}
                    onSelect={() => setChoices((c) => ({ ...c, [page.id]: 'tie' }))}
                    // A tie is about all of them, so it lifts nothing in particular.
                    onHover={() => setHovered(null)}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    )
  }

  return (
    // Vertically center the content: my-auto centers it when short, and collapses
    // to top-aligned + scrollable when the content is taller than the viewport.
    <main className="flex min-h-dvh w-full flex-col">
    <div className="mx-auto my-auto w-full max-w-[900px] px-4 py-10 sm:py-14">
      {phase !== 'done' && (
        <p className="truncate text-[14px] font-medium text-muted">{overline}</p>
      )}

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

      {/* ----------------------------- Thank you ---------------------------- */}
      {phase === 'done' && (
        <ThankYou
          form={full}
          results={form.show_results_to_voters ? results : null}
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
  preview,
  returning,
  onRestart,
  onUpvote,
}: {
  form: FullForm
  results: FormResults | null
  preview: boolean
  /** Arrived already having responded, rather than having just submitted. */
  returning: boolean
  onRestart: () => void
  onUpvote: (id: string) => void
}) {
  return (
    <EndScreen
      headline={
        preview
          ? 'End screen preview'
          : returning
            ? 'You\u2019ve already responded'
            : form.form.thank_you_message
              ? 'Thanks!'
              : "Thanks \u2014 your feedback's in."
      }
      message={
        preview
          ? // Said at the moment a creator would otherwise assume it counted.
            // Everything up to here behaves like the real thing, so the one place
            // it deliberately doesn't is worth stating outright.
            'Nothing was recorded — previews never count towards your responses.'
          : returning
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
      onUpvote={onUpvote}
    >
      {preview ? (
        <button
          type="button"
          onClick={onRestart}
          className="mt-6 inline-flex items-center gap-1.5 rounded-[16px] border border-line-strong px-4 py-2 text-[14px] font-medium text-ink transition hover:bg-black/[0.03]"
        >
          <ArrowClockwise size={15} aria-hidden="true" /> Start over
        </button>
      ) : (
        <Link
          href="/creator"
          className="mt-6 inline-flex items-center gap-1.5 rounded-[16px] border border-line-strong px-4 py-2 text-[14px] font-medium text-ink transition hover:bg-black/[0.03]"
        >
          <ArrowLeft size={15} aria-hidden="true" /> Back to My forms
        </Link>
      )}
    </EndScreen>
  )
}

/**
 * The answer that has no media of its own — "Both feel equal".
 *
 * A full-width row under the media grid rather than a fourth card: there is
 * nothing to show for it, and an empty card sitting beside real screens reads
 * as a missing image.
 */
function ChoiceRow({
  label,
  selected,
  disabled,
  onSelect,
  onHover,
}: {
  label: string
  selected: boolean
  disabled?: boolean
  onSelect: () => void
  onHover: (on: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      // Focus counts as hover: the link between an answer and the media it
      // refers to is the whole point of the layout, and a keyboard should get it.
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      className={`flex w-full items-center justify-center gap-1.5 rounded-[16px] border bg-card px-4 py-3.5 text-[15px] font-medium transition disabled:cursor-not-allowed ${
        selected ? 'border-ink bg-ink text-white' : 'border-line text-ink hover:border-ink/40'
      }`}
    >
      {selected && <Check size={16} weight="bold" aria-hidden="true" />}
      {label}
    </button>
  )
}

/**
 * One option's media in the right-hand column.
 *
 * Dims to let its sibling stand out while that sibling is hovered on the left,
 * so pointing at an answer answers "which one is that again?" without a click.
 * The card keeps its own hover wired to the same state, so the highlight works
 * from either side.
 */
function MediaCell({
  option,
  badge,
  labelled,
  dimmed,
  lifted,
  selected = false,
  onSelect,
  disabled,
  resetKey,
  onReset,
  onHover,
}: {
  option: Option
  badge: string
  /** False on a context page, where the media is shown but not chosen between. */
  labelled: boolean
  dimmed: boolean
  lifted: boolean
  selected?: boolean
  /** Undefined on a context page — there is nothing to choose. */
  onSelect?: () => void
  disabled?: boolean
  resetKey: number
  onReset: () => void
  onHover: (on: boolean) => void
}) {
  const isPrototype = Boolean(option.embed_url) && option.embed_type !== 'image'
  return (
    <div
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      className={`flex min-h-0 flex-col overflow-hidden rounded-[20px] border bg-card transition duration-200 ${
        dimmed ? 'opacity-35' : 'opacity-100'
      } ${
        lifted || selected
          ? 'border-ink shadow-[0_2px_10px_-2px_rgba(0,0,0,0.10),0_18px_44px_-20px_rgba(0,0,0,0.30)]'
          : 'border-line'
      }`}
    >
      {labelled && (
        <div className="flex flex-none items-center justify-between gap-3 border-b border-line px-4 py-3">
          <span className="flex min-w-0 items-center gap-2">
            <span
              className={`grid h-6 w-6 flex-none place-items-center rounded-md text-[12px] font-semibold transition ${
                lifted || selected ? 'bg-ink text-white' : 'bg-black/[0.06] text-muted'
              }`}
              aria-hidden="true"
            >
              {badge}
            </span>
            <span className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight">{option.name}</span>
          </span>
          {isPrototype ? (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex flex-none items-center gap-1 rounded-[12px] border border-line-strong px-2.5 py-1 text-[13px] font-medium text-muted transition hover:bg-black/[0.03] hover:text-ink"
            >
              <ArrowClockwise size={13} aria-hidden="true" /> Reset
            </button>
          ) : (
            <span className="inline-flex flex-none items-center gap-1 whitespace-nowrap text-[13px] text-muted">
              tap to zoom <ArrowDown size={12} aria-hidden="true" />
            </span>
          )}
        </div>
      )}
      {/* Only on a page that is actually being chosen between. A context page
          keeps whatever names and descriptions it had as a comparison, so a page
          switched from Get Vote would otherwise surface stale "Option A" copy. */}
      {labelled && option.description && (
        <p className="flex-none border-b border-line px-4 py-2.5 text-[14px] text-muted">{option.description}</p>
      )}
      <div className="flex flex-1 items-center justify-center p-4">
        <ZoomableMedia media={optionMedia(option)} embedKey={resetKey} />
      </div>
      {/* The answer sits on the thing it answers about. Its own control rather
          than the whole card: the media above it is clickable in its own right —
          tapping it zooms — and one rectangle cannot mean two things. */}
      {onSelect && (
        <div className="mt-auto flex-none border-t border-line p-3">
          <button
            type="button"
            onClick={onSelect}
            disabled={disabled}
            aria-pressed={selected}
            onFocus={() => onHover(true)}
            onBlur={() => onHover(false)}
            className={`flex w-full items-center justify-center gap-1.5 rounded-[14px] py-2.5 text-[14px] font-semibold transition disabled:cursor-not-allowed ${
              selected
                ? 'bg-ink text-white'
                : 'border border-line-strong text-ink hover:border-ink/40 hover:bg-black/[0.03]'
            }`}
          >
            {selected && <Check size={15} weight="bold" aria-hidden="true" />}
            {selected ? 'Selected' : 'Select this one'}
          </button>
        </div>
      )}
    </div>
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
      <h1 className="font-sans text-xl font-semibold">Sign in to respond</h1>
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

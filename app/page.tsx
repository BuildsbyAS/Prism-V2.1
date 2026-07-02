'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase, isSupabaseConfigured, POLL_SLUG } from '@/lib/supabase'
import IntroVisual from '@/components/IntroVisual'

type Choice = 'A' | 'B' | 'Both'
type CommentRow = { choice: Choice; comment: string; created_at: string }
type Results = { A: number; B: number; Both: number; comments: CommentRow[] }

const EMPTY: Results = { A: 0, B: 0, Both: 0, comments: [] }

// One vote per browser: a completed vote is remembered here so the form can't
// be resubmitted from the same browser.
const VOTED_KEY = `rnr-voted:${POLL_SLUG}`

// A = Pills, B = Checkbox. Kept neutral in the UI to avoid biasing voters.
const PROTOTYPES = {
  A: { label: 'A', src: '/proto/pills/index.html' },
  B: { label: 'B', src: '/proto/checkbox/index.html' },
} as const

function timeAgo(iso: string): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function Page() {
  const [choice, setChoice] = useState<Choice | null>(null)
  const [comment, setComment] = useState('')
  const [phase, setPhase] = useState<'intro' | 'vote' | 'submitting' | 'done'>('intro')
  const [results, setResults] = useState<Results>(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Fallback tally used only when Supabase isn't configured (demo mode).
  const [local, setLocal] = useState<Results>(EMPTY)

  // True once this browser has voted (read from localStorage on mount).
  const [hasVoted, setHasVoted] = useState(false)

  // Synchronous re-entrancy lock: a fast double-click fires before React
  // re-renders the disabled button, so guard with a ref (updates immediately).
  const submittingRef = useRef(false)

  async function loadResults() {
    if (!isSupabaseConfigured || !supabase) {
      setResults(local)
      return
    }
    const { data, error } = await supabase
      .from('votes')
      .select('choice,comment,created_at')
      .eq('poll_slug', POLL_SLUG)
      .order('created_at', { ascending: false })
    if (error) {
      setError(error.message)
      return
    }
    const r: Results = { A: 0, B: 0, Both: 0, comments: [] }
    for (const row of data ?? []) {
      const c = row.choice as Choice
      if (c === 'A' || c === 'B' || c === 'Both') r[c] += 1
      if (row.comment && r.comments.length < 12) {
        r.comments.push(row as CommentRow)
      }
    }
    setResults(r)
  }

  async function submit() {
    if (!choice || hasVoted || submittingRef.current) return
    submittingRef.current = true
    setError(null)
    setPhase('submitting')
    const trimmed = comment.trim()

    try {
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase
          .from('votes')
          .insert({ poll_slug: POLL_SLUG, choice, comment: trimmed || null })
        if (error) {
          setError(error.message)
          setPhase('vote')
          return
        }
        await loadResults()
        // Lock to one vote per browser — only after a real server-recorded vote.
        try {
          localStorage.setItem(VOTED_KEY, choice)
        } catch {
          /* localStorage unavailable — vote still recorded server-side */
        }
        setHasVoted(true)
      } else {
        // Demo mode (no Supabase): tally locally and stay replayable — no lock.
        const next: Results = {
          A: local.A + (choice === 'A' ? 1 : 0),
          B: local.B + (choice === 'B' ? 1 : 0),
          Both: local.Both + (choice === 'Both' ? 1 : 0),
          comments: [
            ...(trimmed ? [{ choice, comment: trimmed, created_at: new Date().toISOString() }] : []),
            ...local.comments,
          ].slice(0, 12),
        }
        setLocal(next)
        setResults(next)
      }
      setPhase('done')
    } finally {
      submittingRef.current = false
    }
  }

  function reset() {
    // Keep the recorded choice for an already-voted user so the "your vote"
    // badge still shows when they return to results.
    if (!hasVoted) setChoice(null)
    setComment('')
    setError(null)
    setPhase('vote')
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard blocked — ignore */
    }
  }

  // On mount: if this browser already voted, lock voting and preload results.
  useEffect(() => {
    let prev: string | null = null
    try {
      prev = localStorage.getItem(VOTED_KEY)
    } catch {
      /* localStorage unavailable */
    }
    if (prev) {
      setHasVoted(true)
      if (prev === 'A' || prev === 'B' || prev === 'Both') setChoice(prev)
      // Already voted on this browser → take them straight to the results.
      loadResults().then(() => setPhase('done'))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const total = results.A + results.B + results.Both
  const resultRows: { key: Choice; label: string }[] = [
    { key: 'A', label: 'A' },
    { key: 'B', label: 'B' },
    { key: 'Both', label: 'Both equal' },
  ]

  return (
    <main className="mx-auto w-full max-w-[820px] px-4 py-10 sm:py-14">
      {(phase === 'vote' || phase === 'submitting') && (
        <button
          type="button"
          onClick={() => setPhase('intro')}
          className="mb-4 inline-flex items-center gap-1.5 rounded-[16px] text-[13px] font-medium text-muted transition hover:text-ink"
        >
          <span aria-hidden="true">←</span> Back
        </button>
      )}
      <p className="text-[13px] font-medium text-muted">Ratings &amp; Reviews · 2.0</p>

      {phase === 'intro' ? (
        <>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-[28px]">
            Two takes on the review flow
          </h1>
          <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-muted">
            Two iterations of the Ratings &amp; Reviews flow — the screens for rating a
            product and writing a review. They do the same job in different ways. Next,
            you&rsquo;ll try both and tell us which feels better.
          </p>

          <IntroVisual />

          <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2">
            <button
              type="button"
              onClick={() => setPhase('vote')}
              className="rounded-[16px] bg-ink px-5 py-2 text-[13px] font-medium text-white transition hover:opacity-90"
            >
              Get started
            </button>
            <span className="text-[13px] text-muted">Takes about a minute</span>
          </div>
        </>
      ) : (
        <>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-[28px]">
            Which review flow feels better?
          </h1>
      <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-muted">
        Two prototypes of the same flow. Tap through both, choose the one you prefer — or
        call it a tie — and tell us why.
      </p>

      {!isSupabaseConfigured && (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <b>Demo mode.</b> Supabase isn&rsquo;t connected yet, so votes stay only in this
          browser.
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-[26px] border border-line bg-card shadow-[0_1px_2px_rgba(0,0,0,0.03),0_16px_44px_-24px_rgba(0,0,0,0.18)]">
        {phase !== 'done' ? (
          <>
            <div className="grid grid-cols-1 divide-y divide-line md:grid-cols-2 md:divide-x md:divide-y-0">
              {(['A', 'B'] as const).map((key) => {
                const p = PROTOTYPES[key]
                const selected = choice === key
                return (
                  <div
                    key={key}
                    className={`flex flex-col transition-colors ${selected ? 'bg-black/[0.015]' : ''}`}
                  >
                    {/* Clear panel header */}
                    <div className="flex items-center justify-between border-b border-line px-5 py-3">
                      <span className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
                        <span className="grid h-6 w-6 place-items-center rounded-lg bg-black/[0.06] text-xs font-bold text-ink">
                          {p.label}
                        </span>
                        Option {p.label}
                      </span>
                      <span className="text-xs text-muted">tap to try ↓</span>
                    </div>

                    <div className="flex justify-center px-5 py-6">
                      <div className="device">
                        <div className="screen">
                          <iframe src={p.src} title={`Prototype ${p.label}`} />
                        </div>
                      </div>
                    </div>

                    <div className="mt-auto border-t border-line p-3">
                      <button
                        id={`select-${key}`}
                        type="button"
                        onClick={() => setChoice(key)}
                        disabled={hasVoted}
                        className={`w-full rounded-[16px] py-2 text-[13px] font-semibold text-ink transition disabled:cursor-not-allowed ${
                          selected
                            ? 'border border-transparent bg-black/[0.06]'
                            : 'border border-line-strong hover:bg-black/[0.03]'
                        }`}
                      >
                        {selected ? `✓ ${p.label} selected` : `Select ${p.label}`}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="border-t border-line p-5">
              {hasVoted ? (
                <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-medium">
                    You&rsquo;ve already voted in this poll — thanks!
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      loadResults()
                      setPhase('done')
                    }}
                    className="shrink-0 rounded-[16px] bg-ink px-5 py-2 text-[13px] font-medium text-white transition hover:opacity-90"
                  >
                    See results
                  </button>
                </div>
              ) : (
                <>
              <button
                id="select-both"
                type="button"
                onClick={() => setChoice('Both')}
                className={`w-full rounded-[16px] border border-line-strong py-2.5 text-[13px] font-semibold text-ink transition ${
                  choice === 'Both' ? 'bg-black/[0.05]' : 'hover:bg-black/[0.025]'
                }`}
              >
                {choice === 'Both' ? '✓ Both feel equal' : 'Both feel equal'}
              </button>

              <div className="mt-4">
                <label htmlFor="why" className="mb-1.5 block text-[13px] font-medium">
                  {choice === 'A' || choice === 'B'
                    ? `Why did you choose ${choice}?`
                    : choice === 'Both'
                      ? 'Why do they feel equal?'
                      : 'What made you choose?'}{' '}
                  <span className="font-normal text-muted">(optional)</span>
                </label>
                <textarea
                  id="why"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  placeholder="e.g. A felt faster to scan, B was clearer about what's selected…"
                  className="w-full resize-none rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm outline-none placeholder:text-muted focus:border-ink"
                />
              </div>

              {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

              <button
                id="submit-vote"
                type="button"
                onClick={submit}
                disabled={!choice || phase === 'submitting'}
                className="mt-4 ml-auto block w-fit rounded-[16px] bg-ink px-5 py-2 text-[13px] font-medium text-white transition enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {phase === 'submitting' ? 'Submitting…' : 'Submit vote'}
              </button>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="p-5 sm:p-6">
            <div className="flex items-center gap-2.5">
              <svg width="20" height="20" viewBox="0 0 22 22" aria-hidden="true">
                <circle cx="11" cy="11" r="11" fill="#18191d" />
                <path
                  d="M6 11.2l3.2 3.2L16 7.6"
                  fill="none"
                  stroke="#fff"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <h2 className="text-base font-semibold">Thanks — your vote&rsquo;s in.</h2>
            </div>
            <p className="mt-1 text-[13px] text-muted">
              {total} {total === 1 ? 'vote' : 'votes'} so far
              {!isSupabaseConfigured && ' (this browser only)'}.
            </p>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

            <div className="mt-5 space-y-3.5">
              {resultRows.map((r) => {
                const n = results[r.key]
                const pct = total ? Math.round((n / total) * 100) : 0
                const mine = choice === r.key
                return (
                  <div key={r.key}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium">
                        {r.label}
                        {mine && (
                          <span className="ml-2 rounded-full bg-black/[0.06] px-2 py-0.5 text-xs text-muted">
                            your vote
                          </span>
                        )}
                      </span>
                      <span className="tabular-nums text-muted">
                        {pct}% · {n}
                      </span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/[0.06]">
                      <div
                        className="h-full rounded-full bg-ink transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>

            {results.comments.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold">Recent comments</h3>
                <ul className="mt-2 space-y-2">
                  {results.comments.map((c, i) => (
                    <li
                      key={i}
                      className="rounded-xl border border-line px-3.5 py-2.5 text-sm leading-relaxed"
                    >
                      <span className="mr-2 rounded-md bg-black/[0.06] px-1.5 py-0.5 text-xs font-medium">
                        {c.choice}
                      </span>
                      {c.comment}
                      <span className="ml-2 whitespace-nowrap text-xs text-muted">
                        {timeAgo(c.created_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button
              type="button"
              onClick={reset}
              className="mt-6 w-full rounded-[16px] border border-line-strong py-2.5 text-[13px] font-semibold hover:bg-black/[0.03]"
            >
              ← Back to the prototypes
            </button>
          </div>
        )}
      </div>

      <div className="mt-5 flex items-center justify-between text-[13px] text-muted">
        <span>Pills = A · Checkbox = B</span>
        <button
          type="button"
          onClick={copyLink}
          className="rounded-[16px] border border-line px-3 py-1.5 font-medium text-ink transition hover:bg-black/[0.03]"
        >
          {copied ? 'Link copied ✓' : 'Copy share link'}
        </button>
      </div>
        </>
      )}
    </main>
  )
}

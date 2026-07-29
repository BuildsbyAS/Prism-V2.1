'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import type { FullForm, FormResults } from '@/lib/types'
import { getFullForm, getResults, getFormVoters, markResponsesSeen, type FormVoter } from '@/lib/store'
import { useCurrentUser } from '@/lib/auth'
import { WIDGET_META, formName } from '@/lib/builder'
import { personName, timeAgo } from '@/lib/format'
import FormHeader from '@/components/builder/FormHeader'
import StatusBadge from '@/components/StatusBadge'

export default function ResultsPage() {
  const params = useParams<{ formId: string }>()
  const formId = params.formId
  const { user } = useCurrentUser()
  const [full, setFull] = useState<FullForm | null>(null)
  const [results, setResults] = useState<FormResults | null>(null)
  const [voters, setVoters] = useState<FormVoter[] | null>(null)
  const [missing, setMissing] = useState(false)

  // Whose form this is. The RPC behind getFormVoters enforces this server-side
  // too — this only keeps the table's shell from rendering for someone who
  // would get an empty list anyway.
  const isCreator = Boolean(full && user && full.form.creator_id === user.id)

  useEffect(() => {
    getFullForm(formId).then((f) => {
      if (!f) return setMissing(true)
      setFull(f)
      getResults(formId).then(setResults)
      // Opening the results *is* reading the responses, so this is what clears
      // the form's entry from the header's Updates menu.
      markResponsesSeen(formId).catch(() => {})
    })
  }, [formId])

  useEffect(() => {
    if (!isCreator) return
    getFormVoters(formId)
      .then(setVoters)
      .catch(() => setVoters([]))
  }, [formId, isCreator])

  if (missing) {
    return (
      <>
        <FormHeader formId={formId} tab="results" canEdit={false} />
        <main className="mx-auto max-w-[600px] px-6 py-24 text-center">
          <h1 className="text-xl font-semibold">Form not found</h1>
          <Link href="/creator" className="mt-5 inline-block rounded-[16px] bg-ink px-5 py-2.5 text-[14px] font-medium text-white">
            ← Back to forms
          </Link>
        </main>
      </>
    )
  }

  return (
    <>
      {/* The form's own header, so Results is a tab of the form rather than a
          page under the dashboard — the name, the status and the way back to the
          editor all stay where they were a click ago. */}
      <FormHeader
        formId={formId}
        tab="results"
        name={full ? formName(full.form) : null}
        canEdit={isCreator}
        status={full ? <StatusBadge status={full.form.status} /> : undefined}
      />
      <main className="mx-auto w-full max-w-[820px] px-4 py-10 sm:px-6 sm:py-12">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">
            {(full && formName(full.form)) || 'Untitled form'}
          </h1>
          {full?.form.testing_question && (
            <p className="mt-1 text-[14px] text-muted">{full.form.testing_question}</p>
          )}
        </div>

        {/* Overview */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Responses" value={results ? String(results.total) : '—'} />
          <Stat label="First" value={results?.firstAt ? timeAgo(results.firstAt) : '—'} />
          <Stat label="Last" value={results?.lastAt ? timeAgo(results.lastAt) : '—'} />
          <Stat label="Status" value={full ? full.form.status : '—'} />
        </div>

        {results && results.total === 0 && (
          <div className="mt-8 rounded-[26px] border border-dashed border-line-strong bg-black/[0.015] px-6 py-14 text-center">
            <p className="text-[15px] font-medium">No responses yet</p>
            <p className="mt-1 text-[14px] text-muted">Share the voter link to start collecting feedback.</p>
            {full && (
              <Link
                href={`/f/${full.form.slug}`}
                target="_blank"
                className="mt-4 inline-block rounded-[16px] border border-line-strong px-4 py-2 text-[14px] font-semibold transition hover:bg-black/[0.03]"
              >
                Open voter link ↗
              </Link>
            )}
          </div>
        )}

        {full && results && results.total > 0 && (
          <div className="mt-8 space-y-8">
            {/* Who responded — creator only. */}
            {isCreator && voters && voters.length > 0 && <Respondents full={full} voters={voters} />}

            {/* Option split */}
            {full.options.length > 0 && (
              <Section title="Option split">
                {full.options.map((o) => {
                  const n = results.optionCounts[o.id] ?? 0
                  const pct = results.total ? Math.round((n / results.total) * 100) : 0
                  return <Bar key={o.id} label={o.name} pct={pct} n={n} />
                })}
              </Section>
            )}

            {/* Per-widget */}
            {results.widgets.map((b) => (
              <Section key={b.widget.id} title={b.widget.config.label || WIDGET_META[b.widget.type].label}>
                {b.widget.type === 'voice' ? (
                  <ul className="space-y-2">
                    {b.textAnswers.length === 0 && <li className="text-[14px] text-muted">No voice responses.</li>}
                    {b.textAnswers.map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3.5 py-2.5">
                        <audio src={t.value} controls className="h-9 w-full min-w-0 max-w-[320px]" />
                        <span className="flex-none rounded-full bg-black/[0.06] px-2 py-0.5 text-[13px] text-muted">▲ {t.upvotes}</span>
                      </li>
                    ))}
                  </ul>
                ) : b.widget.type === 'text' ? (
                  <ul className="space-y-2">
                    {b.textAnswers.length === 0 && <li className="text-[14px] text-muted">No text responses.</li>}
                    {b.textAnswers.map((t) => (
                      <li key={t.id} className="flex items-start justify-between gap-3 rounded-xl border border-line px-3.5 py-2.5 text-sm leading-relaxed">
                        <span>{t.value}</span>
                        <span className="flex-none rounded-full bg-black/[0.06] px-2 py-0.5 text-[13px] text-muted">▲ {t.upvotes}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <>
                    {b.average !== null && (
                      <p className="mb-3 text-[14px] text-muted">
                        Average: <span className="font-medium text-ink">{b.average}</span> · {b.count} answers
                      </p>
                    )}
                    {Object.entries(b.distribution)
                      .sort((a, c) => (a[0] < c[0] ? -1 : 1))
                      .map(([k, n]) => (
                        <Bar key={k} label={k} pct={b.count ? Math.round((n / b.count) * 100) : 0} n={n} />
                      ))}
                  </>
                )}
              </Section>
            ))}
          </div>
        )}
      </main>
    </>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <p className="text-[13px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold tracking-tight capitalize">{value}</p>
    </div>
  )
}

/**
 * Who responded, and what each of them picked. Only rendered for the form's
 * creator — and only populated for them either way, since the RPC behind it
 * checks ownership server-side.
 *
 * A column per Get Vote page rather than one merged "picks" cell: a form with
 * two comparisons is exactly when you want to see whether someone who chose A
 * on the first also chose A on the second, and merging them loses that.
 */
function Respondents({ full, voters }: { full: FullForm; voters: FormVoter[] }) {
  const votePages = full.pages.filter((p) => p.type === 'feedback')
  const optionName = (id: string) =>
    id === 'tie' ? 'No preference' : full.options.find((o) => o.id === id)?.name || '—'

  return (
    <section className="rounded-[26px] border border-line bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_16px_44px_-24px_rgba(0,0,0,0.18)] sm:p-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold">
          Respondents <span className="ml-1 font-normal text-muted tabular-nums">{voters.length}</span>
        </h2>
        {/* Said plainly: this is the one part of the page that names people, and
            the creator should know it isn't shared. */}
        <p className="text-[13px] text-muted">Only you can see this — voters and the Team feed can&rsquo;t.</p>
      </div>

      {/* Scrolls sideways rather than crushing the columns: a form with several
          comparisons is wider than a phone. */}
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[420px] border-collapse text-left">
          <thead>
            <tr className="border-b border-line">
              <Th>Voter</Th>
              <Th>Responded</Th>
              {votePages.map((p, i) => (
                <Th key={p.id}>{p.title.trim() || `Comparison ${i + 1}`}</Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {voters.map((v) => (
              <tr key={v.responseId} className="border-b border-line last:border-b-0">
                <td className="py-2.5 pr-3 align-top">
                  {v.email ? (
                    <>
                      <span className="block text-[14px] font-medium">{personName(v.email)}</span>
                      <span className="block text-[13px] text-muted">{v.email}</span>
                    </>
                  ) : (
                    // Demo mode: no accounts exist, so don't invent a name.
                    <>
                      <span className="block text-[14px] font-medium">Anonymous</span>
                      <span className="block font-mono text-[12px] text-muted">
                        {v.sessionId ? `${v.sessionId.slice(0, 8)}…` : 'unknown'}
                      </span>
                    </>
                  )}
                </td>
                <td className="whitespace-nowrap py-2.5 pr-3 align-top text-[13px] text-muted">
                  {timeAgo(v.submittedAt)}
                </td>
                {votePages.map((p) => (
                  <td key={p.id} className="py-2.5 pr-3 align-top text-[14px]">
                    {v.choices[p.id] ? optionName(v.choices[p.id]) : <span className="text-muted">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="pb-2 pr-3 text-[13px] font-medium text-muted">{children}</th>
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[26px] border border-line bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_16px_44px_-24px_rgba(0,0,0,0.18)] sm:p-6">
      <h2 className="mb-4 text-sm font-semibold">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

function Bar({ label, pct, n }: { label: string; pct: number; n: number }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted">{pct}% · {n}</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/[0.06]">
        <div className="h-full rounded-full bg-ink transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

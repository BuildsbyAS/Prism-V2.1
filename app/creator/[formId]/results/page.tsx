'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import type { FullForm, FormResults, Page } from '@/lib/types'
import { getFullForm, getResults, getFormVoters, markResponsesSeen, type FormVoter } from '@/lib/store'
import { useCurrentUser } from '@/lib/auth'
import {
  WIDGET_META,
  formName,
  hasResults,
  neutralChoiceKey,
  neutralChoiceLabel,
} from '@/lib/builder'
import { expiryLabel, personName, timeAgo } from '@/lib/format'
import FormHeader from '@/components/builder/FormHeader'
import { ArrowLeft, ArrowUpRight, CaretUp } from '@phosphor-icons/react'
import StatusBadge from '@/components/StatusBadge'
import {
  ChartCard,
  DistributionColumns,
  HeroFigure,
  NominalBars,
  ShareBar,
  ShareLegend,
  StatTile,
  optionColor,
  type Slice,
} from '@/components/Charts'
import { ratingBuckets, sliderBuckets, toBuckets } from '@/components/EndScreen'

export default function ResultsPage() {
  const params = useParams<{ formId: string }>()
  const formId = params.formId
  const { user, loading: authLoading } = useCurrentUser()
  const [full, setFull] = useState<FullForm | null>(null)
  const [results, setResults] = useState<FormResults | null>(null)
  const [voters, setVoters] = useState<FormVoter[] | null>(null)
  const [missing, setMissing] = useState(false)

  // The creator and named collaborators are editors. The RPC behind
  // getFormVoters applies this same rule server-side; this controls the private
  // results UI and editor navigation.
  const isEditor = Boolean(
    full &&
      user &&
      (full.form.creator_id === user.id ||
        (full.form.collaborators ?? []).some(
          (email) => email.toLowerCase() === user.email.toLowerCase(),
        )),
  )

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
    if (!isEditor) return
    getFormVoters(formId)
      .then(setVoters)
      .catch(() => setVoters([]))
  }, [formId, isEditor])

  // A draft has never collected anything, so there is nothing here to read. The
  // tab is hidden for one (see hasResults), but the URL is still typeable and
  // an old link still resolves — say so rather than rendering empty totals.
  if (full && !hasResults(full.form)) {
    return (
      <>
        <FormHeader
          formId={formId}
          tab="results"
          name={formName(full.form)}
          canEdit={isEditor}
          canSeeResults={false}
          status={<StatusBadge status={full.form.status} />}
        />
        <main className="mx-auto max-w-[600px] px-6 py-24 text-center">
          <h1 className="font-sans text-xl font-semibold">No results yet</h1>
          <p className="mt-2 text-[15px] text-muted">
            This form is still a draft. Publish it and responses will show up here.
          </p>
          <Link
            href={`/creator/${formId}/edit`}
            className="mt-5 inline-flex items-center gap-1.5 rounded-[16px] bg-ink px-5 py-2.5 text-[14px] font-medium text-white"
          >
            <ArrowLeft size={14} aria-hidden="true" /> Back to the editor
          </Link>
        </main>
      </>
    )
  }

  if (full && !authLoading && !isEditor && !full.form.show_results_to_voters) {
    return (
      <>
        <FormHeader
          formId={formId}
          tab="results"
          name={formName(full.form)}
          canEdit={false}
          canSeeResults={false}
          status={<StatusBadge status={full.form.status} />}
        />
        <main className="mx-auto max-w-[600px] px-6 py-24 text-center">
          <h1 className="font-sans text-xl font-semibold">Results are private</h1>
          <p className="mt-2 text-[15px] text-muted">
            The creator hasn’t made this form’s results visible to voters.
          </p>
          <Link
            href="/creator/team"
            className="mt-5 inline-flex items-center gap-1.5 rounded-[16px] bg-ink px-5 py-2.5 text-[14px] font-medium text-white"
          >
            <ArrowLeft size={14} aria-hidden="true" /> Back to team
          </Link>
        </main>
      </>
    )
  }

  if (missing) {
    return (
      <>
        <FormHeader formId={formId} tab="results" canEdit={false} />
        <main className="mx-auto max-w-[600px] px-6 py-24 text-center">
          <h1 className="font-sans text-xl font-semibold">Form not found</h1>
          <Link href="/creator" className="mt-5 inline-block rounded-[16px] bg-ink px-5 py-2.5 text-[14px] font-medium text-white">
            <ArrowLeft size={14} aria-hidden="true" /> Back to forms
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
        canEdit={isEditor}
        canSeeResults
        status={full ? <StatusBadge status={full.form.status} /> : undefined}
      />
      <main className="u-view mx-auto w-full max-w-[820px] px-4 py-10 sm:px-6 sm:py-12">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">
            {(full && formName(full.form)) || 'Untitled form'}
          </h1>
          {full?.form.testing_question && (
            <p className="mt-1 text-[14px] text-muted">{full.form.testing_question}</p>
          )}
        </div>

        {/* The report leads with its one number. Four equal tiles gave the count
            the same weight as the timestamps beside it — but "how many people
            answered" decides whether any of the rest is worth reading, so it
            takes the hero and the others become its footnotes. */}
        <div className="mt-6 flex flex-wrap items-end justify-between gap-6 border-b border-line pb-6">
          <HeroFigure
            label="Responses"
            value={results ? String(results.total) : '—'}
            sub={
              results?.firstAt && results?.lastAt
                ? `First ${timeAgo(results.firstAt)} · latest ${timeAgo(results.lastAt)}`
                : undefined
            }
          />
          <div className="grid flex-1 grid-cols-2 gap-3 sm:max-w-[400px]">
            <StatTile label="Pod" value={full?.form.pod || '—'} />
            <StatTile label="Closes" value={(full?.form.expires_at && expiryLabel(full.form.expires_at)) || '—'} />
          </div>
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
                Open voter link <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            )}
          </div>
        )}

        {full && results && results.total > 0 && (
          <div className="mt-8 space-y-8">
            {/* One chart per comparison rather than one list of every option in
                the form: two Get Vote pages are two separate questions, and
                pooling their options into a single ranking compares things that
                were never on screen together. */}
            {full.pages
              .filter((p) => p.type === 'feedback')
              .map((page) => {
                const opts = full.options.filter((o) => o.page_id === page.id)
                if (opts.length === 0) return null
                const slices: Slice[] = opts.map((o, i) => ({
                  id: o.id,
                  label: o.name,
                  value: results.optionCounts[o.id] ?? 0,
                  color: optionColor(i),
                }))
                const neutralCount = results.optionCounts[neutralChoiceKey(page.id)] ?? 0
                if (page.show_neutral_option !== false || neutralCount > 0) {
                  slices.push({
                    id: neutralChoiceKey(page.id),
                    label: neutralChoiceLabel(opts.length),
                    value: neutralCount,
                    color: optionColor(opts.length),
                  })
                }
                const voted = slices.reduce((sum, sl) => sum + sl.value, 0)
                const lead = slices.reduce((best, sl) => (sl.value > best.value ? sl : best), slices[0])
                return (
                  <ChartCard
                    key={page.id}
                    title={page.title || 'Comparison'}
                    meta={voted ? `${voted} ${voted === 1 ? 'vote' : 'votes'}` : 'No votes yet'}
                  >
                    <div className="space-y-3.5">
                      <ShareBar slices={slices} total={voted} />
                      <ShareLegend slices={slices} total={voted} leadId={lead.value > 0 ? lead.id : null} />
                    </div>
                  </ChartCard>
                )
              })}

            {/* Per-widget */}
            {results.widgets.map((b) => {
              // Written answers are counted from what actually came back (a blank
              // one isn't an answer); everything else is counted from the tally,
              // or a multiple choice reports "0 answers" beside its own bars.
              const answered = b.widget.type === 'text' || b.widget.type === 'voice' ? b.textAnswers.length : b.count
              return (
              <ChartCard
                key={b.widget.id}
                title={b.widget.config.label || WIDGET_META[b.widget.type].label}
                meta={
                  b.average !== null
                    ? `Average ${b.average} · ${answered} ${answered === 1 ? 'answer' : 'answers'}`
                    : `${answered} ${answered === 1 ? 'answer' : 'answers'}`
                }
              >
                {b.widget.type === 'voice' ? (
                  <ul className="space-y-2">
                    {b.textAnswers.length === 0 && <li className="text-[14px] text-muted">No voice responses.</li>}
                    {b.textAnswers.map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3.5 py-2.5">
                        <audio src={t.value} controls className="h-9 w-full min-w-0 max-w-[320px]" />
                        <span className="inline-flex flex-none items-center gap-1 rounded-full bg-black/[0.06] px-2 py-0.5 text-[13px] text-muted">
                          <CaretUp size={11} weight="bold" aria-hidden="true" />
                          {t.upvotes}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : b.widget.type === 'text' ? (
                  <ul className="space-y-2">
                    {b.textAnswers.length === 0 && <li className="text-[14px] text-muted">No text responses.</li>}
                    {b.textAnswers.map((t) => (
                      <li key={t.id} className="flex items-start justify-between gap-3 rounded-xl border border-line px-3.5 py-2.5 text-sm leading-relaxed">
                        <span>{t.value}</span>
                        <span className="inline-flex flex-none items-center gap-1 rounded-full bg-black/[0.06] px-2 py-0.5 text-[13px] text-muted">
                          <CaretUp size={11} weight="bold" aria-hidden="true" />
                          {t.upvotes}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : b.widget.type === 'rating' ? (
                  // Ratings are an ordered scale, so the shape of the answer is
                  // the answer — columns show that at a glance where a stack of
                  // rows shows only lengths.
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
              )
            })}

            {/* Who responded — editors only, and last: it's the detail behind
                the charts, not the headline. A dozen rows of names above the
                vote buried the answer the page exists to give. */}
            {isEditor && voters && voters.length > 0 && <Respondents full={full} voters={voters} />}
          </div>
        )}
      </main>
    </>
  )
}

/**
 * Who responded, and what each of them picked. Only rendered for the form's
 * creator and collaborators — and only populated for editors either way, since
 * the RPC behind it applies the same access check server-side.
 *
 * A column per Get Vote page rather than one merged "picks" cell: a form with
 * two comparisons is exactly when you want to see whether someone who chose A
 * on the first also chose A on the second, and merging them loses that.
 */
function Respondents({ full, voters }: { full: FullForm; voters: FormVoter[] }) {
  const votePages = full.pages.filter((p) => p.type === 'feedback')
  const optionName = (page: Page, id: string) =>
    id === 'tie'
      ? neutralChoiceLabel(full.options.filter((option) => option.page_id === page.id).length)
      : full.options.find((option) => option.id === id)?.name || '—'

  return (
    <section className="rounded-[26px] border border-line bg-card p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="font-sans text-sm font-semibold">
          Respondents <span className="ml-1 font-normal text-muted tabular-nums">{voters.length}</span>
        </h2>
        {/* Said plainly: this is the one part of the page that names people. */}
        <p className="text-[13px] text-muted">Only form editors can see respondent details.</p>
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
                    {v.choices[p.id] ? optionName(p, v.choices[p.id]) : <span className="text-muted">—</span>}
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

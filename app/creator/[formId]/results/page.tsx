'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import type { FullForm, FormResults } from '@/lib/types'
import { getFullForm, getResults } from '@/lib/store'
import { WIDGET_META } from '@/lib/builder'
import { timeAgo } from '@/lib/format'
import CreatorHeader from '@/components/CreatorHeader'
import StatusBadge from '@/components/StatusBadge'

export default function ResultsPage() {
  const params = useParams<{ formId: string }>()
  const formId = params.formId
  const [full, setFull] = useState<FullForm | null>(null)
  const [results, setResults] = useState<FormResults | null>(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    getFullForm(formId).then((f) => {
      if (!f) return setMissing(true)
      setFull(f)
      getResults(formId).then(setResults)
    })
  }, [formId])

  if (missing) {
    return (
      <>
        <CreatorHeader />
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
      <CreatorHeader />
      <main className="mx-auto w-full max-w-[820px] px-4 py-10 sm:px-6 sm:py-12">
        <Link href="/creator" className="text-[14px] font-medium text-muted transition hover:text-ink">
          ← Forms
        </Link>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">
              {full?.form.title || 'Untitled form'}
            </h1>
            {full && <p className="mt-1 text-[14px] text-muted">{full.form.testing_question}</p>}
          </div>
          {full && <StatusBadge status={full.form.status} />}
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

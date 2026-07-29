'use client'

// TEMPORARY (like /dev-seed): writes just the 'Cart & checkout refresh' form
// into the demo (localStorage) store, so the voter experience can be walked end
// to end without re-seeding everything else. /dev-seed includes this same form
// alongside the others — the data itself lives in ../checkout-data.

import { useEffect } from 'react'
import Link from 'next/link'
import type { Form, Option, Page, Response as VoteResponse, ResponseAnswer, Widget } from '@/lib/types'
import {
  F,
  SLUG,
  checkoutForm,
  checkoutPages,
  checkoutOptions,
  checkoutWidgets,
  checkoutResponses,
  checkoutAnswers,
} from '../checkout-data'

const DEMO_KEY = 'prism:v2'

interface DemoDB {
  forms: Form[]
  pages: Page[]
  options: Option[]
  widgets: Widget[]
  responses: VoteResponse[]
  answers: ResponseAnswer[]
}

export default function SeedCheckout() {
  useEffect(() => {
    const empty: DemoDB = { forms: [], pages: [], options: [], widgets: [], responses: [], answers: [] }
    let db: DemoDB
    try {
      db = { ...empty, ...JSON.parse(window.localStorage.getItem(DEMO_KEY) || '{}') }
    } catch {
      db = empty
    }

    // Idempotent, and scoped to this one form — /dev-seed's forms and anything
    // you built yourself are untouched.
    const others = <T extends { form_id: string }>(rows: T[]) => rows.filter((r) => r.form_id !== F)
    const keptResponses = others(db.responses)
    const keptRespIds = new Set(keptResponses.map((r) => r.id))

    const next: DemoDB = {
      forms: [...db.forms.filter((x) => x.id !== F), checkoutForm],
      pages: [...others(db.pages), ...checkoutPages],
      options: [...others(db.options), ...checkoutOptions],
      widgets: [...others(db.widgets), ...checkoutWidgets],
      responses: [...keptResponses, ...checkoutResponses],
      answers: [...db.answers.filter((a) => keptRespIds.has(a.response_id)), ...checkoutAnswers],
    }
    window.localStorage.setItem(DEMO_KEY, JSON.stringify(next))
    console.log(
      `[dev-seed/checkout] wrote 1 form · ${checkoutPages.length} pages · ${checkoutOptions.length} options · ${checkoutResponses.length} responses`,
    )
  }, [])

  return (
    <main className="mx-auto max-w-[640px] px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Cart &amp; checkout refresh</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted">
        Seeded into this browser’s demo store: {checkoutPages.length} screens ({checkoutWidgets.length}{' '}
        feedback pages, 2 context pages), {checkoutOptions.length} options and{' '}
        {checkoutResponses.length} responses. Re-running replaces only this form.
      </p>
      <ul className="mt-6 space-y-2 text-[15px]">
        <li>
          <Link href="/creator" className="underline">
            → Creator dashboard (list &amp; card)
          </Link>
        </li>
        <li>
          <Link href={`/f/${SLUG}`} className="underline">
            → Voter experience
          </Link>
        </li>
        <li>
          <Link href={`/creator/${F}/edit`} className="underline">
            → Builder — hit Preview in the top bar
          </Link>
        </li>
        <li>
          <Link href={`/creator/${F}/results`} className="underline">
            → Results
          </Link>
        </li>
      </ul>
    </main>
  )
}

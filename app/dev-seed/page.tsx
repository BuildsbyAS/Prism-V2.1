'use client'

// TEMPORARY: seeds the demo (localStorage) store with a few forms in different
// states so the dashboard, builder and voter screens have something to show.
// Delete this route once it has been run — the data persists in the browser.

import { useEffect } from 'react'
import Link from 'next/link'
import type {
  Form,
  Option,
  Page,
  PageType,
  Response as VoteResponse,
  ResponseAnswer,
  Widget,
  WidgetConfig,
  WidgetType,
} from '@/lib/types'

import {
  F as F5,
  SLUG as SLUG5,
  checkoutForm,
  checkoutPages,
  checkoutOptions,
  checkoutWidgets,
  checkoutResponses,
  checkoutAnswers,
} from './checkout-data'

const DEMO_KEY = 'prism:v2'
const CREATOR = 'demo-creator'

const day = 86400000
const now = Date.now()
const ago = (d: number) => new Date(now - d * day).toISOString()

/** Inline SVG so the seed needs no network and each image has an exact ratio. */
function svg(w: number, h: number, from: string, to: string, label: string): string {
  const unit = Math.min(w, h)
  const s = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>
<rect width="${w}" height="${h}" fill="url(#g)"/>
<text x="50%" y="47%" text-anchor="middle" font-family="system-ui,sans-serif" font-size="${Math.round(unit * 0.085)}" font-weight="600" fill="rgba(255,255,255,0.95)">${label}</text>
<text x="50%" y="47%" dy="${Math.round(unit * 0.11)}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="${Math.round(unit * 0.05)}" fill="rgba(255,255,255,0.65)">${w} × ${h}</text>
</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(s)}`
}

const HERO_PORTRAIT = svg(900, 1600, '#667eea', '#764ba2', 'Portrait hero')
const HERO_WIDE = svg(2400, 900, '#2193b0', '#6dd5ed', 'Ultra-wide hero')
const HERO_SQUARE = svg(1200, 1200, '#fa709a', '#fee140', 'Square hero')

const optImg = (letter: string, from: string, to: string) =>
  svg(1200, 900, from, to, `Option ${letter}`)

/** Typed against `Form` so the compiler catches any field the store expects. */
function form(over: Partial<Form> & Pick<Form, 'id' | 'slug' | 'created_at'>): Form {
  return {
    creator_id: CREATOR,
    results_token: `${over.id}-token`,
    name: '',
    title: '',
    body_copy: '',
    testing_question: '',
    usps_metrics: '',
    project_brief: '',
    hero_image_url: '',
    hero_bg: 'none',
    hero_dither: true,
    thank_you_message: '',
    mode: 'simple',
    status: 'draft',
    pod: '',
    collaborators: [],
    expires_at: null,
    show_results_to_voters: true,
    require_voter_login: false,
    show_time_estimate: false,
    estimated_minutes: 1,
    google_sheet_id: null,
    published_at: null,
    // Null = results never opened, so every response reads as new.
    responses_seen_at: null,
    ...over,
  }
}

function page(id: string, formId: string, type: PageType, order: number, title: string, body = ''): Page {
  return { id, form_id: formId, type, order_index: order, title, body }
}

function option(
  id: string,
  formId: string,
  pageId: string,
  order: number,
  name: string,
  description: string,
  embedUrl: string,
  isStatic = false,
): Option {
  return {
    id,
    form_id: formId,
    page_id: pageId,
    name,
    description,
    order_index: order,
    embed_type: 'image',
    embed_url: embedUrl,
    alt_text: name,
    is_decorative: false,
    brightness: 0,
    is_static: isStatic,
  }
}

function widget(id: string, formId: string, pageId: string, type: WidgetType, config: WidgetConfig, order = 0): Widget {
  return { id, form_id: formId, page_id: pageId, type, config, order_index: order, is_followup: false, branch_condition: null }
}

/* ----------------------------- 1 · draft ---------------------------------- */
// Half-built: no subtitle and no end screen, so the publish gate is still shut.
const F1 = 'seed-draft-checkout'
const f1 = form({
  id: F1,
  slug: 'checkout-button-placement-4k2p',
  title: 'Checkout button placement',
  testing_question: 'Which placement gets more confident taps?',
  status: 'draft',
  created_at: ago(2),
})
const f1p = [page(`${F1}-p1`, F1, 'feedback', 0, 'Which checkout layout feels faster?')]
const f1o = [
  option(`${F1}-oa`, F1, `${F1}-p1`, 0, 'Sticky footer', 'Button pinned to the bottom of the viewport', optImg('A', '#11998e', '#38ef7d')),
  option(`${F1}-ob`, F1, `${F1}-p1`, 1, 'Inline below summary', 'Button sits after the order summary', optImg('B', '#f6d365', '#fda085')),
]

/* --------------------- 2 · open · portrait hero --------------------------- */
const F2 = 'seed-open-onboarding'
const f2 = form({
  id: F2,
  slug: 'onboarding-illustration-7h3m',
  title: 'Onboarding illustration direction',
  body_copy: 'Two directions for the first-run screens. Pick the one that feels more like us, then tell us how strongly you feel about it.',
  testing_question: 'Which illustration direction reads as more trustworthy?',
  hero_image_url: HERO_PORTRAIT,
  hero_bg: 'g-violet',
  thank_you_message: 'Thanks — this settles a long argument.',
  status: 'open',
  show_time_estimate: true,
  estimated_minutes: 2,
  created_at: ago(7),
  published_at: ago(6),
})
const f2p = [page(`${F2}-p1`, F2, 'feedback', 0, 'Which direction feels more like us?', 'Same screen, two illustration styles.')]
const f2o = [
  option(`${F2}-oa`, F2, `${F2}-p1`, 0, 'Soft geometric', 'Flat shapes, muted palette', optImg('A', '#89f7fe', '#66a6ff')),
  option(`${F2}-ob`, F2, `${F2}-p1`, 1, 'Hand-drawn', 'Loose linework, warm palette', optImg('B', '#ff9a9e', '#fad0c4')),
]
const f2w = [widget(`${F2}-w1`, F2, `${F2}-p1`, 'rating', { label: 'How strongly do you feel about your pick?', allowHalf: false, required: false })]

/* ----------------------- 3 · open · wide hero ----------------------------- */
const F3 = 'seed-open-homepage'
const f3 = form({
  id: F3,
  slug: 'homepage-hero-copy-9x4t',
  title: 'Homepage hero copy',
  body_copy: 'A bit of context first, then three headline options. There is no wrong answer — go with your gut.',
  testing_question: 'Which headline explains the product fastest?',
  project_brief: 'Q3 homepage refresh. The hero has to land the value prop in under three seconds.',
  hero_image_url: HERO_WIDE,
  hero_bg: 's-ink',
  thank_you_message: 'Appreciated — results go to the team on Friday.',
  mode: 'canvas',
  status: 'open',
  show_time_estimate: true,
  estimated_minutes: 3,
  created_at: ago(12),
  published_at: ago(11),
  // Results opened 6 days ago, so only the responses after that read as new.
  responses_seen_at: ago(6),
})
const f3p = [
  page(`${F3}-p1`, F3, 'static', 0, 'Where this shows up', 'These headlines sit above the fold on the marketing homepage, directly under the nav.'),
  page(`${F3}-p2`, F3, 'feedback', 1, 'Which headline explains it fastest?', 'Read each one once, then pick.'),
]
const f3o = [
  option(`${F3}-p1-o`, F3, `${F3}-p1`, 0, 'Current homepage', 'What ships today', optImg('Today', '#232526', '#414345'), true),
  option(`${F3}-oa`, F3, `${F3}-p2`, 0, 'Ship faster, together', 'Verb-first, team framing', optImg('A', '#667eea', '#764ba2')),
  option(`${F3}-ob`, F3, `${F3}-p2`, 1, 'Your work, in one place', 'Outcome-first', optImg('B', '#c471f5', '#fa71cd')),
  option(`${F3}-oc`, F3, `${F3}-p2`, 2, 'The fastest way to decide', 'Speed-first', optImg('C', '#fa709a', '#fee140')),
]
const f3w = [widget(`${F3}-w1`, F3, `${F3}-p2`, 'text', { label: 'What made you pick that one?', long: true, placeholder: 'A sentence is plenty…', required: false })]

/* --------------------- 4 · closed · square hero --------------------------- */
const F4 = 'seed-closed-pricing'
const f4 = form({
  id: F4,
  slug: 'pricing-page-layout-2v8w',
  title: 'Pricing page layout',
  body_copy: 'Two ways to lay out the three tiers. Tell us which one makes the middle plan the obvious choice.',
  testing_question: 'Which layout makes the middle tier the obvious pick?',
  hero_image_url: HERO_SQUARE,
  hero_bg: 'none',
  thank_you_message: 'Thanks for voting — this one is now closed.',
  status: 'closed',
  created_at: ago(30),
  published_at: ago(28),
  // Opened after the last vote landed — fully read, so it stays out of Updates.
  responses_seen_at: ago(20),
})
const f4p = [page(`${F4}-p1`, F4, 'feedback', 0, 'Which pricing layout is clearer?')]
const f4o = [
  option(`${F4}-oa`, F4, `${F4}-p1`, 0, 'Three columns', 'Tiers side by side, middle one raised', optImg('A', '#2193b0', '#6dd5ed')),
  option(`${F4}-ob`, F4, `${F4}-p1`, 1, 'Stacked cards', 'One tier per row with a comparison table', optImg('B', '#eef2f7', '#c9d6e4')),
]
const f4w = [widget(`${F4}-w1`, F4, `${F4}-p1`, 'slider', { label: 'How confident are you in that pick?', min: 0, max: 100, minLabel: 'Not confident', maxLabel: 'Very confident', required: false })]

/* ------------- 6 & 7 · other people's forms · Team tab --------------- */
// Authored by teammates rather than the demo creator, so the dashboard's
// Team tab has forms that aren't yours — one still collecting, one closed.
// A creator id doubles as their address in demo mode (see demoCreatorEmail), so
// these read as "Sara K" and "Dan Ito".
const F6 = 'seed-community-search'
const f6 = form({
  id: F6,
  creator_id: 'sara.k',
  slug: 'search-empty-state-8b6r',
  title: 'Search empty state',
  body_copy: 'What we show when a search returns nothing. Pick the one that would keep you looking.',
  testing_question: 'Which empty state makes you try another search?',
  hero_image_url: HERO_WIDE,
  hero_bg: 'g-violet',
  thank_you_message: 'Thanks! Results go into Thursday’s review.',
  status: 'open',
  show_time_estimate: true,
  estimated_minutes: 1,
  created_at: ago(9),
  published_at: ago(8),
})
const f6p = [page(`${F6}-p1`, F6, 'feedback', 0, 'Which empty state keeps you searching?')]
const f6o = [
  option(`${F6}-oa`, F6, `${F6}-p1`, 0, 'Suggestions', 'Three related searches under the message', optImg('A', '#4facfe', '#00f2fe')),
  option(`${F6}-ob`, F6, `${F6}-p1`, 1, 'Spelling first', 'A "did you mean" line above everything else', optImg('B', '#43e97b', '#38f9d7')),
]
const f6w = [widget(`${F6}-w1`, F6, `${F6}-p1`, 'text', { label: 'What would you have done next?', long: false, placeholder: 'One line is plenty…', required: false })]

const F7 = 'seed-community-nav'
const f7 = form({
  id: F7,
  creator_id: 'dan.ito',
  slug: 'mobile-nav-labels-3k9d',
  title: 'Mobile nav labels',
  body_copy: 'Five tabs, two vocabularies. We shipped the winner last sprint.',
  testing_question: 'Which set of tab labels is easier to scan?',
  hero_image_url: HERO_SQUARE,
  hero_bg: 'none',
  thank_you_message: 'Closed — thanks to everyone who voted.',
  status: 'closed',
  created_at: ago(41),
  published_at: ago(40),
})
const f7p = [page(`${F7}-p1`, F7, 'feedback', 0, 'Which tab labels read faster?')]
const f7o = [
  option(`${F7}-oa`, F7, `${F7}-p1`, 0, 'Nouns', 'Home · Orders · Search · Saved · You', optImg('A', '#30cfd0', '#330867')),
  option(`${F7}-ob`, F7, `${F7}-p1`, 1, 'Verbs', 'Browse · Track · Find · Keep · Manage', optImg('B', '#f6d365', '#fda085')),
]

/* ------------------------------ responses --------------------------------- */
// Deterministic spreads so the results pages have a believable shape.
const NOTES = [
  'Shortest one, and it says what the product does.',
  'B reads like something a person would say out loud.',
  'A felt generic — I have seen it on ten other sites.',
  'C is punchy but I did not know what "decide" referred to.',
  'Picked B because "in one place" matches my actual problem.',
  'A is fine but forgettable. B stuck with me.',
  'C would work with a subheading doing more of the lifting.',
  'B. The others sound like a tagline, not a description.',
]

const responses: VoteResponse[] = []
const answers: ResponseAnswer[] = []

function addResponses(
  formId: string,
  spread: { pageId: string; picks: string[] }[],
  count: number,
  daysAgoStart: number,
  answerFor?: (i: number) => { widgetId: string; value: number | string; upvotes?: number } | null,
) {
  for (let i = 0; i < count; i++) {
    const id = `${formId}-r${i + 1}`
    const choices: Record<string, string> = {}
    for (const s of spread) choices[s.pageId] = s.picks[i % s.picks.length]
    responses.push({
      id,
      form_id: formId,
      voter_session_id: `seed-voter-${i + 1}`,
      submitted_at: ago(Math.max(0.1, daysAgoStart - i * 0.4)),
      choices,
    })
    const a = answerFor?.(i)
    if (a) answers.push({ id: `${id}-a`, response_id: id, widget_id: a.widgetId, value: a.value, upvotes: a.upvotes ?? 0 })
  }
}

// F2 — 7 votes leaning to A, ratings 3–5.
addResponses(F2, [{ pageId: `${F2}-p1`, picks: [`${F2}-oa`, `${F2}-oa`, `${F2}-ob`, `${F2}-oa`, `${F2}-oa`, `${F2}-ob`, `${F2}-oa`] }], 7, 5, (i) => ({
  widgetId: `${F2}-w1`,
  value: [5, 4, 3, 5, 4, 4, 5][i],
}))

// F3 — 14 votes, B ahead, with written notes (a couple upvoted).
addResponses(
  F3,
  [{ pageId: `${F3}-p2`, picks: [`${F3}-ob`, `${F3}-oa`, `${F3}-ob`, `${F3}-oc`, `${F3}-ob`, `${F3}-ob`, `${F3}-oa`] }],
  14,
  9,
  (i) => ({ widgetId: `${F3}-w1`, value: NOTES[i % NOTES.length], upvotes: [3, 0, 1, 0, 6, 0, 0, 2][i % 8] }),
)

// F4 — 9 votes, near-tie with one explicit tie, slider spread.
addResponses(
  F4,
  [{ pageId: `${F4}-p1`, picks: [`${F4}-oa`, `${F4}-ob`, `${F4}-oa`, `${F4}-ob`, `${F4}-oa`, 'tie', `${F4}-ob`, `${F4}-oa`, `${F4}-ob`] }],
  9,
  27,
  (i) => ({ widgetId: `${F4}-w1`, value: [80, 65, 90, 40, 75, 50, 60, 85, 55][i] }),
)

// F6 — a teammate's open form, 11 votes leaning to A, half with a note.
addResponses(F6, [{ pageId: `${F6}-p1`, picks: [`${F6}-oa`, `${F6}-oa`, `${F6}-ob`, `${F6}-oa`, `${F6}-ob`] }], 11, 7, (i) =>
  i % 2 === 0 ? { widgetId: `${F6}-w1`, value: NOTES[i % NOTES.length], upvotes: [2, 0, 4, 0, 1, 0][i % 6] } : null,
)

// F7 — a teammate's closed form, 23 votes, verbs won clearly.
addResponses(F7, [{ pageId: `${F7}-p1`, picks: [`${F7}-ob`, `${F7}-ob`, `${F7}-oa`, `${F7}-ob`, `${F7}-ob`, `${F7}-oa`] }], 23, 38)

/** Mirrors the private DemoDB shape in lib/store.ts. */
interface DemoDB {
  forms: Form[]
  pages: Page[]
  options: Option[]
  widgets: Widget[]
  responses: VoteResponse[]
  answers: ResponseAnswer[]
}

// The fifth form — a full multi-screen flow with context pages — lives in
// ./checkout-data so /dev-seed/checkout can seed it on its own too.
const SEED: DemoDB = {
  forms: [f1, f2, f3, f4, checkoutForm, f6, f7],
  pages: [...f1p, ...f2p, ...f3p, ...f4p, ...checkoutPages, ...f6p, ...f7p],
  options: [...f1o, ...f2o, ...f3o, ...f4o, ...checkoutOptions, ...f6o, ...f7o],
  widgets: [...f2w, ...f3w, ...f4w, ...checkoutWidgets, ...f6w],
  responses: [...responses, ...checkoutResponses],
  answers: [...answers, ...checkoutAnswers],
}
const SEED_IDS = new Set([F1, F2, F3, F4, F5, F6, F7])

export default function DevSeed() {
  useEffect(() => {
    const empty: DemoDB = { forms: [], pages: [], options: [], widgets: [], responses: [], answers: [] }
    let db: DemoDB
    try {
      db = { ...empty, ...JSON.parse(window.localStorage.getItem(DEMO_KEY) || '{}') }
    } catch {
      db = empty
    }

    // Idempotent: drop any previous run of this seed, keep the creator's own forms.
    const mine = <T extends { form_id: string }>(rows: T[]) => rows.filter((r) => !SEED_IDS.has(r.form_id))
    const keptForms = db.forms.filter((f) => !SEED_IDS.has(f.id))
    const keptResponses = mine(db.responses)
    const keptRespIds = new Set(keptResponses.map((r) => r.id))

    const next: DemoDB = {
      forms: [...keptForms, ...SEED.forms],
      pages: [...mine(db.pages), ...SEED.pages],
      options: [...mine(db.options), ...SEED.options],
      widgets: [...mine(db.widgets), ...SEED.widgets],
      responses: [...keptResponses, ...SEED.responses],
      // response_answers have no form_id — keep them via their surviving response.
      answers: [...db.answers.filter((a) => keptRespIds.has(a.response_id)), ...SEED.answers],
    }

    window.localStorage.setItem(DEMO_KEY, JSON.stringify(next))
    // Writing to localStorage is the whole point of this effect; the summary is
    // logged rather than held in state so the effect stays a pure external write.
    console.log(
      `[dev-seed] wrote ${SEED.forms.length} forms / ${SEED.responses.length} responses; ` +
        `kept ${keptForms.length} pre-existing form(s).`,
    )
  }, [])

  return (
    <main className="mx-auto max-w-[640px] px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Demo seed</h1>
      <p className="mt-3 text-[15px] text-muted">
        Wrote {SEED.forms.length} forms and {SEED.responses.length} responses to this browser’s demo
        store. Re-running replaces only these {SEED.forms.length}; anything you made yourself is kept.
      </p>
      <ul className="mt-6 space-y-2 text-[15px]">
        <li><Link href="/creator" className="underline">→ Creator dashboard</Link></li>
        <li><Link href={`/f/${SLUG5}`} className="underline">→ Voter · cart &amp; checkout (6 screens, 4 questions)</Link></li>
        <li><Link href={`/creator/${F2}/edit`} className="underline">→ Builder · portrait hero on violet</Link></li>
        <li><Link href={`/creator/${F3}/edit`} className="underline">→ Builder · ultra-wide hero on ink</Link></li>
        <li><Link href={`/creator/${F4}/edit`} className="underline">→ Builder · square hero, no backdrop</Link></li>
        <li><Link href="/f/onboarding-illustration-7h3m" className="underline">→ Voter · portrait hero</Link></li>
        <li><Link href="/f/homepage-hero-copy-9x4t" className="underline">→ Voter · ultra-wide hero</Link></li>
        <li><Link href="/f/pricing-page-layout-2v8w" className="underline">→ Voter · square hero</Link></li>
        <li><Link href="/f/search-empty-state-8b6r" className="underline">→ Voter · a teammate’s open form (Team tab)</Link></li>
      </ul>
    </main>
  )
}

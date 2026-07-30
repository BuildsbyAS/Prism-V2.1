'use client'

// TEMPORARY: replaces the demo (localStorage) store with a fixed data set so the
// dashboard, builder and voter screens all have something to show. The counts
// are the point of this route — 6 forms owned by the demo creator (2 draft,
// 3 open, 1 closed) and 8 owned by teammates (open/closed only), which is what
// makes the dashboard read 6 under "Forms" and 12 under "Team".
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
// Expiries live on the other side of `now` for anything still collecting, so a
// negative day count is the honest way to express them.
const ahead = (d: number) => ago(-d)

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

// Three shared heroes rather than one per form: the store lives in a single
// localStorage key with a ~5MB budget, and repeating a string costs far less
// than minting fourteen of them.
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
    viewers: [],
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
  return { id, form_id: formId, type, order_index: order, title, body, show_neutral_option: true }
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

/* ========================= the demo creator's six ========================= */
// 2 draft + 3 open + 1 closed. The drafts deliberately fail the publish gate so
// the builder has something to complain about; the published four carry a pod
// and an expiry because that is what the publish dialog collects.

/* ------------------------------ 1 · draft --------------------------------- */
// Half-built: no body copy and no end screen, so the publish gate is still shut.
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

/* ------------------------------ 2 · draft --------------------------------- */
// Further along than F1 — it has a name and a hero — but still no pod or expiry,
// which is the other half of what publish asks for.
const F6 = 'seed-draft-notifications'
const f6 = form({
  id: F6,
  slug: 'notification-grouping-6q1v',
  name: 'Notification grouping (WIP)',
  title: 'How should we group notifications?',
  body_copy: 'Rough cut — two ways to stack the notification centre. Not ready to send round yet.',
  testing_question: 'Which grouping makes the important one easiest to find?',
  hero_image_url: HERO_SQUARE,
  hero_bg: 's-lilac',
  status: 'draft',
  created_at: ago(1),
})
const f6p = [
  page(`${F6}-p1`, F6, 'feedback', 0, 'Which grouping surfaces the urgent one?', 'Same twelve notifications, two orders.'),
]
const f6o = [
  option(`${F6}-oa`, F6, `${F6}-p1`, 0, 'By time', 'Newest first, flat list', optImg('A', '#8e9eab', '#eef2f3')),
  option(`${F6}-ob`, F6, `${F6}-p1`, 1, 'By order', 'One card per order, collapsed', optImg('B', '#f7971e', '#ffd200')),
]
const f6w = [widget(`${F6}-w1`, F6, `${F6}-p1`, 'text', { label: 'Anything confusing about your pick?', long: true, placeholder: 'Optional…', required: false })]

/* --------------------- 3 · open · portrait hero --------------------------- */
const F2 = 'seed-open-onboarding'
const f2 = form({
  id: F2,
  pod: 'Storefront',
  collaborators: ['sara.k@noon.com', 'dan.ito@noon.com'],
  slug: 'onboarding-illustration-7h3m',
  name: 'Onboarding art direction',
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
  expires_at: ahead(8),
})
const f2p = [page(`${F2}-p1`, F2, 'feedback', 0, 'Which direction feels more like us?', 'Same screen, two illustration styles.')]
const f2o = [
  option(`${F2}-oa`, F2, `${F2}-p1`, 0, 'Soft geometric', 'Flat shapes, muted palette', optImg('A', '#89f7fe', '#66a6ff')),
  option(`${F2}-ob`, F2, `${F2}-p1`, 1, 'Hand-drawn', 'Loose linework, warm palette', optImg('B', '#ff9a9e', '#fad0c4')),
]
const f2w = [widget(`${F2}-w1`, F2, `${F2}-p1`, 'rating', { label: 'How strongly do you feel about your pick?', allowHalf: false, required: false })]

/* ----------------------- 4 · open · wide hero ----------------------------- */
const F3 = 'seed-open-homepage'
const f3 = form({
  id: F3,
  pod: 'Growth',
  collaborators: ['sara.k@noon.com', 'dan.ito@noon.com', 'priya.n@noon.com', 'omar.f@noon.com'],
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
  expires_at: ahead(3),
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

/* ------------------- 5 · open · the multi-screen flow --------------------- */
// The checkout form lives in ./checkout-data so /dev-seed/checkout can seed it
// alone. It predates pods and expiries, so they're layered on here rather than
// in that file — it is one of the demo creator's three open forms and should
// look as published as the rest.
const f5: Form = { ...checkoutForm, pod: 'O2D', expires_at: ahead(5), name: 'Cart & checkout refresh' }

/* --------------------- 6 · closed · square hero --------------------------- */
const F4 = 'seed-closed-pricing'
const f4 = form({
  id: F4,
  pod: 'Loyalty',
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
  expires_at: ago(18),
  // Opened after the last vote landed — fully read, so it stays out of Updates.
  responses_seen_at: ago(20),
})
const f4p = [page(`${F4}-p1`, F4, 'feedback', 0, 'Which pricing layout is clearer?')]
const f4o = [
  option(`${F4}-oa`, F4, `${F4}-p1`, 0, 'Three columns', 'Tiers side by side, middle one raised', optImg('A', '#2193b0', '#6dd5ed')),
  option(`${F4}-ob`, F4, `${F4}-p1`, 1, 'Stacked cards', 'One tier per row with a comparison table', optImg('B', '#eef2f7', '#c9d6e4')),
]
const f4w = [widget(`${F4}-w1`, F4, `${F4}-p1`, 'slider', { label: 'How confident are you in that pick?', min: 0, max: 100, minLabel: 'Not confident', maxLabel: 'Very confident', required: false })]

/* ======================== teammates' eight forms ========================= */
// Authored by other people, so the dashboard's Team tab has forms that aren't
// yours. None of them is a draft: the Team feed only ever shows open + closed,
// and a draft here would be invisible dead weight in the store.
// A creator id doubles as their address in demo mode (see demoCreatorEmail), so
// these read as "Sara K", "Dan Ito", "Mei Wong" and so on. Pods are spread
// across POD_OPTIONS so the Team tab's pod filter has more than one bucket.

const T1 = 'seed-team-search'
const t1 = form({
  id: T1,
  creator_id: 'sara.k',
  pod: 'Storefront',
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
  expires_at: ahead(4),
})
const t1p = [page(`${T1}-p1`, T1, 'feedback', 0, 'Which empty state keeps you searching?')]
const t1o = [
  option(`${T1}-oa`, T1, `${T1}-p1`, 0, 'Suggestions', 'Three related searches under the message', optImg('A', '#4facfe', '#00f2fe')),
  option(`${T1}-ob`, T1, `${T1}-p1`, 1, 'Spelling first', 'A "did you mean" line above everything else', optImg('B', '#43e97b', '#38f9d7')),
]
const t1w = [widget(`${T1}-w1`, T1, `${T1}-p1`, 'text', { label: 'What would you have done next?', long: false, placeholder: 'One line is plenty…', required: false })]

const T2 = 'seed-team-nav'
const t2 = form({
  id: T2,
  creator_id: 'dan.ito',
  pod: 'Customer',
  slug: 'mobile-nav-labels-3k9d',
  name: 'Mobile nav labels (shipped)',
  title: 'Mobile nav labels',
  body_copy: 'Five tabs, two vocabularies. We shipped the winner last sprint.',
  testing_question: 'Which set of tab labels is easier to scan?',
  hero_image_url: HERO_SQUARE,
  hero_bg: 'none',
  thank_you_message: 'Closed — thanks to everyone who voted.',
  status: 'closed',
  created_at: ago(41),
  published_at: ago(40),
  expires_at: ago(31),
})
const t2p = [page(`${T2}-p1`, T2, 'feedback', 0, 'Which tab labels read faster?')]
const t2o = [
  option(`${T2}-oa`, T2, `${T2}-p1`, 0, 'Nouns', 'Home · Orders · Search · Saved · You', optImg('A', '#30cfd0', '#330867')),
  option(`${T2}-ob`, T2, `${T2}-p1`, 1, 'Verbs', 'Browse · Track · Find · Keep · Manage', optImg('B', '#f6d365', '#fda085')),
]

const T3 = 'seed-team-tracking'
const t3 = form({
  id: T3,
  creator_id: 'mei.wong',
  pod: 'O2D',
  collaborators: ['raj.patel@noon.com'],
  slug: 'order-tracking-timeline-5t2n',
  title: 'Order tracking timeline',
  body_copy: 'Where your parcel is, three ways. We care most about the moment between "dispatched" and "out for delivery".',
  testing_question: 'Which tracking view tells you when it will arrive?',
  hero_image_url: HERO_WIDE,
  hero_bg: 'g-ocean',
  thank_you_message: 'Thank you — this feeds into the November release.',
  status: 'open',
  show_time_estimate: true,
  estimated_minutes: 2,
  created_at: ago(6),
  published_at: ago(5),
  expires_at: ahead(9),
})
const t3p = [
  page(`${T3}-p1`, T3, 'feedback', 0, 'Which tracking view answers "when?" fastest?', 'Same order, mid-delivery, three treatments.'),
]
const t3o = [
  option(`${T3}-oa`, T3, `${T3}-p1`, 0, 'Vertical timeline', 'Every scan event, newest at the top', optImg('A', '#00c6ff', '#0072ff')),
  option(`${T3}-ob`, T3, `${T3}-p1`, 1, 'Progress bar', 'Four stages with an ETA under it', optImg('B', '#f093fb', '#f5576c')),
  option(`${T3}-oc`, T3, `${T3}-p1`, 2, 'Map first', 'Live map, events collapsed below', optImg('C', '#5ee7df', '#b490ca')),
]
const t3w = [widget(`${T3}-w1`, T3, `${T3}-p1`, 'rating', { label: 'How clear was the arrival time?', allowHalf: true, required: false })]

const T4 = 'seed-team-tiers'
const t4 = form({
  id: T4,
  creator_id: 'raj.patel',
  pod: 'Loyalty',
  slug: 'loyalty-tier-badges-1c7y',
  title: 'Loyalty tier badges',
  body_copy: 'Silver, gold, platinum — but drawn how? Short one, two options only.',
  testing_question: 'Which badge set makes the next tier feel worth chasing?',
  hero_image_url: HERO_SQUARE,
  hero_bg: 'g-sand',
  thank_you_message: 'Closed. Gold won, if you were wondering.',
  status: 'closed',
  created_at: ago(52),
  published_at: ago(50),
  expires_at: ago(43),
})
const t4p = [page(`${T4}-p1`, T4, 'feedback', 0, 'Which badges make you want the next tier?')]
const t4o = [
  option(`${T4}-oa`, T4, `${T4}-p1`, 0, 'Metallic', 'Embossed discs with a sheen', optImg('A', '#bdc3c7', '#2c3e50')),
  option(`${T4}-ob`, T4, `${T4}-p1`, 1, 'Flat shields', 'Two-colour shields, no gradient', optImg('B', '#ffe259', '#ffa751')),
]

const T5 = 'seed-team-seller'
const t5 = form({
  id: T5,
  creator_id: 'tom.hayes',
  pod: 'Sales',
  slug: 'seller-onboarding-checklist-9p4l',
  name: 'Seller onboarding checklist',
  title: 'Getting a new seller to their first listing',
  body_copy: 'Seven steps between signing up and a live listing. The question is whether to show them all at once or one at a time.',
  testing_question: 'Which checklist gets you to step one fastest?',
  project_brief: 'Sellers stall at step three (bank details). We want to know whether the shape of the list is part of that.',
  hero_image_url: HERO_PORTRAIT,
  hero_bg: 'g-mint',
  thank_you_message: 'Thanks — genuinely useful.',
  status: 'open',
  show_time_estimate: true,
  estimated_minutes: 2,
  created_at: ago(15),
  published_at: ago(14),
  expires_at: ahead(2),
})
const t5p = [
  page(`${T5}-p1`, T5, 'static', 0, 'The seven steps', 'Account, tax ID, bank details, first product, photos, pricing, review. Assume you are a small seller doing this on a phone.'),
  page(`${T5}-p2`, T5, 'feedback', 1, 'Which checklist would you actually finish?'),
]
const t5o = [
  option(`${T5}-p1-o`, T5, `${T5}-p1`, 0, 'Today’s flow', 'One long form, no progress shown', optImg('Today', '#485563', '#29323c'), true),
  option(`${T5}-oa`, T5, `${T5}-p2`, 0, 'All seven visible', 'Full list with ticks and a progress ring', optImg('A', '#11998e', '#38ef7d')),
  option(`${T5}-ob`, T5, `${T5}-p2`, 1, 'One at a time', 'Current step only, "3 of 7" in the header', optImg('B', '#fc5c7d', '#6a82fb')),
]
const t5w = [
  widget(`${T5}-w1`, T5, `${T5}-p2`, 'radio', {
    label: 'Where would you expect to stop and come back later?',
    choices: ['Tax ID', 'Bank details', 'Photos', 'I would finish in one go'],
    required: false,
  }),
]

const T6 = 'seed-team-reviews'
const t6 = form({
  id: T6,
  creator_id: 'ana.silva',
  pod: 'UGC',
  slug: 'review-photo-prompts-4d8s',
  title: 'Review photo prompts',
  body_copy: 'Asking for a photo with the review. Two prompts, one of which we suspect is nagging.',
  testing_question: 'Which prompt would actually make you add a photo?',
  hero_image_url: HERO_PORTRAIT,
  hero_bg: 'g-berry',
  thank_you_message: 'Closed — the softer one won by a mile.',
  status: 'closed',
  created_at: ago(24),
  published_at: ago(23),
  expires_at: ago(16),
  responses_seen_at: ago(14),
})
const t6p = [page(`${T6}-p1`, T6, 'feedback', 0, 'Which prompt gets a photo out of you?')]
const t6o = [
  option(`${T6}-oa`, T6, `${T6}-p1`, 0, 'Inline nudge', 'A small camera row inside the review box', optImg('A', '#ee9ca7', '#ffdde1')),
  option(`${T6}-ob`, T6, `${T6}-p1`, 1, 'After submit', 'Ask once the review is already saved', optImg('B', '#a8edea', '#fed6e3')),
]
const t6w = [widget(`${T6}-w1`, T6, `${T6}-p1`, 'text', { label: 'What would put you off adding one?', long: true, placeholder: 'Be blunt…', required: false })]

const T7 = 'seed-team-tiles'
const t7 = form({
  id: T7,
  creator_id: 'mei.wong',
  pod: 'Growth',
  slug: 'category-tile-density-2m5x',
  title: 'Category tile density',
  body_copy: 'How many categories fit on the home screen before it stops being scannable? Freshly published, so numbers are still thin.',
  testing_question: 'Which grid is easier to scan on a phone?',
  hero_image_url: HERO_SQUARE,
  hero_bg: 's-cool',
  thank_you_message: 'Thanks for the early read.',
  status: 'open',
  created_at: ago(2),
  published_at: ago(1),
  expires_at: ahead(12),
})
const t7p = [page(`${T7}-p1`, T7, 'feedback', 0, 'Which grid is easier to scan?', 'Same twelve categories either way.')]
const t7o = [
  option(`${T7}-oa`, T7, `${T7}-p1`, 0, 'Three across', 'Bigger tiles, more scrolling', optImg('A', '#c9d6ff', '#e2e2e2')),
  option(`${T7}-ob`, T7, `${T7}-p1`, 1, 'Four across', 'Everything above the fold', optImg('B', '#fddb92', '#d1fdff')),
]

const T8 = 'seed-team-refunds'
const t8 = form({
  id: T8,
  creator_id: 'sara.k',
  pod: 'AFS',
  collaborators: ['tom.hayes@noon.com'],
  slug: 'refund-status-messaging-7w3b',
  title: 'Refund status messaging',
  body_copy: 'The wording between "we got your return" and "the money is back". People write in during that gap, so we tried to close it with copy.',
  testing_question: 'Which wording stops you from contacting support?',
  hero_image_url: HERO_WIDE,
  hero_bg: 'g-slate',
  thank_you_message: 'Closed — thanks, this changed the copy.',
  status: 'closed',
  created_at: ago(36),
  published_at: ago(35),
  expires_at: ago(21),
  responses_seen_at: ago(19),
})
const t8p = [page(`${T8}-p1`, T8, 'feedback', 0, 'Which refund message would keep you calm?')]
const t8o = [
  option(`${T8}-oa`, T8, `${T8}-p1`, 0, 'Dated promise', '"Back in your account by 14 May"', optImg('A', '#355c7d', '#c06c84')),
  option(`${T8}-ob`, T8, `${T8}-p1`, 1, 'Stage by stage', '"Received · checking · refunding" with ticks', optImg('B', '#3a1c71', '#ffaf7b')),
]
const t8w = [widget(`${T8}-w1`, T8, `${T8}-p1`, 'slider', { label: 'How likely would you be to contact support anyway?', min: 0, max: 10, minLabel: 'Not at all', maxLabel: 'Definitely', required: false })]

/* ------------------------------ responses --------------------------------- */
// Deterministic spreads so the results pages have a believable shape — and an
// uneven one across forms, so the dashboard's response counts don't all look
// like the same number.
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

// Drafts get none — a form nobody can open cannot have been voted on.

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

// T1 — 11 votes leaning to A, half with a note.
addResponses(T1, [{ pageId: `${T1}-p1`, picks: [`${T1}-oa`, `${T1}-oa`, `${T1}-ob`, `${T1}-oa`, `${T1}-ob`] }], 11, 7, (i) =>
  i % 2 === 0 ? { widgetId: `${T1}-w1`, value: NOTES[i % NOTES.length], upvotes: [2, 0, 4, 0, 1, 0][i % 6] } : null,
)

// T2 — 23 votes, verbs won clearly.
addResponses(T2, [{ pageId: `${T2}-p1`, picks: [`${T2}-ob`, `${T2}-ob`, `${T2}-oa`, `${T2}-ob`, `${T2}-ob`, `${T2}-oa`] }], 23, 38)

// T3 — 16 votes across three options, half-star ratings.
addResponses(
  T3,
  [{ pageId: `${T3}-p1`, picks: [`${T3}-ob`, `${T3}-ob`, `${T3}-oc`, `${T3}-oa`, `${T3}-ob`, `${T3}-oc`, `${T3}-ob`, `${T3}-oa`] }],
  16,
  5,
  (i) => ({ widgetId: `${T3}-w1`, value: [4, 4.5, 3, 3.5, 5, 4, 2.5, 4.5][i % 8] }),
)

// T4 — the quiet one: 6 votes, flat split.
addResponses(T4, [{ pageId: `${T4}-p1`, picks: [`${T4}-oa`, `${T4}-ob`, `${T4}-ob`, `${T4}-oa`, `${T4}-ob`, `${T4}-oa`] }], 6, 48)

// T5 — the busy one: 28 votes, "one at a time" ahead, with a radio answer.
addResponses(
  T5,
  [{ pageId: `${T5}-p2`, picks: [`${T5}-ob`, `${T5}-ob`, `${T5}-oa`, `${T5}-ob`, `${T5}-ob`, `${T5}-ob`, `${T5}-oa`] }],
  28,
  13,
  (i) => ({ widgetId: `${T5}-w1`, value: ['Bank details', 'Bank details', 'Tax ID', 'Photos', 'I would finish in one go'][i % 5] }),
)

// T6 — 12 votes, "after submit" ahead, a third of them with a note.
addResponses(T6, [{ pageId: `${T6}-p1`, picks: [`${T6}-ob`, `${T6}-ob`, `${T6}-oa`, `${T6}-ob`] }], 12, 22, (i) =>
  i % 3 === 0 ? { widgetId: `${T6}-w1`, value: NOTES[(i + 2) % NOTES.length], upvotes: [0, 5, 1, 0][i % 4] } : null,
)

// T7 — published yesterday, so only 5 votes so far.
addResponses(T7, [{ pageId: `${T7}-p1`, picks: [`${T7}-ob`, `${T7}-oa`, `${T7}-ob`, `${T7}-ob`, `${T7}-oa`] }], 5, 1)

// T8 — 19 votes, the dated promise ahead, "would you still contact support" 0–10.
addResponses(
  T8,
  [{ pageId: `${T8}-p1`, picks: [`${T8}-oa`, `${T8}-oa`, `${T8}-ob`, `${T8}-oa`, `${T8}-ob`, `${T8}-oa`] }],
  19,
  33,
  (i) => ({ widgetId: `${T8}-w1`, value: [1, 3, 0, 7, 2, 5, 1, 8, 2, 4][i % 10] }),
)

/** Mirrors the private DemoDB shape in lib/store.ts. */
interface DemoDB {
  forms: Form[]
  pages: Page[]
  options: Option[]
  widgets: Widget[]
  responses: VoteResponse[]
  answers: ResponseAnswer[]
}

// 6 mine (f1, f6 draft · f2, f3, f5 open · f4 closed) + 8 theirs (t1…t8, all
// open or closed) = 14 rows. The Team feed drops the two drafts, so it lands on
// 4 + 8 = 12.
const SEED: DemoDB = {
  forms: [f1, f6, f2, f3, f5, f4, t1, t2, t3, t4, t5, t6, t7, t8],
  pages: [...f1p, ...f6p, ...f2p, ...f3p, ...checkoutPages, ...f4p, ...t1p, ...t2p, ...t3p, ...t4p, ...t5p, ...t6p, ...t7p, ...t8p],
  options: [...f1o, ...f6o, ...f2o, ...f3o, ...checkoutOptions, ...f4o, ...t1o, ...t2o, ...t3o, ...t4o, ...t5o, ...t6o, ...t7o, ...t8o],
  widgets: [...f6w, ...f2w, ...f3w, ...checkoutWidgets, ...f4w, ...t1w, ...t3w, ...t5w, ...t6w, ...t8w],
  responses: [...responses, ...checkoutResponses],
  answers: [...answers, ...checkoutAnswers],
}

const MINE = SEED.forms.filter((f) => f.creator_id === CREATOR).length
const TEAM = SEED.forms.filter((f) => f.status !== 'draft').length

export default function DevSeed() {
  useEffect(() => {
    // A clean replace, not a merge: the whole point of this route is an exact
    // data set, and anything left over from a previous run or from clicking
    // around the app would throw the counts off.
    let before = 0
    try {
      before = (JSON.parse(window.localStorage.getItem(DEMO_KEY) || '{}') as Partial<DemoDB>).forms?.length ?? 0
    } catch {
      before = 0
    }

    window.localStorage.setItem(DEMO_KEY, JSON.stringify(SEED))
    // Writing to localStorage is the whole point of this effect; the summary is
    // logged rather than held in state so the effect stays a pure external write.
    console.log(
      `[dev-seed] wiped ${before} form(s) and wrote ${SEED.forms.length} forms / ` +
        `${SEED.responses.length} responses — ${MINE} yours, ${TEAM} in the Team feed.`,
    )
  }, [])

  return (
    <main className="mx-auto max-w-[640px] px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Demo seed</h1>
      <p className="mt-3 text-[15px] text-muted">
        Replaced this browser’s demo store with {SEED.forms.length} forms and {SEED.responses.length}{' '}
        responses. Everything that was here before — including anything you made yourself — has been
        deleted. Your dashboard now shows {MINE} forms under <strong>Forms</strong> and {TEAM} under{' '}
        <strong>Team</strong>.
      </p>
      <ul className="mt-6 space-y-2 text-[15px]">
        <li><Link href="/creator" className="underline">→ Creator dashboard · {MINE} forms (2 draft, 3 open, 1 closed)</Link></li>
        <li><Link href="/creator/team" className="underline">→ Team · {TEAM} published forms from six people</Link></li>
        <li><Link href={`/f/${SLUG5}`} className="underline">→ Voter · cart &amp; checkout (6 screens, 4 questions)</Link></li>
        <li><Link href={`/creator/${F2}/edit`} className="underline">→ Builder · portrait hero on violet</Link></li>
        <li><Link href={`/creator/${F3}/edit`} className="underline">→ Builder · ultra-wide hero on ink</Link></li>
        <li><Link href={`/creator/${F6}/edit`} className="underline">→ Builder · a draft that fails the publish gate</Link></li>
        <li><Link href={`/creator/${F4}/results`} className="underline">→ Results · closed form with a tie</Link></li>
        <li><Link href="/f/onboarding-illustration-7h3m" className="underline">→ Voter · portrait hero</Link></li>
        <li><Link href="/f/homepage-hero-copy-9x4t" className="underline">→ Voter · ultra-wide hero</Link></li>
        <li><Link href="/f/order-tracking-timeline-5t2n" className="underline">→ Voter · a teammate’s open form (Team tab)</Link></li>
      </ul>
    </main>
  )
}

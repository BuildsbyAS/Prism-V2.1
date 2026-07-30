// Seed data for the 'Cart & checkout refresh' demo form: welcome → context →
// four feedback pages → thank-you, with responses. Shared by /dev-seed (which
// seeds it alongside the other demo forms) and /dev-seed/checkout (which seeds
// only this one). Pure data — the writing happens in those routes.

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

const CREATOR = 'demo-creator'
export const F = 'seed-checkout-refresh'
export const SLUG = 'cart-checkout-refresh-mx7q'

const day = 86400000
const now = Date.now()
const ago = (d: number) => new Date(now - d * day).toISOString()

/* --------------------------- mock screenshots -----------------------------
   Inline SVG so the seed needs no network and every option is a recognisable
   piece of UI rather than a coloured rectangle — the comparisons only read as
   real if the things being compared do. 4:3 to match the voter's media box. */

const INK = '#18191d'
const MUTED = '#9497a3'
const LINE = '#e7e7e5'
const WASH = '#f1f2f4'

const url = (inner: string, w = 1200, h = 900) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="system-ui,-apple-system,sans-serif">${inner}</svg>`,
  )}`

const rect = (x: number, y: number, w: number, h: number, fill: string, r = 8) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"/>`

const text = (x: number, y: number, s: string, size = 22, fill = INK, weight = 500, anchor = 'start') =>
  `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${s}</text>`

/** White app surface inside a soft page wash, with a titled top bar. */
const shell = (title: string, body: string) =>
  url(
    rect(0, 0, 1200, 900, WASH, 0) +
      rect(60, 40, 1080, 820, '#ffffff', 26) +
      text(104, 108, title, 30, INK, 600) +
      rect(104, 132, 1032, 1, LINE, 0) +
      body,
  )

/** One line item: thumbnail, two text bars, price. */
const item = (y: number, priceW = 70) =>
  rect(104, y, 92, 92, WASH, 14) +
  rect(220, y + 18, 300, 16, '#dcdde1', 8) +
  rect(220, y + 48, 190, 14, '#e8e9ec', 7) +
  rect(1136 - priceW, y + 30, priceW, 18, '#dcdde1', 9)

const cta = (y: number, label: string, accent: string, x = 104, w = 1032) =>
  rect(x, y, w, 76, accent, 18) + text(x + w / 2, y + 48, label, 26, '#ffffff', 600, 'middle')

const chip = (x: number, y: number, w: number, on: boolean) =>
  rect(x, y, w, 56, on ? INK : '#ffffff', 14) +
  (on ? '' : `<rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="55" rx="14" fill="none" stroke="${LINE}"/>`) +
  rect(x + 20, y + 22, w - 40, 12, on ? '#ffffff' : '#d9dade', 6)

// 1 · Cart layout ---------------------------------------------------------
const CART_STICKY = shell(
  'Your basket',
  item(180) +
    item(300) +
    item(420) +
    rect(104, 556, 1032, 1, LINE, 0) +
    text(104, 606, 'Subtotal', 24, MUTED) +
    text(1136, 606, 'AED 248.00', 24, INK, 600, 'end') +
    text(104, 650, 'Delivery', 24, MUTED) +
    text(1136, 650, 'Free', 24, INK, 600, 'end') +
    rect(60, 700, 1080, 160, '#ffffff', 26) +
    rect(104, 700, 1032, 1, LINE, 0) +
    cta(752, 'Checkout · AED 248.00', '#2f6bff'),
)

const CART_CARDS = shell(
  'Your basket',
  rect(104, 168, 1032, 132, '#fbfbfc', 20) +
    item(188) +
    rect(104, 316, 1032, 132, '#fbfbfc', 20) +
    item(336) +
    rect(104, 464, 1032, 132, '#fbfbfc', 20) +
    item(484) +
    rect(104, 632, 1032, 96, '#f6f7f9', 20) +
    text(136, 690, 'Total', 26, INK, 600) +
    text(1104, 690, 'AED 248.00', 26, INK, 600, 'end') +
    cta(756, 'Continue to delivery', '#2f6bff'),
)

// 2 · Delivery slot picker ------------------------------------------------
const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const SLOT_GRID = shell(
  'Pick a delivery slot',
  days.map((d, i) => text(150 + i * 200, 200, d, 22, MUTED, 500, 'middle')).join('') +
    [0, 1, 2]
      .map((r) =>
        days.map((_, i) => chip(104 + i * 200, 230 + r * 76, 168, r === 1 && i === 2)).join(''),
      )
      .join('') +
    text(104, 540, '3 slots left today', 22, MUTED) +
    cta(756, 'Confirm slot', '#2f6bff'),
)

const SLOT_LIST = shell(
  'Pick a delivery slot',
  text(104, 200, 'Today · 12 Aug', 24, INK, 600) +
    chip(104, 222, 1032, false) +
    chip(104, 294, 1032, true) +
    text(104, 420, 'Tomorrow · 13 Aug', 24, INK, 600) +
    chip(104, 442, 1032, false) +
    chip(104, 514, 1032, false) +
    cta(756, 'Confirm slot', '#2f6bff'),
)

const SLOT_TWOSTEP = shell(
  'Pick a delivery slot',
  days.map((_, i) => chip(104 + i * 210, 180, 180, i === 1)).join('') +
    rect(104, 276, 1032, 1, LINE, 0) +
    [0, 1, 2, 3].map((r) => chip(104, 310 + r * 76, 1032, r === 2)).join('') +
    cta(756, 'Confirm slot', '#2f6bff'),
)

// 3 · Payment step --------------------------------------------------------
const PAY_ONE = shell(
  'Payment',
  text(104, 190, 'Card details', 24, INK, 600) +
    rect(104, 212, 1032, 72, WASH, 14) +
    rect(104, 300, 500, 72, WASH, 14) +
    rect(636, 300, 500, 72, WASH, 14) +
    text(104, 428, 'Billing address', 24, INK, 600) +
    rect(104, 450, 1032, 72, WASH, 14) +
    rect(104, 538, 1032, 72, WASH, 14) +
    rect(104, 634, 40, 40, '#ffffff', 10) +
    `<rect x="104.5" y="634.5" width="39" height="39" rx="10" fill="none" stroke="${LINE}"/>` +
    text(164, 662, 'Save this card for next time', 22, MUTED) +
    cta(756, 'Pay AED 248.00', '#0e9f6e'),
)

const PAY_TWO = shell(
  'Payment · step 1 of 2',
  rect(104, 172, 500, 8, INK, 4) +
    rect(620, 172, 516, 8, '#e4e5e8', 4) +
    text(104, 250, 'How would you like to pay?', 26, INK, 600) +
    rect(104, 280, 1032, 96, '#ffffff', 18) +
    `<rect x="104.5" y="280.5" width="1031" height="95" rx="18" fill="none" stroke="${INK}" stroke-width="2"/>` +
    rect(140, 312, 56, 36, WASH, 8) +
    text(220, 336, 'Card ending 4482', 24, INK, 600) +
    rect(104, 396, 1032, 96, '#ffffff', 18) +
    `<rect x="104.5" y="396.5" width="1031" height="95" rx="18" fill="none" stroke="${LINE}"/>` +
    rect(140, 428, 56, 36, WASH, 8) +
    text(220, 452, 'Apple Pay', 24, MUTED) +
    rect(104, 512, 1032, 96, '#ffffff', 18) +
    `<rect x="104.5" y="512.5" width="1031" height="95" rx="18" fill="none" stroke="${LINE}"/>` +
    rect(140, 544, 56, 36, WASH, 8) +
    text(220, 568, 'Cash on delivery', 24, MUTED) +
    cta(756, 'Continue', '#0e9f6e'),
)

// 4 · Confirmation --------------------------------------------------------
const DONE_SUMMARY = shell(
  'Order placed',
  rect(104, 180, 64, 64, '#0e9f6e', 32) +
    text(104, 300, 'Order #4482 confirmed', 32, INK, 600) +
    text(104, 344, 'Arriving Tue 13 Aug, 10:00–12:00', 24, MUTED) +
    rect(104, 380, 1032, 1, LINE, 0) +
    item(410, 60) +
    item(520, 60) +
    rect(104, 648, 1032, 1, LINE, 0) +
    text(104, 700, 'Total paid', 24, MUTED) +
    text(1136, 700, 'AED 248.00', 24, INK, 600, 'end') +
    cta(760, 'Track order', '#18191d'),
)

const DONE_BIG = shell(
  'Order placed',
  rect(568, 210, 96, 96, '#0e9f6e', 48) +
    text(600, 380, 'Thank you!', 44, INK, 700, 'middle') +
    text(600, 430, 'Order #4482 · arriving Tue 10:00–12:00', 24, MUTED, 500, 'middle') +
    rect(300, 480, 600, 76, WASH, 18) +
    text(600, 528, 'AED 248.00 paid', 24, INK, 600, 'middle') +
    cta(700, 'Track order', '#18191d', 300, 600),
)

/** Wide welcome hero — the three screens the study covers. */
const HERO = url(
  rect(0, 0, 2400, 900, '#0f1730', 0) +
    [0, 1, 2]
      .map((i) => {
        const x = 800 + i * 440
        return (
          rect(x, 150, 360, 620, '#ffffff', 40) +
          rect(x + 40, 210, 180, 20, '#d7d9df', 10) +
          rect(x + 40, 270, 280, 90, WASH, 16) +
          rect(x + 40, 380, 280, 90, WASH, 16) +
          rect(x + 40, 490, 280, 90, WASH, 16) +
          rect(x + 40, 640, 280, 60, i === 1 ? '#2f6bff' : '#e4e5e8', 14)
        )
      })
      .join('') +
    text(140, 420, 'Cart &amp; checkout', 60, '#ffffff', 700) +
    text(140, 496, 'refresh', 60, '#ffffff', 700) +
    text(140, 566, 'Four comparisons · ~3 min', 26, '#8fa0c8', 500),
  2400,
  900,
)

/* ------------------------------ the form ---------------------------------- */

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
    responses_seen_at: null,
    ...over,
  }
}

const page = (id: string, type: PageType, order: number, title: string, body = ''): Page => ({
  id,
  form_id: F,
  type,
  order_index: order,
  title,
  body,
  show_neutral_option: true,
})

const option = (
  id: string,
  pageId: string,
  order: number,
  name: string,
  description: string,
  embedUrl: string,
  isStatic = false,
): Option => ({
  id,
  form_id: F,
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
})

const widget = (id: string, pageId: string, type: WidgetType, config: WidgetConfig): Widget => ({
  id,
  form_id: F,
  page_id: pageId,
  type,
  config,
  order_index: 0,
  is_followup: false,
  branch_condition: null,
})

export const checkoutForm = form({
  id: F,
  slug: SLUG,
  title: 'Cart & checkout refresh',
  body_copy:
    'We rebuilt the basket and checkout for the app. Four quick comparisons — pick the one that would work better for you and say why. There are no wrong answers, and nothing here is final.',
  testing_question: 'Which checkout flow feels faster and clearer?',
  project_brief:
    'Q3 checkout refresh. Cart abandonment sits at 68% on mobile, with the delivery-slot step the single biggest drop-off. Goal: fewer taps to a confirmed order without hiding cost or timing.',
  usps_metrics: 'Taps to place an order · time on the slot picker · perceived cost clarity',
  hero_image_url: HERO,
  hero_bg: 'g-ocean',
  hero_dither: true,
  thank_you_message:
    'That’s everything — thank you. We read every comment, and the winning directions go into build next sprint.',
  status: 'open',
  show_time_estimate: true,
  estimated_minutes: 3,
  created_at: ago(4),
  published_at: ago(3),
})

const P1 = `${F}-p1`, P2 = `${F}-p2`, P3 = `${F}-p3`, P4 = `${F}-p4`, P5 = `${F}-p5`, P6 = `${F}-p6`

export const checkoutPages: Page[] = [
  page(
    P1,
    'static',
    0,
    'What you’re looking at',
    'Everything below is the checkout on a phone, from basket to confirmation. Today it takes eleven taps and two full-page loads to place a repeat order — the screens on the right are attempts to cut that down. Assume you are re-ordering your usual weekly shop.',
  ),
  page(
    P2,
    'feedback',
    1,
    'The basket',
    'Same three items and the same total in both. The question is only how the list is arranged and where the checkout button lives.',
  ),
  page(
    P3,
    'feedback',
    2,
    'Choosing a delivery slot',
    'This is where most people drop off today. Three ways to pick a day and a two-hour window.',
  ),
  page(
    P4,
    'static',
    3,
    'One constraint before the last two',
    'Payment methods are fixed — card, Apple Pay and cash on delivery all have to be offered, and the card form can’t be shortened for regulatory reasons. So the only thing in play is how those are staged.',
  ),
  page(
    P5,
    'feedback',
    4,
    'Paying',
    'Everything on one screen, or split the method from the details.',
  ),
  page(
    P6,
    'feedback',
    5,
    'The confirmation',
    'The last screen you see. It has to answer “did it work, when is it coming, what did I pay”.',
  ),
]

export const checkoutOptions: Option[] = [
  option(`${F}-o1`, P1, 0, 'Checkout today', 'The flow currently in production', CART_STICKY, true),

  option(`${F}-o2a`, P2, 0, 'Plain list, pinned button', 'Items run together; checkout stays on screen as you scroll', CART_STICKY),
  option(`${F}-o2b`, P2, 1, 'Item cards, button after total', 'Each item boxed; you reach the button by scrolling to the total', CART_CARDS),

  option(`${F}-o3a`, P3, 0, 'Week grid', 'Five days across, slots underneath — everything visible at once', SLOT_GRID),
  option(`${F}-o3b`, P3, 1, 'Day-by-day list', 'Scroll through days in order, slots listed full width', SLOT_LIST),
  option(`${F}-o3c`, P3, 2, 'Pick a day, then a slot', 'Day pills at the top filter the list below', SLOT_TWOSTEP),

  option(`${F}-o5a`, P5, 0, 'One screen', 'Card details and billing address together, pay at the bottom', PAY_ONE),
  option(`${F}-o5b`, P5, 1, 'Two steps', 'Choose the method first, details on the next screen', PAY_TWO),

  option(`${F}-o6a`, P6, 0, 'Receipt style', 'Confirmation, delivery window, then the itemised order', DONE_SUMMARY),
  option(`${F}-o6b`, P6, 1, 'Big confirmation', 'Reassurance first, order detail one tap away', DONE_BIG),
]

export const checkoutWidgets: Widget[] = [
  widget(`${F}-w2`, P2, 'rating', {
    label: 'How much easier was your pick to scan?',
    description: 'One star = no real difference, five = a lot easier.',
    allowHalf: false,
    required: false,
  }),
  widget(`${F}-w3`, P3, 'radio', {
    label: 'What decided it for you?',
    choices: [
      'I could see every slot without scrolling',
      'It was obvious which slots were taken',
      'Fewest taps to a slot I wanted',
      'It matched how I already think about days',
    ],
    required: false,
  }),
  widget(`${F}-w5`, P5, 'slider', {
    label: 'How confident would you feel entering card details here?',
    min: 0,
    max: 100,
    minLabel: 'I’d hesitate',
    maxLabel: 'Completely fine',
    required: false,
  }),
  widget(`${F}-w6`, P6, 'text', {
    label: 'Anything the confirmation screen still doesn’t answer?',
    long: true,
    placeholder: 'A sentence is plenty…',
    required: false,
  }),
]

/* ------------------------------ responses --------------------------------- */

const NOTES = [
  'I wanted the driver’s name and a way to change the slot without calling.',
  'Nothing missing — I’d just want the receipt emailed too.',
  'Where do I report a missing item? That’s the thing I always need.',
  'It says arriving Tuesday but not whether I need to be home.',
  'Clear enough. The order number should be bigger and copyable.',
  'I’d want a “add this to my usual” button right there.',
]

export const checkoutResponses: VoteResponse[] = []
export const checkoutAnswers: ResponseAnswer[] = []
const picks = {
  [P2]: [`${F}-o2a`, `${F}-o2b`, `${F}-o2a`, `${F}-o2a`, `${F}-o2b`, `${F}-o2a`, 'tie', `${F}-o2a`, `${F}-o2b`, `${F}-o2a`, `${F}-o2a`, `${F}-o2b`],
  [P3]: [`${F}-o3a`, `${F}-o3c`, `${F}-o3a`, `${F}-o3b`, `${F}-o3a`, `${F}-o3c`, `${F}-o3a`, `${F}-o3a`, `${F}-o3c`, `${F}-o3b`, `${F}-o3a`, `${F}-o3a`],
  [P5]: [`${F}-o5b`, `${F}-o5b`, `${F}-o5a`, `${F}-o5b`, `${F}-o5b`, `${F}-o5a`, `${F}-o5b`, `${F}-o5b`, `${F}-o5a`, `${F}-o5b`, `${F}-o5b`, `${F}-o5a`],
  [P6]: [`${F}-o6b`, `${F}-o6a`, `${F}-o6b`, `${F}-o6b`, `${F}-o6a`, `${F}-o6b`, `${F}-o6b`, `${F}-o6a`, `${F}-o6b`, `${F}-o6b`, `${F}-o6a`, `${F}-o6b`],
}
const RATINGS = [4, 3, 5, 4, 2, 5, 3, 4, 4, 5, 3, 4]
const CHOICES = [0, 2, 0, 3, 0, 2, 1, 0, 2, 3, 0, 1]
const SLIDERS = [78, 84, 55, 91, 72, 48, 88, 80, 60, 95, 76, 52]

for (let i = 0; i < 12; i++) {
  const id = `${F}-r${i + 1}`
  checkoutResponses.push({
    id,
    form_id: F,
    voter_session_id: `checkout-voter-${i + 1}`,
    submitted_at: ago(Math.max(0.2, 2.6 - i * 0.2)),
    choices: Object.fromEntries(Object.entries(picks).map(([pageId, list]) => [pageId, list[i]])),
  })
  checkoutAnswers.push(
    { id: `${id}-a2`, response_id: id, widget_id: `${F}-w2`, value: RATINGS[i], upvotes: 0 },
    { id: `${id}-a3`, response_id: id, widget_id: `${F}-w3`, value: (checkoutWidgets[1].config.choices ?? [])[CHOICES[i]], upvotes: 0 },
    { id: `${id}-a5`, response_id: id, widget_id: `${F}-w5`, value: SLIDERS[i], upvotes: 0 },
  )
  if (i < NOTES.length) {
    checkoutAnswers.push({ id: `${id}-a6`, response_id: id, widget_id: `${F}-w6`, value: NOTES[i], upvotes: [4, 0, 2, 0, 1, 0][i] })
  }
}

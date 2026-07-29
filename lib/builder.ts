// Helpers for the multi-page builder. A form is an ordered list of pages between
// the welcome and end screens; each page owns its options + feedback inputs.
//
//   feedback page → options to compare (select) + inputs (voters respond)
//   static page   → a context screen (title/body/media, no response)

import type { EmbedType, Form, Option, Page, PageType, Widget, WidgetType } from './types'

/**
 * The pods a form can belong to, asked for when it's published. A fixed list
 * rather than free text: this is how results get attributed to a team, and
 * "Storefront" / "storefront" / "SF" typed three ways is three teams.
 */
export const POD_OPTIONS = [
  'AFS',
  'Customer',
  'Growth',
  'Loyalty',
  'O2D',
  'Sales',
  'Special/Platform Projects',
  'Storefront',
  'UGC',
] as const

/** Everything a form needs before it can go live, beyond its content. */
export function publishDetailsMissing(form: Pick<Form, 'name' | 'title' | 'pod' | 'expires_at'>): string[] {
  const missing: string[] = []
  if (!formName(form)) missing.push('a name')
  if (!form.pod?.trim()) missing.push('a pod')
  if (!form.expires_at) missing.push('an expiry date')
  return missing
}

export const MAX_OPTIONS = 4
// One additional feedback input per feedback page — keep the voter's task light.
export const MAX_WIDGETS = 1

function uid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

/**
 * What to call a form. Until the creator renames it, a form goes by its welcome
 * headline, so naming a new form is one step rather than two; the rename writes
 * `name`, and from then on the two are independent — editing the headline no
 * longer moves the name, and clearing the name hands it back to the headline.
 *
 * Empty when neither is filled in: callers add their own placeholder, since
 * "Untitled form" and "Untitled" aren't the same word everywhere.
 */
export function formName(form: Pick<Form, 'name' | 'title'>): string {
  // ?? '' — demo rows written before `name` existed have neither field.
  return (form.name ?? '').trim() || (form.title ?? '').trim()
}

export function newPage(formId: string, type: PageType, order: number): Page {
  return { id: uid(), form_id: formId, type, order_index: order, title: '', body: '' }
}

export function newOption(formId: string, pageId: string, order: number, letterIndex: number): Option {
  return {
    id: uid(),
    form_id: formId,
    page_id: pageId,
    name: `Option ${String.fromCharCode(65 + letterIndex)}`,
    description: '',
    order_index: order,
    embed_type: 'image' as EmbedType,
    embed_url: '',
    alt_text: '',
    is_decorative: false,
    brightness: 0,
    is_static: false,
  }
}

export function newWidget(formId: string, pageId: string, type: WidgetType, order: number): Widget {
  const base = { id: uid(), form_id: formId, page_id: pageId, type, order_index: order, is_followup: false, branch_condition: null }
  switch (type) {
    case 'rating':
      return { ...base, config: { label: 'How would you rate this?', allowHalf: false, required: false } }
    case 'slider':
      return { ...base, config: { label: 'Where do you land?', min: 0, max: 100, minLabel: 'Not confident', maxLabel: 'Very confident', required: false } }
    case 'radio':
      return { ...base, config: { label: 'Pick one', choices: ['Option 1', 'Option 2'], required: false } }
    case 'text':
      return { ...base, config: { label: 'Tell us more', long: true, placeholder: 'Share your thoughts…', required: false } }
    case 'voice':
      return { ...base, config: { label: 'Leave a voice note', required: false } }
  }
}

export function dupOption(o: Option): Option {
  return { ...o, id: uid(), name: `${o.name} copy` }
}
export function dupWidget(w: Widget): Widget {
  return { ...w, id: uid(), config: { ...w.config } }
}
export function dupPage(p: Page): Page {
  return { ...p, id: uid(), title: p.title ? `${p.title} copy` : p.title }
}

export const WIDGET_META: Record<WidgetType, { label: string; glyph: string; hint: string }> = {
  rating: { label: 'Rating', glyph: '★', hint: '1–5 stars' },
  slider: { label: 'Slider', glyph: '⇄', hint: '0–100 with axis labels' },
  radio: { label: 'Multiple choice', glyph: '◉', hint: 'A / B / C or custom' },
  text: { label: 'Text', glyph: '¶', hint: 'Short or long answer' },
  voice: { label: 'Voice', glyph: '🎤', hint: 'Record a voice note' },
}

// `label` names the page everywhere it appears: the type picker, the left rail,
// confirmations. Named for what the page *does* for the creator rather than what
// it is — "Get Vote" and "Set Context" say which one to reach for; "Feedback" and
// "Static" described the mechanism and left you to work that out.
export const PAGE_META: Record<PageType, { label: string; glyph: string; hint: string }> = {
  // Glyphs picked to read at a glance: a split pane for the A/B compare, lines
  // of copy for the read-only page. The old ▦/▤ pair was near-identical at 13px.
  // The hints say what the page is *for*, not what it mechanically does: "no
  // response collected" described the absence of a feature and left the creator
  // to guess when they'd ever want one.
  feedback: { label: 'Get Vote', glyph: '◫', hint: 'Compare options & collect responses' },
  static: { label: 'Set Context', glyph: '▤', hint: 'Brief voters before they choose — the metric you’re targeting, constraints, what ships today' },
}

// ---------------------------------------------------------------------------
// Selection — the left rail + which panel to show.
// ---------------------------------------------------------------------------
export type Selection =
  | { kind: 'welcome' }
  | { kind: 'page'; id: string } // a page overview
  | { kind: 'option'; key: string } // an option within its page
  | { kind: 'input'; key: string } // a feedback input within its page
  | { kind: 'end' }

// ---------------------------------------------------------------------------
// Readiness — the publish gate.
// ---------------------------------------------------------------------------
export interface Readiness {
  welcome: boolean
  middle: boolean
  thankyou: boolean
  publishable: boolean
}

/** Is a single page filled enough to be meaningful? A feedback page needs a title
 *  (required) plus options — either a comparison (2+) or one option and a way to
 *  respond. The subtitle stays optional. */
export function pageReady(page: Page, options: Option[], widgets: Widget[]): boolean {
  const opts = options.filter((o) => o.page_id === page.id)
  const wids = widgets.filter((w) => w.page_id === page.id)
  if (page.type === 'feedback') return Boolean(page.title.trim()) && (opts.length >= 2 || (opts.length >= 1 && wids.length >= 1))
  return Boolean(page.title.trim()) || opts.length >= 1
}

/** Options a feedback page seeds itself with, before anyone touches them. */
const DEFAULT_OPTION_NAME = /^Option [A-Z]$/

/**
 * Does this page hold work someone would miss if it vanished?
 *
 * Used to decide whether deleting needs a confirmation. A page added by mistake
 * is blank — a feedback page even seeds two placeholder options — so deleting it
 * should be immediate; nagging about a page you added seconds ago is friction
 * for nothing. Anything actually typed, uploaded, or added counts as content.
 */
export function pageHasContent(page: Page, options: Option[], widgets: Widget[]): boolean {
  if (page.title.trim() || page.body.trim()) return true
  if (widgets.some((w) => w.page_id === page.id)) return true
  return options
    .filter((o) => o.page_id === page.id)
    .some(
      (o) =>
        Boolean(o.embed_url.trim()) ||
        Boolean(o.description.trim()) ||
        Boolean(o.alt_text.trim()) ||
        // A renamed option is work too; the seeded "Option A" name is not.
        !DEFAULT_OPTION_NAME.test(o.name.trim()),
    )
}

export function readiness(
  form: Pick<Form, 'title' | 'body_copy' | 'thank_you_message'>,
  pages: Page[],
  options: Option[],
  widgets: Widget[],
): Readiness {
  // The welcome screen is the voter's brief: title and subtitle are both
  // required before a form can publish.
  const welcome = Boolean(form.title.trim()) && Boolean(form.body_copy.trim())
  // Specifically a *feedback* page: a form of nothing but static pages collects
  // no answers, so publishing one would hand voters a link they can't respond
  // to. Static pages are context for a comparison, never the whole form.
  const middle = pages.some((p) => p.type === 'feedback' && pageReady(p, options, widgets))
  const thankyou = Boolean(form.thank_you_message.trim())
  return { welcome, middle, thankyou, publishable: welcome && middle }
}

/**
 * Why the form can't be published yet, in one sentence — or null when it can.
 *
 * Drives the tooltip on the disabled Publish button. Ordered to match the Share
 * dialog's checklist, so the button and the dialog never disagree about what to
 * fix first, and it separates "there's no Get Vote page" from "there is one but
 * it's empty" — those need different actions, and `middle` alone can't tell you
 * which you're looking at.
 */
export function publishBlocker(ready: Readiness, pages: Page[]): string | null {
  if (ready.publishable) return null
  if (!ready.welcome) return 'Add a title and subtitle to the introduction page before publishing.'
  return pages.some((p) => p.type === 'feedback')
    ? 'Finish your Get Vote page — it needs a title and 2 options, or 1 option and a question.'
    : 'Add at least one Get Vote page — a form needs one to collect responses.'
}

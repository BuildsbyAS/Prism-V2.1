// Helpers for the multi-page builder. A form is an ordered list of pages between
// the welcome and end screens; each page owns its options + feedback inputs.
//
//   feedback page → options to compare (select) + inputs (voters respond)
//   static page   → a context screen (title/body/media, no response)

import type { EmbedType, Form, Option, Page, PageType, Widget, WidgetType } from './types'

export const MAX_OPTIONS = 4
// One additional feedback input per feedback page — keep the voter's task light.
export const MAX_WIDGETS = 1

function uid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
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
    focal_x: 50,
    focal_y: 50,
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

export const PAGE_META: Record<PageType, { label: string; glyph: string; hint: string }> = {
  feedback: { label: 'Feedback page', glyph: '▦', hint: 'Compare options & collect responses' },
  static: { label: 'Static page', glyph: '▤', hint: 'Show context — no response collected' },
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

export function readiness(
  form: Pick<Form, 'title' | 'body_copy' | 'project_brief' | 'usps_metrics' | 'thank_you_message'>,
  pages: Page[],
  options: Option[],
  widgets: Widget[],
): Readiness {
  // The welcome screen is the voter's brief: title, subtitle, project brief and
  // USPs/metrics are all required before a form can publish.
  const welcome = Boolean(form.title.trim()) && Boolean(form.body_copy.trim()) && Boolean(form.project_brief.trim()) && Boolean(form.usps_metrics.trim())
  const middle = pages.length >= 1 && pages.some((p) => pageReady(p, options, widgets))
  const thankyou = Boolean(form.thank_you_message.trim())
  return { welcome, middle, thankyou, publishable: welcome && middle }
}

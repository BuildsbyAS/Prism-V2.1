// Data-access facade for the creator + voter UIs. One API, two backends:
//
//   • Supabase configured → real, RLS-gated queries via the browser client.
//   • Not configured      → a localStorage "demo" store with a stubbed creator,
//                            so the entire product is clickable with no project.
//
// The UI only ever imports from here and never branches on the backend itself.

import { supabase, isSupabaseConfigured } from './supabase'
import type {
  Form,
  FormMode,
  FullForm,
  Page,
  Option,
  Widget,
  FormResults,
  WidgetBreakdown,
  SubmittedResponse,
  Response as VoteResponse,
  ResponseAnswer,
} from './types'

export const DEMO_CREATOR_ID = 'demo-creator'
export const DEMO_CREATOR_EMAIL = 'demo@noon.com'

export interface DashboardForm {
  form: Form
  responseCount: number
  lastResponseAt: string | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function uid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return (base || 'form') + '-' + Math.random().toString(36).slice(2, 6)
}

function newForm(mode: FormMode, creatorId: string): Form {
  return {
    id: uid(),
    creator_id: creatorId,
    slug: slugify('untitled'),
    title: '',
    body_copy: '',
    testing_question: '',
    usps_metrics: '',
    project_brief: '',
    hero_image_url: '',
    thank_you_message: '',
    mode,
    status: 'draft',
    show_results_to_voters: true,
    require_voter_login: false,
    show_time_estimate: false,
    estimated_minutes: 1,
    google_sheet_id: null,
    results_token: uid(),
    created_at: new Date().toISOString(),
    published_at: null,
  }
}

// ---------------------------------------------------------------------------
// Demo store (localStorage)
// ---------------------------------------------------------------------------
const DEMO_KEY = 'prism:v2'

interface DemoDB {
  forms: Form[]
  pages: Page[]
  options: Option[]
  widgets: Widget[]
  responses: VoteResponse[]
  answers: ResponseAnswer[]
}

function readDemo(): DemoDB {
  const empty: DemoDB = { forms: [], pages: [], options: [], widgets: [], responses: [], answers: [] }
  if (typeof window === 'undefined') return empty
  try {
    const raw = window.localStorage.getItem(DEMO_KEY)
    if (!raw) return empty
    return { ...empty, ...JSON.parse(raw) }
  } catch {
    return empty
  }
}

function writeDemo(db: DemoDB): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(DEMO_KEY, JSON.stringify(db))
  } catch {
    /* storage full / unavailable — demo only */
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** All of the current creator's forms with response stats, newest first. */
export async function getDashboard(creatorId = DEMO_CREATOR_ID): Promise<DashboardForm[]> {
  if (isSupabaseConfigured && supabase) {
    const { data: forms, error } = await supabase
      .from('forms')
      .select('*')
      .eq('creator_id', creatorId)
      .order('created_at', { ascending: false })
    if (error) throw error
    const ids = (forms ?? []).map((f) => f.id)
    const counts: Record<string, { n: number; last: string | null }> = {}
    if (ids.length) {
      const { data: resp } = await supabase
        .from('responses')
        .select('form_id,submitted_at')
        .in('form_id', ids)
      for (const r of resp ?? []) {
        const c = (counts[r.form_id] ??= { n: 0, last: null })
        c.n += 1
        if (!c.last || r.submitted_at > c.last) c.last = r.submitted_at
      }
    }
    return (forms ?? []).map((form) => ({
      form: form as Form,
      responseCount: counts[form.id]?.n ?? 0,
      lastResponseAt: counts[form.id]?.last ?? null,
    }))
  }

  const db = readDemo()
  return db.forms
    .filter((f) => f.creator_id === creatorId)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map((form) => {
      const rs = db.responses.filter((r) => r.form_id === form.id)
      const last = rs.reduce<string | null>(
        (acc, r) => (!acc || r.submitted_at > acc ? r.submitted_at : acc),
        null,
      )
      return { form, responseCount: rs.length, lastResponseAt: last }
    })
}

async function loadFull(form: Form): Promise<FullForm> {
  if (isSupabaseConfigured && supabase) {
    const [{ data: pages }, { data: options }, { data: widgets }] = await Promise.all([
      supabase.from('pages').select('*').eq('form_id', form.id).order('order_index'),
      supabase.from('options').select('*').eq('form_id', form.id).order('order_index'),
      supabase.from('widgets').select('*').eq('form_id', form.id).order('order_index'),
    ])
    return {
      form,
      pages: (pages ?? []) as Page[],
      options: (options ?? []) as Option[],
      widgets: (widgets ?? []) as Widget[],
    }
  }
  const db = readDemo()
  const byOrder = (a: { order_index: number }, b: { order_index: number }) => a.order_index - b.order_index
  return {
    form,
    pages: db.pages.filter((p) => p.form_id === form.id).sort(byOrder),
    options: db.options.filter((o) => o.form_id === form.id).sort(byOrder),
    widgets: db.widgets.filter((w) => w.form_id === form.id).sort(byOrder),
  }
}

/** A form plus its ordered pages + options + widgets, for the builder. */
export async function getFullForm(id: string): Promise<FullForm | null> {
  if (isSupabaseConfigured && supabase) {
    const { data: form } = await supabase.from('forms').select('*').eq('id', id).maybeSingle()
    return form ? loadFull(form as Form) : null
  }
  const form = readDemo().forms.find((f) => f.id === id)
  return form ? loadFull(form) : null
}

/** Public voter view: a form by slug (only when open, enforced by RLS). */
export async function getPublicForm(slug: string): Promise<FullForm | null> {
  if (isSupabaseConfigured && supabase) {
    const { data: form } = await supabase.from('forms').select('*').eq('slug', slug).maybeSingle()
    return form ? loadFull(form as Form) : null
  }
  const form = readDemo().forms.find((f) => f.slug === slug)
  return form ? loadFull(form) : null
}

/** Create a blank form and return it (caller redirects into the builder). */
export async function createForm(mode: FormMode, creatorId = DEMO_CREATOR_ID): Promise<Form> {
  const form = newForm(mode, creatorId)
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.from('forms').insert(form).select().single()
    if (error) throw error
    return data as Form
  }
  const db = readDemo()
  db.forms.push(form)
  writeDemo(db)
  return form
}

/** Persist the whole form: its fields plus a full replace of pages/options/widgets. */
export async function saveFullForm(full: FullForm): Promise<void> {
  const { form, pages, options, widgets } = full
  const cleanPages = pages.map((p) => ({ ...p, form_id: form.id }))
  const cleanOptions = options.map((o) => ({ ...o, form_id: form.id }))
  const cleanWidgets = widgets.map((w) => ({ ...w, form_id: form.id }))

  if (isSupabaseConfigured && supabase) {
    const { error: fe } = await supabase.from('forms').update(form).eq('id', form.id)
    if (fe) throw fe
    // Replace children. Options/widgets cascade off pages, so delete pages last
    // isn't required — delete all then re-insert pages before their children.
    await supabase.from('options').delete().eq('form_id', form.id)
    await supabase.from('widgets').delete().eq('form_id', form.id)
    await supabase.from('pages').delete().eq('form_id', form.id)
    if (cleanPages.length) await supabase.from('pages').insert(cleanPages)
    if (cleanOptions.length) await supabase.from('options').insert(cleanOptions)
    if (cleanWidgets.length) await supabase.from('widgets').insert(cleanWidgets)
    return
  }

  const db = readDemo()
  db.forms = db.forms.map((f) => (f.id === form.id ? form : f))
  db.pages = db.pages.filter((p) => p.form_id !== form.id).concat(cleanPages)
  db.options = db.options.filter((o) => o.form_id !== form.id).concat(cleanOptions)
  db.widgets = db.widgets.filter((w) => w.form_id !== form.id).concat(cleanWidgets)
  writeDemo(db)
}

export async function deleteForm(id: string): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    await supabase.from('forms').delete().eq('id', id)
    return
  }
  const db = readDemo()
  db.forms = db.forms.filter((f) => f.id !== id)
  db.pages = db.pages.filter((p) => p.form_id !== id)
  db.options = db.options.filter((o) => o.form_id !== id)
  db.widgets = db.widgets.filter((w) => w.form_id !== id)
  db.responses = db.responses.filter((r) => r.form_id !== id)
  writeDemo(db)
}

/** Record a voter's submission (a chosen option per feedback page + answers). */
export async function submitResponse(
  formId: string,
  voterSessionId: string,
  submitted: SubmittedResponse,
): Promise<void> {
  const responseId = uid()
  const now = new Date().toISOString()

  // Choices ride on the response row; only real widget answers go to
  // response_answers (its widget_id is a FK to widgets).
  const answerRows = Object.entries(submitted.answers).map(([widget_id, value]) => ({ widget_id, value }))

  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase
      .from('responses')
      .insert({ id: responseId, form_id: formId, voter_session_id: voterSessionId, choices: submitted.choices })
    if (error) throw error
    if (answerRows.length) {
      const { error: ae } = await supabase
        .from('response_answers')
        .insert(answerRows.map((r) => ({ id: uid(), response_id: responseId, ...r })))
      if (ae) throw ae
    }
    return
  }

  const db = readDemo()
  db.responses.push({ id: responseId, form_id: formId, voter_session_id: voterSessionId, submitted_at: now, choices: submitted.choices })
  for (const r of answerRows) {
    db.answers.push({ id: uid(), response_id: responseId, widget_id: r.widget_id, value: r.value, upvotes: 0 })
  }
  writeDemo(db)
}

/** Aggregate results for a form: totals, option split, per-widget breakdown. */
export async function getResults(formId: string): Promise<FormResults> {
  const full = await getFullForm(formId)
  const widgets = full?.widgets ?? []

  let responses: VoteResponse[] = []
  let answers: ResponseAnswer[] = []

  if (isSupabaseConfigured && supabase) {
    const { data: resp } = await supabase.from('responses').select('*').eq('form_id', formId)
    responses = (resp ?? []) as VoteResponse[]
    const ids = responses.map((r) => r.id)
    if (ids.length) {
      const { data: ans } = await supabase.from('response_answers').select('*').in('response_id', ids)
      answers = (ans ?? []) as ResponseAnswer[]
    }
  } else {
    const db = readDemo()
    responses = db.responses.filter((r) => r.form_id === formId)
    const ids = new Set(responses.map((r) => r.id))
    answers = db.answers.filter((a) => ids.has(a.response_id))
  }

  const times = responses.map((r) => r.submitted_at).sort()
  // Every feedback page's choice tallies into optionCounts (keyed by option id,
  // plus 'tie'), across all pages — read from each response's `choices`.
  const optionCounts: Record<string, number> = {}
  for (const r of responses) {
    for (const optionId of Object.values(r.choices ?? {})) {
      optionCounts[optionId] = (optionCounts[optionId] ?? 0) + 1
    }
  }

  const widgetBreakdowns: WidgetBreakdown[] = widgets.map((widget) => {
    const wa = answers.filter((a) => a.widget_id === widget.id)
    const distribution: Record<string, number> = {}
    const textAnswers: WidgetBreakdown['textAnswers'] = []
    let sum = 0
    let numeric = 0
    for (const a of wa) {
      if (widget.type === 'text' || widget.type === 'voice') {
        // text → the written answer; voice → the recording's data URL.
        if (typeof a.value === 'string' && a.value.trim()) {
          textAnswers.push({ id: a.id, value: a.value, upvotes: a.upvotes })
        }
      } else if (typeof a.value === 'number') {
        sum += a.value
        numeric += 1
        distribution[String(a.value)] = (distribution[String(a.value)] ?? 0) + 1
      } else if (typeof a.value === 'string') {
        distribution[a.value] = (distribution[a.value] ?? 0) + 1
      }
    }
    textAnswers.sort((a, b) => b.upvotes - a.upvotes)
    return {
      widget,
      count: wa.length,
      average: numeric ? Math.round((sum / numeric) * 10) / 10 : null,
      distribution,
      textAnswers,
    }
  })

  return {
    total: responses.length,
    firstAt: times[0] ?? null,
    lastAt: times[times.length - 1] ?? null,
    optionCounts,
    widgets: widgetBreakdowns,
  }
}

export async function upvoteAnswer(answerId: string): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { data } = await supabase.from('response_answers').select('upvotes').eq('id', answerId).maybeSingle()
    const next = (data?.upvotes ?? 0) + 1
    await supabase.from('response_answers').update({ upvotes: next }).eq('id', answerId)
    return
  }
  const db = readDemo()
  db.answers = db.answers.map((a) => (a.id === answerId ? { ...a, upvotes: a.upvotes + 1 } : a))
  writeDemo(db)
}

// Data-access facade for the creator + voter UIs. One API, two backends:
//
//   • Supabase configured → real, RLS-gated queries via the browser client.
//   • Not configured      → a localStorage "demo" store with a stubbed creator,
//                            so the entire product is clickable with no project.
//
// The UI only ever imports from here and never branches on the backend itself.

import { supabase, isSupabaseConfigured } from './supabase'
import { newPage, newOption, formName, neutralChoiceKey } from './builder'
import type {
  Form,
  FormMode,
  FormStatus,
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

/**
 * The form fields a dashboard list actually renders. My Forms holds whole rows,
 * but the Team feed only ever learns this much about someone else's form
 * (see getTeamForms), so the list UI is typed against the smaller shape.
 */
export type ListedForm = Pick<
  Form,
  | 'id'
  | 'slug'
  | 'name'
  | 'title'
  | 'testing_question'
  | 'status'
  | 'creator_id'
  | 'expires_at'
  | 'pod'
  | 'collaborators'
  // The dashboard card's thumbnail is the form's own welcome hero, on the
  // backdrop the creator picked for it.
  | 'hero_image_url'
  | 'hero_bg'
  | 'hero_dither'
  | 'show_results_to_voters'
>

export interface TeamForm {
  form: ListedForm
  responseCount: number
  lastResponseAt: string | null
  /** The creator's account email — the list shows a name derived from it. */
  creatorEmail: string
  /** True when the viewer is the creator, so the list can offer Edit/Results. */
  mine: boolean
  /** True when the signed-in viewer has already submitted this form. */
  hasResponded: boolean
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
    // Left blank on purpose — the form goes by its welcome headline until the
    // creator renames it. See formName().
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
    mode,
    status: 'draft',
    pod: '',
    collaborators: [],
    expires_at: null,
    show_results_to_voters: true,
    require_voter_login: false,
    show_time_estimate: false,
    estimated_minutes: 1,
    google_sheet_id: null,
    responses_seen_at: null,
    results_token: uid(),
    created_at: new Date().toISOString(),
    published_at: null,
  }
}

// ---------------------------------------------------------------------------
// Demo store (localStorage)
// ---------------------------------------------------------------------------
/** Exported so views that mirror the demo store can watch it for cross-tab edits. */
export const DEMO_STORAGE_KEY = 'prism:v2'
const DEMO_KEY = DEMO_STORAGE_KEY

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

/**
 * Thrown when the demo store can't be written — in practice always because
 * localStorage is full (~5MB), which uploaded images eat fast as base64.
 */
export const STORAGE_FULL = 'storage-full'

export function isStorageFull(e: unknown): boolean {
  return e instanceof Error && e.message === STORAGE_FULL
}

function writeDemo(db: DemoDB): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(DEMO_KEY, JSON.stringify(db))
  } catch {
    // Previously swallowed, which is the worst possible handling: the builder
    // goes on showing your edits from React state while nothing reaches
    // storage, so the preview and every reload quietly serve the last version
    // that fit. Failing loudly is what lets the UI say so.
    throw new Error(STORAGE_FULL)
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

/** Shape of one `team_forms()` row (see supabase/schema.sql). */
interface TeamRow {
  id: string
  slug: string
  name: string | null
  title: string | null
  testing_question: string | null
  status: FormStatus
  creator_id: string
  creator_email: string | null
  response_count: number | string
  last_response_at: string | null
  /** Optional: older deployments of the team_forms() RPC don't select it, and
   *  the list simply shows no expiry rather than breaking. */
  expires_at?: string | null
  /** Same — a form published before pods existed has none, which the Team list
   *  buckets under "No pod" rather than hiding. */
  pod?: string | null
  /** Same again, for the card thumbnail: an RPC that doesn't select these hands
   *  back a form with no hero, which falls through to the placeholder art. */
  hero_image_url?: string | null
  hero_bg?: string | null
  hero_dither?: boolean | null
  collaborators?: string[] | null
  show_results_to_voters?: boolean | null
  viewer_has_responded?: boolean | null
}

/** Demo mode has no accounts, so a creator id doubles as their address. */
function demoCreatorEmail(creatorId: string): string {
  return creatorId === DEMO_CREATOR_ID ? DEMO_CREATOR_EMAIL : `${creatorId}@noon.com`
}

/**
 * Every published form in the workspace — open and closed, by any creator —
 * newest first. This is the dashboard's Team tab.
 *
 * In Supabase mode it goes through a `security definer` RPC rather than a query,
 * because RLS deliberately hides two ingredients: `responses` is owner/own-read
 * and `auth.users` isn't readable at all. The RPC hands back one aggregate row
 * per form — a tally, author, and the viewer's own submitted/not-submitted bit,
 * never an individual response.
 */
export async function getTeamForms(viewerId = DEMO_CREATOR_ID): Promise<TeamForm[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('team_forms')
    if (error) throw error
    return ((data ?? []) as TeamRow[]).map((r) => ({
      form: {
        id: r.id,
        slug: r.slug,
        name: r.name ?? '',
        title: r.title ?? '',
        testing_question: r.testing_question ?? '',
        status: r.status,
        creator_id: r.creator_id,
        expires_at: r.expires_at ?? null,
        pod: r.pod ?? '',
        collaborators: r.collaborators ?? [],
        hero_image_url: r.hero_image_url ?? '',
        hero_bg: r.hero_bg ?? 'none',
        hero_dither: r.hero_dither ?? true,
        show_results_to_voters: r.show_results_to_voters ?? false,
      },
      // count() arrives as a bigint, which PostgREST may serialise as a string.
      responseCount: Number(r.response_count ?? 0),
      lastResponseAt: r.last_response_at,
      creatorEmail: r.creator_email ?? '',
      mine: r.creator_id === viewerId,
      hasResponded: r.viewer_has_responded ?? false,
    }))
  }

  const db = readDemo()
  // Published forms sort on when they went live; created_at covers rows that
  // never recorded a publish time.
  const liveAt = (f: Form) => f.published_at ?? f.created_at
  return db.forms
    .filter((f) => f.status === 'open' || f.status === 'closed')
    .sort((a, b) => (liveAt(a) < liveAt(b) ? 1 : -1))
    .map((form) => {
      const rs = db.responses.filter((r) => r.form_id === form.id)
      const last = rs.reduce<string | null>(
        (acc, r) => (!acc || r.submitted_at > acc ? r.submitted_at : acc),
        null,
      )
      return {
        form,
        responseCount: rs.length,
        lastResponseAt: last,
        creatorEmail: demoCreatorEmail(form.creator_id),
        mine: form.creator_id === viewerId,
        hasResponded: Boolean(
          typeof window !== 'undefined' &&
            window.localStorage.getItem(`prism-session:${form.slug}`) &&
            rs.some(
              (response) =>
                response.voter_session_id ===
                window.localStorage.getItem(`prism-session:${form.slug}`),
            ),
        ),
      }
    })
}

/**
 * People this workspace already knows about, for the collaborator picker.
 *
 * There is no directory to search: `auth.users` isn't readable by design, and
 * the app has no profiles table. So "everyone we've seen" is the honest set —
 * whoever has published a form, plus whoever is already a collaborator on one.
 * Anything outside it can still be typed in full, which is the escape hatch for
 * a colleague who hasn't used Prism yet.
 */
export async function getKnownPeople(): Promise<string[]> {
  const emails = new Set<string>()
  if (isSupabaseConfigured && supabase) {
    const { data } = await supabase.rpc('team_forms')
    for (const r of (data ?? []) as TeamRow[]) if (r.creator_email) emails.add(r.creator_email)
    const { data: mine } = await supabase.from('forms').select('collaborators')
    for (const f of (mine ?? []) as { collaborators: string[] | null }[]) {
      for (const c of f.collaborators ?? []) emails.add(c)
    }
  } else {
    const db = readDemo()
    for (const f of db.forms) {
      emails.add(demoCreatorEmail(f.creator_id))
      for (const c of f.collaborators ?? []) emails.add(c)
    }
  }
  return [...emails].sort()
}

/**
 * One entry per form that has responses the creator hasn't looked at yet.
 *
 * Derived from the responses themselves rather than stored as its own table:
 * "unread" is just `submitted_at > forms.responses_seen_at`, so there is no
 * notification state to keep in sync with reality, and it works the same in both
 * backends. Opening a form's results moves that watermark (markResponsesSeen).
 */
export interface FormUpdate {
  formId: string
  title: string
  status: FormStatus
  /** Responses submitted since the creator last opened this form's results. */
  newCount: number
  /** Timestamp of the newest unread response — what the list sorts on. */
  lastResponseAt: string
}

function buildUpdates(
  forms: Form[],
  responses: { form_id: string; submitted_at: string }[],
): FormUpdate[] {
  const byForm = new Map<string, Form>(forms.map((f) => [f.id, f]))
  const acc = new Map<string, { n: number; last: string }>()

  for (const r of responses) {
    const form = byForm.get(r.form_id)
    if (!form) continue
    // A null watermark means the results have never been opened, so everything counts.
    if (form.responses_seen_at && r.submitted_at <= form.responses_seen_at) continue
    const cur = acc.get(r.form_id)
    if (!cur) acc.set(r.form_id, { n: 1, last: r.submitted_at })
    else {
      cur.n += 1
      if (r.submitted_at > cur.last) cur.last = r.submitted_at
    }
  }

  return [...acc.entries()]
    .map(([formId, { n, last }]) => ({
      formId,
      title: formName(byForm.get(formId)!) || 'Untitled form',
      status: byForm.get(formId)!.status,
      newCount: n,
      lastResponseAt: last,
    }))
    .sort((a, b) => (a.lastResponseAt < b.lastResponseAt ? 1 : -1))
}

/** Unread-response updates for the creator, newest first. */
export async function getUpdates(creatorId = DEMO_CREATOR_ID): Promise<FormUpdate[]> {
  if (isSupabaseConfigured && supabase) {
    const { data: forms, error } = await supabase.from('forms').select('*').eq('creator_id', creatorId)
    if (error) throw error
    const ids = (forms ?? []).map((f) => f.id)
    if (!ids.length) return []
    const { data: resp } = await supabase.from('responses').select('form_id,submitted_at').in('form_id', ids)
    return buildUpdates((forms ?? []) as Form[], resp ?? [])
  }

  const db = readDemo()
  return buildUpdates(
    db.forms.filter((f) => f.creator_id === creatorId),
    db.responses,
  )
}

/** Move a form's watermark to now — called when its results are opened. */
export async function markResponsesSeen(formId: string): Promise<void> {
  const now = new Date().toISOString()
  if (isSupabaseConfigured && supabase) {
    await supabase.from('forms').update({ responses_seen_at: now }).eq('id', formId)
    return
  }
  const db = readDemo()
  db.forms = db.forms.map((f) => (f.id === formId ? { ...f, responses_seen_at: now } : f))
  writeDemo(db)
}

/** Clear every form's unread count at once. */
export async function markAllResponsesSeen(creatorId = DEMO_CREATOR_ID): Promise<void> {
  const now = new Date().toISOString()
  if (isSupabaseConfigured && supabase) {
    await supabase.from('forms').update({ responses_seen_at: now }).eq('creator_id', creatorId)
    return
  }
  const db = readDemo()
  db.forms = db.forms.map((f) => (f.creator_id === creatorId ? { ...f, responses_seen_at: now } : f))
  writeDemo(db)
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

/**
 * Create a form and return it (caller redirects into the builder).
 *
 * It starts on a feedback page with its A/B options rather than empty: comparing
 * two things is what the product is for, it's what the publish gate requires,
 * and an empty builder makes the creator's first move "work out what a page is"
 * instead of "put my designs in".
 */
export async function createForm(mode: FormMode, creatorId = DEMO_CREATOR_ID): Promise<Form> {
  const form = newForm(mode, creatorId)
  const page = newPage(form.id, 'feedback', 0)
  const options = [newOption(form.id, page.id, 0, 0), newOption(form.id, page.id, 1, 1)]
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.from('forms').insert(form).select().single()
    if (error) throw error
    const created = data as Form
    // Children carry the row the DB actually kept, in case it rewrote the id.
    const pageRow = { ...page, form_id: created.id }
    await supabase.from('pages').insert(pageRow)
    await supabase.from('options').insert(options.map((o) => ({ ...o, form_id: created.id, page_id: pageRow.id })))
    return created
  }
  const db = readDemo()
  db.forms.push(form)
  db.pages.push(page)
  db.options.push(...options)
  writeDemo(db)
  return form
}

/** Persist the whole form: its fields plus a full replace of pages/options/widgets. */
export async function saveFullForm(full: FullForm): Promise<void> {
  const { form, pages, options, widgets } = full
  const cleanPages = pages.map((p) => ({ ...p, form_id: form.id }))
  const cleanOptions = options.map((o) => ({ ...o, form_id: form.id }))
  const cleanWidgets = widgets.map((w) => ({ ...w, form_id: form.id }))

  // `responses_seen_at` is owned by the results view, not the builder. The
  // builder holds a form it loaded on mount and autosaves the whole row, so
  // writing this field back would resurrect notifications the creator had
  // already cleared in another tab. Drop it and let markResponsesSeen own it.
  const formFields: Record<string, unknown> = { ...form }
  delete formFields.responses_seen_at

  if (isSupabaseConfigured && supabase) {
    const { error: fe } = await supabase.from('forms').update(formFields).eq('id', form.id)
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
  db.forms = db.forms.map((f) => (f.id === form.id ? { ...form, responses_seen_at: f.responses_seen_at } : f))
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

/**
 * Rename a form from the dashboard. Writes the single column rather than
 * round-tripping the whole row through saveFullForm, which would overwrite the
 * pages and options with whatever this list happens to be holding. Blank hands
 * the name back to the welcome headline (see formName).
 */
export async function renameForm(id: string, name: string): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    await supabase.from('forms').update({ name }).eq('id', id)
    return
  }
  const db = readDemo()
  db.forms = db.forms.map((f) => (f.id === id ? { ...f, name } : f))
  writeDemo(db)
}

/** Record a voter's submission (a chosen option per feedback page + answers). */
/**
 * Thrown when this browser's session has already responded to the form. A
 * sentinel message rather than a raw Postgres error so the voter page can tell
 * "you already voted" apart from a genuine failure without matching on SQLSTATE.
 */
export const ALREADY_RESPONDED = 'already-responded'

export function isAlreadyResponded(e: unknown): boolean {
  return e instanceof Error && e.message === ALREADY_RESPONDED
}

/** Voting is account-based, which needs a real auth backend. Without one the
 *  app falls back to the per-browser rule so the demo stays usable. */
export const VOTING_REQUIRES_LOGIN = isSupabaseConfigured

/** Thrown when a submit is attempted without a signed-in account. */
export const LOGIN_REQUIRED = 'login-required'

/**
 * Thrown when the form isn't taking responses — a draft, a closed form, or one
 * past its expiry. Chiefly this is what stops a creator's own preview of an
 * unpublished form from landing a real response in their tally.
 */
export const FORM_NOT_ACCEPTING = 'form-not-accepting'

export function isFormNotAccepting(e: unknown): boolean {
  return e instanceof Error && e.message === FORM_NOT_ACCEPTING
}

/** A form takes responses only while it is published and unexpired. */
export function acceptsResponses(form: Pick<Form, 'status' | 'expires_at'>): boolean {
  if (form.status !== 'open') return false
  return !form.expires_at || Date.parse(form.expires_at) > Date.now()
}

export function isLoginRequired(e: unknown): boolean {
  return e instanceof Error && e.message === LOGIN_REQUIRED
}

/**
 * Who is voting. Two identities because the rule differs by backend:
 *
 *   • Supabase connected → `userId` is the account, and one account gets one
 *     response per form. `sessionId` still rides along as a record of which
 *     browser it came from, but constrains nothing.
 *   • Demo mode → there are no accounts, so `sessionId` (per browser) stands in.
 *
 * Passing both keeps that choice inside the store rather than at every call.
 */
export interface VoterIdentity {
  userId: string | null
  sessionId: string
}

/**
 * Has this voter already responded to this form?
 *
 * Asks the store rather than trusting a local "I voted" flag. An earlier version
 * kept that flag in localStorage, where it drifted out of sync and showed "you
 * already voted" on forms with zero responses. Derived from the rows, the lock
 * goes away if the responses do.
 */
export async function hasResponded(formId: string, who: VoterIdentity): Promise<boolean> {
  if (isSupabaseConfigured && supabase) {
    // Not signed in: nothing to have responded *as*. The sign-in gate handles it.
    if (!who.userId) return false
    // Readable thanks to the "voter reads own response" policy — scoped to this
    // account's own rows, so it discloses nothing about anyone else.
    const { data, error } = await supabase
      .from('responses')
      .select('id')
      .eq('form_id', formId)
      .eq('voter_id', who.userId)
      .limit(1)
    // Fail open: a network blip shouldn't lock anyone out. The unique index is
    // the real enforcement — this check only front-runs it with a better message.
    if (error) return false
    return (data?.length ?? 0) > 0
  }
  if (!who.sessionId) return false
  return readDemo().responses.some((r) => r.form_id === formId && r.voter_session_id === who.sessionId)
}

/**
 * Load this voter's submitted choices and widget answers for read-only review.
 *
 * The response row is already own-read under RLS; response_answers has the same
 * owner-only select policy. Nothing from another voter can be returned.
 */
export async function getSubmittedResponse(
  formId: string,
  who: VoterIdentity,
): Promise<SubmittedResponse | null> {
  if (isSupabaseConfigured && supabase) {
    if (!who.userId) return null
    const { data: response, error } = await supabase
      .from('responses')
      .select('id,choices')
      .eq('form_id', formId)
      .eq('voter_id', who.userId)
      .maybeSingle()
    if (error || !response) return null

    const { data: answerRows, error: answerError } = await supabase
      .from('response_answers')
      .select('widget_id,value')
      .eq('response_id', response.id)
    // The response itself is the authoritative vote lock. If an older backend
    // has not received the own-answer policy yet, keep the lock and choices
    // working while the answer list temporarily falls back to empty.
    if (answerError) {
      return {
        choices: (response.choices ?? {}) as SubmittedResponse['choices'],
        answers: {},
      }
    }

    return {
      choices: (response.choices ?? {}) as SubmittedResponse['choices'],
      answers: Object.fromEntries(
        (answerRows ?? []).map((row) => [row.widget_id, row.value]),
      ) as SubmittedResponse['answers'],
    }
  }

  if (!who.sessionId) return null
  const db = readDemo()
  const response = db.responses.find(
    (r) => r.form_id === formId && r.voter_session_id === who.sessionId,
  )
  if (!response) return null
  const answers = Object.fromEntries(
    db.answers
      .filter((answer) => answer.response_id === response.id)
      .map((answer) => [answer.widget_id, answer.value]),
  )
  return { choices: response.choices, answers }
}

export async function submitResponse(
  formId: string,
  who: VoterIdentity,
  submitted: SubmittedResponse,
): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    // Belt to the RLS policy's braces: the insert would be rejected anyway, but
    // failing here gives the caller a reason it can act on.
    if (!who.userId) throw new Error(LOGIN_REQUIRED)
    // Same reason, for status: RLS refuses a draft or closed form, but a bare
    // "insert failed" tells the voter nothing.
    const { data: target } = await supabase
      .from('forms')
      .select('status,expires_at')
      .eq('id', formId)
      .maybeSingle()
    if (!target || !acceptsResponses(target as Pick<Form, 'status' | 'expires_at'>)) {
      throw new Error(FORM_NOT_ACCEPTING)
    }
    // The response and every widget answer are written in one database
    // transaction. A failed answer can no longer leave behind an empty response
    // that consumes the account's one allowed submission.
    const { error } = await supabase.rpc('submit_form_response', {
      p_form_id: formId,
      p_voter_session_id: who.sessionId,
      p_choices: submitted.choices,
      p_answers: submitted.answers,
    })
    // 23505 = unique_violation, i.e. the one-response-per-account index. This is
    // the authoritative check: it also catches two tabs submitting at once,
    // which the pre-check cannot.
    if (error?.code === '23505') throw new Error(ALREADY_RESPONDED)
    if (error?.message.includes('Form is not accepting responses')) {
      throw new Error(FORM_NOT_ACCEPTING)
    }
    if (error) throw error
    return
  }

  const responseId = uid()
  const now = new Date().toISOString()
  const answerRows = Object.entries(submitted.answers).map(([widget_id, value]) => ({ widget_id, value }))
  const db = readDemo()
  // Demo mode has no RLS, so the same rule is enforced here: only a published,
  // unexpired form takes responses.
  const target = db.forms.find((f) => f.id === formId)
  if (!target || !acceptsResponses(target)) throw new Error(FORM_NOT_ACCEPTING)
  // No accounts and no unique index either, so the per-browser rule stands in
  // and is enforced here.
  if (db.responses.some((r) => r.form_id === formId && r.voter_session_id === who.sessionId)) {
    throw new Error(ALREADY_RESPONDED)
  }
  db.responses.push({ id: responseId, form_id: formId, voter_session_id: who.sessionId, submitted_at: now, choices: submitted.choices })
  for (const r of answerRows) {
    db.answers.push({ id: uid(), response_id: responseId, widget_id: r.widget_id, value: r.value, upvotes: 0 })
  }
  writeDemo(db)
}

/** One respondent, for the creator-only table on the results page. */
export interface FormVoter {
  responseId: string
  /** The account that responded. Null in demo mode, which has no accounts. */
  email: string | null
  /** Stands in for the account in demo mode — the browser that responded. */
  sessionId: string | null
  submittedAt: string
  /** page_id -> option_id | 'tie', so the table can show what they picked. */
  choices: Record<string, string>
}

/**
 * Who responded to a form, newest first — for the form's creator only.
 *
 * In Supabase mode this is a `security definer` RPC, because the two things it
 * needs are both closed to clients: `auth.users` is unreadable, and `responses`
 * is owner-read. The RPC's own `exists (… creator_id = auth.uid())` clause is
 * the access control, so asking about someone else's form returns an empty set
 * rather than anything to probe. The UI hiding the table is presentation; this
 * is the part that actually keeps it private.
 */
export async function getFormVoters(formId: string): Promise<FormVoter[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('form_voters', { p_form_id: formId })
    if (error) throw error
    return ((data ?? []) as {
      response_id: string
      voter_email: string | null
      submitted_at: string
      choices: Record<string, string> | null
    }[]).map((r) => ({
      responseId: r.response_id,
      email: r.voter_email,
      sessionId: null,
      submittedAt: r.submitted_at,
      choices: r.choices ?? {},
    }))
  }

  // Demo mode has no accounts, so the browser session is the only identity
  // there is to show. The table labels it as such rather than inventing a name.
  return readDemo()
    .responses.filter((r) => r.form_id === formId)
    .sort((a, b) => (a.submitted_at < b.submitted_at ? 1 : -1))
    .map((r) => ({
      responseId: r.id,
      email: null,
      sessionId: r.voter_session_id ?? null,
      submittedAt: r.submitted_at,
      choices: r.choices ?? {},
    }))
}

/** Aggregate results for a form: totals, option split, per-widget breakdown. */
export async function getResults(formId: string): Promise<FormResults> {
  const full = await getFullForm(formId)
  const widgets = full?.widgets ?? []

  let answers: ResponseAnswer[] = []
  let total = 0
  let firstAt: string | null = null
  let lastAt: string | null = null
  let optionCounts: Record<string, number> = {}

  if (isSupabaseConfigured && supabase) {
    // Non-creators cannot read individual response rows through RLS. This RPC
    // returns only aggregate counts and anonymised answers when the creator has
    // enabled voter-facing results; creators retain the full respondent table
    // through the separate form_voters() RPC.
    const { data, error } = await supabase.rpc('form_results', { p_form_id: formId })
    if (error) throw error
    const row = (data?.[0] ?? null) as {
      total: number | string
      first_at: string | null
      last_at: string | null
      option_counts: Record<string, number> | null
      answers: Array<Omit<ResponseAnswer, 'response_id'>> | null
    } | null
    if (row) {
      total = Number(row.total ?? 0)
      firstAt = row.first_at
      lastAt = row.last_at
      optionCounts = row.option_counts ?? {}
      answers = (row.answers ?? []).map((answer) => ({ ...answer, response_id: '' }))
    }
  } else {
    const db = readDemo()
    const responses = db.responses.filter((r) => r.form_id === formId)
    const ids = new Set(responses.map((r) => r.id))
    answers = db.answers.filter((a) => ids.has(a.response_id))
    const times = responses.map((r) => r.submitted_at).sort()
    total = responses.length
    firstAt = times[0] ?? null
    lastAt = times[times.length - 1] ?? null
    // Authored options use their option id. Neutral choices need the page id as
    // well, otherwise two comparisons would be incorrectly pooled together.
    for (const r of responses) {
      for (const [pageId, optionId] of Object.entries(r.choices ?? {})) {
        const key = optionId === 'tie' ? neutralChoiceKey(pageId) : optionId
        optionCounts[key] = (optionCounts[key] ?? 0) + 1
      }
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
    total,
    firstAt,
    lastAt,
    optionCounts,
    widgets: widgetBreakdowns,
  }
}

export async function upvoteAnswer(answerId: string): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.rpc('upvote_form_answer', { p_answer_id: answerId })
    if (error) throw error
    return
  }
  const db = readDemo()
  db.answers = db.answers.map((a) => (a.id === answerId ? { ...a, upvotes: a.upvotes + 1 } : a))
  writeDemo(db)
}

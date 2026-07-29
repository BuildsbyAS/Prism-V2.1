// Shared domain types for Prism v2. These mirror the Supabase schema in
// supabase/schema.sql and are also the shape the demo (localStorage) store uses,
// so the creator + voter UIs never care which backend is live.

export type FormMode = 'simple' | 'canvas'
export type FormStatus = 'draft' | 'open' | 'closed'
// Option media. `image` covers stills and GIFs (a GIF is just an animated one);
// `react` is any hosted web prototype (Vercel and friends); `figma` and
// `protopie` are the two design-tool prototypes, both embedded so voters can
// click through them.
export type EmbedType = 'image' | 'video' | 'react' | 'figma' | 'protopie'
export type WidgetType = 'rating' | 'slider' | 'radio' | 'text' | 'voice'

// A form is an ordered sequence of pages between the welcome and end screens.
//   feedback → options to compare (select) + feedback inputs (voters respond)
//   static   → a context screen (shown, no response collected)
export type PageType = 'feedback' | 'static'

export interface Page {
  id: string
  form_id: string
  type: PageType
  order_index: number
  title: string
  body: string
}

export interface Form {
  id: string
  creator_id: string
  slug: string
  /**
   * What the creator calls this form — dashboard, breadcrumb, results header.
   * Blank until they rename it, and `title` stands in for it while it is, so a
   * new form is known by its welcome headline without duplicating it. Once set,
   * the two are independent. Always read it through `formName()`.
   */
  name: string
  /** The welcome screen's headline — voter-facing copy, not the form's name. */
  title: string
  body_copy: string
  testing_question: string
  usps_metrics: string
  project_brief: string
  hero_image_url: string
  /** Backdrop preset rendered behind the hero media — see lib/hero.ts. */
  hero_bg: string
  /** Dither texture over a gradient backdrop. Ignored for solids and 'none'. */
  hero_dither: boolean
  thank_you_message: string
  mode: FormMode
  status: FormStatus
  /** Which pod owns this form — one of POD_OPTIONS. Asked for at publish. */
  pod: string
  /** Emails who can edit alongside the creator. Added in the publish dialog. */
  collaborators: string[]
  /**
   * When the form stops taking responses (ISO timestamp, end of the chosen day).
   * Asked for at publish; a form past it reads as closed to voters.
   */
  expires_at: string | null
  show_results_to_voters: boolean
  require_voter_login: boolean
  show_time_estimate: boolean
  estimated_minutes: number
  google_sheet_id: string | null
  /** When the creator last opened this form's results — drives "new responses". */
  responses_seen_at: string | null
  results_token: string
  created_at: string
  published_at: string | null
}

export interface Option {
  id: string
  form_id: string
  page_id: string
  name: string
  description: string
  order_index: number
  embed_type: EmbedType
  embed_url: string
  alt_text: string
  is_decorative: boolean
  // A −100…100 brightness delta applied via a CSS filter (0 = untouched). The
  // focal point that sat here went out with the crop it steered — media is
  // contained now — though its columns stay in the schema for old rows.
  brightness: number
  // Static screens just show content (e.g. the current iteration) — they are not
  // a poll choice and don't count toward the option tally.
  is_static: boolean
}

// Per-type widget configuration. Stored as jsonb; discriminated by the widget's
// `type`. Every field is optional so partially-built widgets survive round-trips.
export interface WidgetConfig {
  label?: string
  description?: string
  required?: boolean
  // Whether the question title + description show above the input. Defaults to
  // shown (undefined ⇒ true); toggle off for a bare input (e.g. just stars).
  showTitle?: boolean
  // rating — always a 5-star scale; allow half-star (0.5) increments when set.
  allowHalf?: boolean
  // slider
  min?: number
  max?: number
  minLabel?: string
  maxLabel?: string
  // radio
  choices?: string[]
  // text
  long?: boolean
  placeholder?: string
}

export interface Widget {
  id: string
  form_id: string
  page_id: string
  type: WidgetType
  config: WidgetConfig
  order_index: number
  is_followup: boolean
  branch_condition: unknown | null
}

// A form plus its ordered pages and their children — the unit the builder and
// voter page load. options/widgets carry page_id, so callers group by page.
export interface FullForm {
  form: Form
  pages: Page[]
  options: Option[]
  widgets: Widget[]
}

// The value shape stored per answer, discriminated by the widget type:
//   rating → number, slider → number, radio → string, text → string
export type AnswerValue = number | string

export interface Response {
  id: string
  form_id: string
  voter_session_id: string
  submitted_at: string
  // Per-page option choices (page_id -> option_id | 'tie'). Stored on the
  // response itself — widget answers live in response_answers.
  choices: Record<string, string>
}

export interface ResponseAnswer {
  id: string
  response_id: string
  widget_id: string
  value: AnswerValue
  upvotes: number
}

// A voter's submission: their chosen option per feedback page, plus every widget
// answer across all pages.
export interface SubmittedResponse {
  choices: Record<string, string> // page_id -> option_id (or 'tie')
  answers: Record<string, AnswerValue> // widget_id -> value
}

// Aggregated results for a form, computed by the store / a server route.
export interface FormResults {
  total: number
  firstAt: string | null
  lastAt: string | null
  optionCounts: Record<string, number> // option_id -> vote count
  widgets: WidgetBreakdown[]
}

export interface WidgetBreakdown {
  widget: Widget
  count: number
  average: number | null // rating / slider
  distribution: Record<string, number> // radio choice / rating value -> count
  textAnswers: { id: string; value: string; upvotes: number }[]
}

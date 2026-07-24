// Shared domain types for Prism v2. These mirror the Supabase schema in
// supabase/schema.sql and are also the shape the demo (localStorage) store uses,
// so the creator + voter UIs never care which backend is live.

export type FormMode = 'simple' | 'canvas'
export type FormStatus = 'draft' | 'open' | 'closed'
export type EmbedType = 'image' | 'video' | 'react' | 'figma'
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
  title: string
  body_copy: string
  testing_question: string
  usps_metrics: string
  project_brief: string
  hero_image_url: string
  thank_you_message: string
  mode: FormMode
  status: FormStatus
  show_results_to_voters: boolean
  require_voter_login: boolean
  show_time_estimate: boolean
  estimated_minutes: number
  google_sheet_id: string | null
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
  // Image adjustments. focal_x/y are 0–100 (object-position for the crop);
  // brightness is a −100…100 delta applied via a CSS filter (0 = untouched).
  focal_x: number
  focal_y: number
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

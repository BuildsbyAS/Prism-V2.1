'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Form, Option, Page, Widget } from '@/lib/types'
import { type Readiness, POD_OPTIONS, formName, publishDetailsMissing } from '@/lib/builder'
import { CaretDown, Check, X } from '@phosphor-icons/react'
import { getKnownPeople } from '@/lib/store'
import { personInitials, personName } from '@/lib/format'
import { ALLOWED_EMAIL_DOMAIN } from '@/lib/supabase'
import { EndScreen, sampleResults } from '@/components/EndScreen'
import { InlineTextArea } from './Inline'
import { Field, Toggle } from './controls'
import DatePicker from './DatePicker'

/**
 * `<input type="date">` speaks local calendar days; `expires_at` is an instant.
 * en-CA formats as YYYY-MM-DD, and the stored instant is the end of the chosen
 * day *locally*, so a form set to expire "today" runs until midnight tonight
 * rather than dying at 00:00 UTC halfway through the working day.
 */
function toDateInput(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('en-CA') : ''
}
function fromDateInput(value: string): string | null {
  return value ? new Date(`${value}T23:59:59`).toISOString() : null
}

/**
 * The dialog's own field styling: the shared TextInput hard-codes its classes,
 * and these need an invalid state. Same metrics, so the three controls line up.
 */
function fieldCls(invalid: boolean): string {
  return `w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm outline-none transition placeholder:text-muted ${
    invalid ? 'border-red-500 focus:border-red-500' : 'border-line focus:border-ink'
  }`
}

function FieldError({ show, children }: { show: boolean; children: React.ReactNode }) {
  if (!show) return null
  return (
    <span role="alert" className="mt-1 block text-[13px] text-red-600">
      {children}
    </span>
  )
}

/* ------------------------------ End screen ------------------------------- */

/**
 * The end screen on the canvas — the real thing, with the thank-you message
 * editable in place and a sample tally standing in for responses.
 *
 * The results half is the point: this is the one screen a creator can't reach by
 * previewing their own form (they'd have to submit to it), so "let voters see
 * results" was a toggle whose effect they never saw until strangers had already
 * used the link. Sample data makes the decision visible while it's still theirs
 * to make.
 */
export function EndScreenCenter({
  form,
  pages,
  options,
  widgets,
  onChange,
}: {
  form: Form
  pages: Page[]
  options: Option[]
  widgets: Widget[]
  onChange: (p: Partial<Form>) => void
}) {
  const results = useMemo(
    () => (form.show_results_to_voters ? sampleResults(pages, options, widgets) : null),
    [form.show_results_to_voters, pages, options, widgets],
  )

  return (
    <EndScreen
      headline={form.thank_you_message.trim() ? 'Thanks!' : "Thanks — your feedback's in."}
      message={
        <InlineTextArea
          value={form.thank_you_message}
          onChange={(v) => onChange({ thank_you_message: v })}
          placeholder="Add a line for voters who just submitted… (optional)"
          className="px-3 py-1.5 text-center text-[15px] leading-relaxed"
        />
      }
      results={results}
      pages={pages}
      options={options}
      sample
    />
  )
}

/* ------------------------------ Share dialog ----------------------------- */

export function ShareDialog({
  form,
  publicUrl,
  ready,
  published,
  dirty,
  onChange,
  onPublish,
  onUnpublish,
  onClose,
}: {
  form: Form
  publicUrl: string
  ready: Readiness
  published: boolean
  dirty: boolean
  onChange: (p: Partial<Form>) => void
  onPublish: () => void
  onUnpublish: () => void
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  /**
   * Publish is never disabled for an incomplete form — a dead button doesn't say
   * what's wrong with it. Pressing it validates instead, and from then on each
   * required field marks itself until it's filled.
   */
  const [attempted, setAttempted] = useState(false)

  // Name, pod and expiry are as required as the content checklist: a live form
  // nobody can attribute or that never closes is a form someone has to chase.
  const missing = publishDetailsMissing(form)
  const canPublish = ready.publishable && missing.length === 0
  const nameError = attempted && !formName(form)
  const podError = attempted && !form.pod?.trim()
  const expiryError = attempted && !form.expires_at

  function handlePublish() {
    if (!canPublish) {
      setAttempted(true)
      return
    }
    onPublish()
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function copy() {
    try {
      await navigator.clipboard.writeText(publicUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <div className="u-overlay fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4 py-10 backdrop-blur-sm" onMouseDown={onClose}>
      {/* One column, narrow. It briefly ran two columns to stop the stack
          overflowing a laptop screen; trimming the QR block and the readiness
          checklist took enough height out that the split stopped earning its
          width, and a single column reads as one sequence rather than two. */}
      <div
        className="u-modal w-full max-w-[460px] rounded-[26px] border border-line bg-card p-6 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_24px_60px_-24px_rgba(0,0,0,0.35)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-sans text-[17px] font-semibold tracking-tight">
              {published ? 'Published' : 'Publish form'}
            </h2>
            <p className="mt-0.5 text-[14px] text-muted">
              {published ? 'Live — send the link to voters.' : 'A few details, then you get a link to share.'}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted transition hover:text-ink">
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {/* Who and until when. Asked here rather than in the builder because
            they're about the release, not the form's content — and because
            asking at the last possible moment is what makes them answerable. */}
        <div className="mt-5 space-y-4">
            <Field subtle label="Form name">
              <input
                value={formName(form)}
                onChange={(e) => onChange({ name: e.target.value })}
                placeholder="What your team will call this"
                aria-invalid={nameError}
                className={fieldCls(nameError)}
              />
              <FieldError show={nameError}>Give the form a name.</FieldError>
            </Field>
            {/* Pod and expiry are both narrow — side by side they cost one row
                instead of two. */}
            <div className="grid grid-cols-2 gap-3">
              <Field subtle label="Pod">
                {/* appearance-none drops the platform chevron so the control can
                    wear the same one as the rest of the app. pr-9 keeps the value
                    clear of it. */}
                <div className="relative">
                  <select
                    value={form.pod}
                    onChange={(e) => onChange({ pod: e.target.value })}
                    aria-invalid={podError}
                    className={`${fieldCls(podError)} appearance-none pr-9 ${form.pod ? '' : 'text-muted'}`}
                  >
                    <option value="">Select…</option>
                    {POD_OPTIONS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                  <CaretDown
                    size={14}
                    weight="bold"
                    aria-hidden="true"
                    className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted"
                  />
                </div>
                <FieldError show={podError}>Pick a pod.</FieldError>
              </Field>
              <Field subtle label="Expiry date">
                <DatePicker
                  value={toDateInput(form.expires_at)}
                  min={toDateInput(new Date().toISOString())}
                  onChange={(v) => onChange({ expires_at: fromDateInput(v) })}
                  invalid={expiryError}
                  placeholder="Pick a date"
                />
                <FieldError show={expiryError}>Set an expiry date.</FieldError>
              </Field>
            </div>
            {/* -mx-1 cancels Toggle's own padding so its label starts on the same
                line as the field labels above it. */}
            <div className="-mx-1">
              <Toggle
                checked={form.show_results_to_voters}
                onChange={(v) => onChange({ show_results_to_voters: v })}
                label="Let voters see results"
              />
            </div>
            <CollaboratorPicker
              // ?? [] — demo rows written before the column existed have no
              // array at all, and neither does a Supabase row from an older
              // schema until it's next written.
              value={form.collaborators ?? []}
              onChange={(collaborators) => onChange({ collaborators })}
            />
            {published && (
              <div>
                <p className="mb-1.5 text-[13px] font-medium text-muted">Voter link</p>
                <div className="flex gap-2">
                  <input readOnly value={publicUrl} className="w-full min-w-0 rounded-xl border border-line bg-black/[0.015] px-3.5 py-2.5 text-sm text-muted outline-none" />
                  <button type="button" onClick={copy} className="flex-none rounded-[16px] border border-line-strong px-4 text-[14px] font-semibold transition hover:bg-black/[0.03]">
                    {copied ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Check size={13} weight="bold" aria-hidden="true" />
                        Copied
                      </span>
                    ) : (
                      'Copy'
                    )}
                  </button>
                </div>
              </div>
            )}
        </div>

        {/* The action sits across the foot, with the reason it's blocked beside
            it rather than under it. */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line pt-5">
          {/* The missing *details* now mark their own fields, so this line is
              left to the one blocker that has no field to point at — the form's
              content — and to the unpublish escape hatch. */}
          <p className="min-w-0 flex-1 text-[13px] text-muted">
            {!ready.publishable ? (
              <span className={attempted ? 'text-red-600' : undefined}>
                {published
                  ? 'These changes can’t go live until the checklist is complete.'
                  : 'Complete the introduction page and every Get Vote page to publish.'}
              </span>
            ) : (
              published && (
                <button type="button" onClick={onUnpublish} className="font-medium transition hover:text-ink">
                  Unpublish (back to draft)
                </button>
              )
            )}
          </p>
          <button
            type="button"
            onClick={handlePublish}
            // Only ever disabled when there is genuinely nothing to do — a live
            // form with no unsaved changes. An incomplete one stays clickable and
            // answers with the reasons; see `attempted`.
            disabled={published && !dirty}
            className="flex-none rounded-[16px] bg-ink px-5 py-2.5 text-[14px] font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {!published ? 'Publish form' : dirty ? 'Publish changes' : 'Published — up to date'}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Search-and-add for the people who can edit this form alongside its creator.
 *
 * Suggestions come from `getKnownPeople()` — everyone the workspace has seen —
 * because there is no directory to query. A colleague who hasn't used Prism yet
 * won't be in that list, so a full address typed in and confirmed is accepted
 * too; that's the difference between a picker and a dead end.
 */
function CollaboratorPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [people, setPeople] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let live = true
    getKnownPeople().then((p) => live && setPeople(p))
    return () => {
      live = false
    }
  }, [])

  const q = query.trim().toLowerCase()
  const matches = people
    .filter((p) => !value.includes(p) && (!q || p.toLowerCase().includes(q) || personName(p).toLowerCase().includes(q)))
    .slice(0, 5)
  // A typed-out address counts as a match of its own, so someone new to Prism
  // can still be added.
  const typedIsNew = q.endsWith(ALLOWED_EMAIL_DOMAIN) && !people.includes(q) && !value.includes(q)

  function add(email: string) {
    onChange([...value, email])
    setQuery('')
    setOpen(false)
  }

  return (
    <div>
      <p className="mb-1.5 text-[13px] font-medium text-muted">Collaborators</p>
      {value.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {value.map((email) => (
            <li key={email} className="flex items-center gap-1.5 rounded-full border border-line bg-black/[0.03] py-1 pl-2.5 pr-1.5 text-[13px]">
              <span className="font-medium">{personName(email)}</span>
              <button
                type="button"
                onClick={() => onChange(value.filter((e) => e !== email))}
                aria-label={`Remove ${personName(email)}`}
                className="grid h-4 w-4 place-items-center rounded-full text-muted transition hover:bg-black/[0.08] hover:text-ink"
              >
                <X size={10} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          // A blur that lands on a suggestion would close the list before the
          // click registers, so let the click through first.
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            if (matches[0]) add(matches[0])
            else if (typedIsNew) add(q)
          }}
          placeholder="Search by name or email"
          className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm outline-none placeholder:text-muted focus:border-ink"
        />
        {open && (matches.length > 0 || typedIsNew) && (
          <ul className="u-popover absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-line bg-card py-1 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.3)]">
            {matches.map((email) => (
              <li key={email}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => add(email)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-black/[0.04]"
                >
                  <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-black/[0.06] text-[11px] font-bold">
                    {personInitials(email)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium">{personName(email)}</span>
                    <span className="block truncate text-[13px] text-muted">{email}</span>
                  </span>
                </button>
              </li>
            ))}
            {typedIsNew && (
              <li>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => add(q)}
                  className="w-full px-3 py-2 text-left text-[13px] transition hover:bg-black/[0.04]"
                >
                  Add <span className="font-medium">{q}</span>
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted">They can edit this form with you.</p>
    </div>
  )
}

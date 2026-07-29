'use client'

import { useEffect, useState } from 'react'
import type { Form, Option, Page, PageType, Widget, WidgetType } from '@/lib/types'
import { WIDGET_META, PAGE_META, MAX_WIDGETS } from '@/lib/builder'
import { EMBED_TYPE_LABEL } from '@/lib/embed'
import { HERO_GRADIENTS, HERO_SOLIDS, hasHeroBg, isCustomHeroBg, isHeroGradient } from '@/lib/hero'
import { CaretDown } from '@phosphor-icons/react'
import { Field, Toggle, TextInput, NumberInput } from './controls'

function Group({ title, className = '', children }: { title?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`border-b border-line px-4 py-4 last:border-b-0 ${className}`}>
      {title && <p className="mb-3 text-[14px] font-semibold tracking-tight">{title}</p>}
      <div className="space-y-3">{children}</div>
    </div>
  )
}

export function EmptyProperties({ note }: { note: string }) {
  return <div className="px-4 py-6 text-[13px] leading-relaxed text-muted">{note}</div>
}

/* ---------------------------- Page overview ------------------------------ */

// Slider is hidden for now; Text leads, then Rating, then Voice.
const WIDGET_TYPES: readonly WidgetType[] = ['text', 'rating', 'voice']

const PAGE_TYPES: PageType[] = ['feedback', 'static']

export function PageProperties({
  page,
  widgets,
  widgetsFull,
  selectedInputKey,
  onSelectInput,
  onChangeInputType,
  inputSettings,
  flash,
  onChangeType,
  onAddInput,
  onDeletePage,
  lastPage = false,
  canClear = true,
  onFlashDone,
}: {
  page: Page
  /** This page's feedback inputs, listed under "Feedback inputs". */
  widgets: Widget[]
  widgetsFull: boolean
  selectedInputKey: string | null
  onSelectInput: (key: string) => void
  onChangeInputType: (key: string, type: WidgetType) => void
  /** The selected input's settings, rendered indented under its row. */
  inputSettings?: React.ReactNode
  // Bumped when the canvas "add feedback widget" slot is clicked — flashes the
  // Feedback inputs picker to point the user at the draggable input types.
  flash: boolean
  onChangeType: (t: PageType) => void
  onAddInput: (t: WidgetType) => void
  onDeletePage: () => void
  /** This is the form's only page: it can be emptied, not removed. */
  lastPage?: boolean
  /** False when clearing would do nothing — the page is already empty. */
  canClear?: boolean
  onFlashDone: () => void
}) {
  const feedback = page.type === 'feedback'
  useEffect(() => {
    if (!flash) return
    const t = setTimeout(onFlashDone, 1100)
    return () => clearTimeout(t)
  }, [flash, onFlashDone])
  return (
    <>
      {/* Page type lives here rather than being asked for when the page is added,
          so it stays changeable. Every group below keys off it. Switching to
          static only hides a page's inputs — they come back if you switch back,
          so a mis-click costs nothing. */}
      <Group title="Page type">
        <div className="grid grid-cols-2 gap-1.5">
          {PAGE_TYPES.map((t) => {
            const selected = page.type === t
            const PageIcon = PAGE_META[t].icon
            return (
              <button
                key={t}
                type="button"
                onClick={() => onChangeType(t)}
                aria-pressed={selected}
                className={`flex flex-col items-center gap-1 rounded-xl border px-2.5 py-2.5 text-center transition ${
                  selected ? 'border-ink bg-black/[0.04]' : 'border-line-strong hover:bg-black/[0.03]'
                }`}
              >
                <span className="grid h-6 w-6 place-items-center rounded-lg bg-black/[0.06]">
                  <PageIcon size={14} aria-hidden="true" />
                </span>
                <span className="text-[13px] font-medium leading-tight">{PAGE_META[t].label}</span>
              </button>
            )
          })}
        </div>
        <p className="text-[13px] leading-relaxed text-muted">{PAGE_META[page.type].hint}.</p>
      </Group>
      {/* Neither page type gets an add button here: the canvas ends its grid with
          an "+ Add option" / "+ Add media" card sitting exactly where the new
          one appears, so a second button in this rail is the same action twice,
          further from the thing it affects. */}
      {/* The page's inputs are listed here, and the selected one's settings open
          indented underneath its row. Selecting an input used to replace this
          whole panel with the input's config, which hid the page it belongs to
          and made "where am I" a question — the panel now stays put and only
          grows a branch. */}
      {feedback && (
        <Group title="Feedback inputs" className={flash ? 'u-flash' : ''}>
          {widgets.map((w) => {
            const open = selectedInputKey === w.id
            const InputIcon = WIDGET_META[w.type].icon
            return (
              <div key={w.id}>
                {/* This row *is* the type control — a transparent native select
                    laid over it, the same trick the custom-colour swatch uses.
                    It read as a dropdown (it has the chevron) while a second
                    "Type" field inside the settings did the actual switching:
                    two controls, one job. Focusing it also selects the input, so
                    touching the row opens its settings underneath. */}
                <div
                  // Pointer selects, focus covers the keyboard: the settings have
                  // to open on the way *in* to the row, not only once the native
                  // menu has been dealt with.
                  onMouseDown={() => onSelectInput(w.id)}
                  className={`relative flex items-center gap-2 rounded-xl border px-3 py-2 transition ${
                    open ? 'border-ink bg-black/[0.04]' : 'border-line-strong hover:bg-black/[0.03]'
                  }`}
                >
                  <span className="grid h-6 w-6 flex-none place-items-center rounded-md bg-black/[0.06]">
                    <InputIcon size={14} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{WIDGET_META[w.type].label}</span>
                  <CaretDown size={13} aria-hidden="true" className="flex-none text-muted" />
                  <select
                    value={w.type}
                    aria-label="Feedback input type"
                    onFocus={() => onSelectInput(w.id)}
                    onChange={(e) => onChangeInputType(w.id, e.target.value as WidgetType)}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  >
                    {WIDGET_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {WIDGET_META[t].label}
                      </option>
                    ))}
                  </select>
                </div>
                {open && inputSettings && (
                  // The rule is the indent: it ties the settings to the row they
                  // belong to, so a long config still reads as part of this input.
                  <div className="ml-3 mt-2.5 border-l border-line pl-3.5">{inputSettings}</div>
                )}
              </div>
            )
          })}
          {!widgetsFull && <AddInputMenu full={widgetsFull} onAdd={onAddInput} />}
          {widgetsFull && (
            <p className="text-[13px] text-muted">{MAX_WIDGETS === 1 ? 'One input per page.' : `Up to ${MAX_WIDGETS} inputs.`}</p>
          )}
        </Group>
      )}
      <Group>
        {/* The confirmation lives in the builder, so it can decide from the
            page's contents whether to ask at all — and, on the last page, offer
            to empty it instead of removing it. */}
        <DeleteButton
          label={lastPage ? 'Clear page' : 'Delete page'}
          onDelete={onDeletePage}
          immediate
          disabled={lastPage && !canClear}
        />
        {lastPage && (
          <p className="text-[13px] leading-relaxed text-muted">
            {canClear
              ? 'A form needs one page, so this one can only be emptied. Add another page to delete it.'
              : 'A form needs one page. This one is already empty.'}
          </p>
        )}
      </Group>
    </>
  )
}

/**
 * The three input types, laid out and styled exactly like the Page type picker
 * above: one row of equal tiles, glyph over label. They're the same kind of
 * choice — pick a shape for this thing — so they shouldn't look like a different
 * kind of control two sections apart. Three across also fits the rail, where the
 * old two-column list left Voice stranded on a second row on its own.
 */
function AddInputMenu({ full, onAdd }: { full: boolean; onAdd: (t: WidgetType) => void }) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {WIDGET_TYPES.map((t) => {
        const TypeIcon = WIDGET_META[t].icon
        return (
        <button
          key={t}
          type="button"
          disabled={full}
          onClick={() => onAdd(t)}
          draggable={!full}
          onDragStart={(e) => e.dataTransfer.setData('widget-type', t)}
          title="Click to add, or drag onto the widget slot"
          className="flex cursor-grab flex-col items-center gap-1 rounded-xl border border-line-strong px-2.5 py-2.5 text-center transition hover:bg-black/[0.03] active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="grid h-6 w-6 place-items-center rounded-lg bg-black/[0.06]">
            <TypeIcon size={14} aria-hidden="true" />
          </span>
          <span className="text-[13px] font-medium leading-tight">{WIDGET_META[t].label}</span>
        </button>
        )
      })}
    </div>
  )
}

/* -------------------------------- Option --------------------------------- */

const ALT_MAX = 125

export function OptionProperties({
  option,
  heading,
  flash = false,
  onChange,
  onDelete,
  onOpenMedia,
  allowDecorative = false,
}: {
  option: Option
  /** Names the option these settings belong to — they now sit below the page's
   *  own properties rather than replacing them, so they have to say whose. */
  heading?: string
  /** Pulses that heading — set when the panel had to scroll to bring it in. */
  flash?: boolean
  onChange: (p: Partial<Option>) => void
  onDelete: () => void
  onOpenMedia: () => void
  // Decorative only makes sense for context/welcome imagery — not the media being
  // compared on a feedback page (that's the content, never decorative).
  allowDecorative?: boolean
}) {
  return (
    <>
      {heading && (
        // data-option-panel is how the builder finds this section to scroll the
        // properties column to it — selecting an option on the canvas appends
        // these settings below the page's own, often past the fold.
        <p
          data-option-panel
          className={`border-b border-line bg-black/[0.02] px-4 py-2.5 text-[13px] font-semibold tracking-tight ${
            flash ? 'u-flash' : ''
          }`}
        >
          {heading}
        </p>
      )}
      <Group title="Media">
        <div className="flex items-center justify-between gap-2 rounded-xl border border-line px-3.5 py-2.5">
          <span className="text-[13px] font-medium">
            {option.embed_url ? EMBED_TYPE_LABEL[option.embed_type] : 'No media yet'}
          </span>
          <button type="button" onClick={onOpenMedia} className="rounded-[14px] border border-line-strong px-3 py-1.5 text-[13px] font-semibold transition hover:bg-black/[0.03]">
            {option.embed_url ? 'Change' : 'Add media'}
          </button>
        </div>
      </Group>

      {option.embed_type === 'image' && option.embed_url && (
        <Group title="Alt text">
          <div>
            <textarea
              value={option.alt_text}
              onChange={(e) => onChange({ alt_text: e.target.value.slice(0, ALT_MAX) })}
              disabled={option.is_decorative}
              rows={2}
              placeholder="Describe the image for screen readers…"
              className="w-full resize-none rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm outline-none placeholder:text-muted focus:border-ink disabled:opacity-50"
            />
            <p className="mt-1 text-right text-[13px] text-muted">
              {option.alt_text.length}/{ALT_MAX}
            </p>
          </div>
          {allowDecorative && (
            <Toggle
              checked={option.is_decorative}
              onChange={(v) => onChange({ is_decorative: v })}
              label="Decorative image"
              hint="Hidden from screen readers — no alt text needed."
            />
          )}
        </Group>
      )}

      {/* No focal-point picker: it steered a 4:3 crop that no longer happens —
          media is contained everywhere now, so there is nothing to re-centre. */}
      {option.embed_type === 'image' && option.embed_url && (
        <>
          <Group title="Brightness">
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={-100}
                max={100}
                value={option.brightness}
                onChange={(e) => onChange({ brightness: Number(e.target.value) })}
                className="w-full accent-[#18191d]"
              />
              <span className="w-10 flex-none rounded-lg border border-line px-2 py-1 text-center text-[13px] tabular-nums text-muted">
                {option.brightness}
              </span>
            </div>
          </Group>
        </>
      )}

      <Group>
        <DeleteButton label="Delete option" onDelete={onDelete} />
      </Group>
    </>
  )
}

/* ------------------------------ Input config ----------------------------- */

export function InputProperties({
  widget,
  onChange,
  onDelete,
}: {
  widget: Widget
  onChange: (p: Partial<Widget>) => void
  onDelete: () => void
}) {
  const c = widget.config
  const setConfig = (patch: Partial<typeof c>) => onChange({ config: { ...c, ...patch } })

  // Bare blocks, not `Group`s: this only ever renders indented inside the page's
  // "Feedback inputs" group, where a second set of section rules and headings
  // would read as siblings of the page's own sections rather than a branch off
  // one row. The row above it names the input *and* switches its type, so there
  // is no Type field here — it would be the second control for the same job.
  return (
    <div className="space-y-3">
      <div className="space-y-3">
        {widget.type === 'rating' && (
          <Toggle checked={Boolean(c.allowHalf)} onChange={(allowHalf) => setConfig({ allowHalf })} label="Allow half stars" hint="Let voters pick half-star ratings (e.g. 3.5)." />
        )}
        {widget.type === 'slider' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Min"><NumberInput value={c.min ?? 0} onChange={(min) => setConfig({ min })} /></Field>
              <Field label="Max"><NumberInput value={c.max ?? 100} onChange={(max) => setConfig({ max })} /></Field>
            </div>
            <Field label="Left label"><TextInput value={c.minLabel ?? ''} onChange={(e) => setConfig({ minLabel: e.target.value })} /></Field>
            <Field label="Right label"><TextInput value={c.maxLabel ?? ''} onChange={(e) => setConfig({ maxLabel: e.target.value })} /></Field>
          </>
        )}
        {widget.type === 'radio' && <ChoicesEditor choices={c.choices ?? []} onChange={(choices) => setConfig({ choices })} />}
        {widget.type === 'text' && (
          <Field label="Placeholder"><TextInput value={c.placeholder ?? ''} onChange={(e) => setConfig({ placeholder: e.target.value })} /></Field>
        )}
      </div>

      <div className="space-y-3 border-t border-line pt-3">
        <Toggle
          checked={c.showTitle !== false}
          onChange={(showTitle) => setConfig({ showTitle })}
          label="Show title & description"
          hint="Display the question and its description above the input."
        />
        <Toggle checked={Boolean(c.required)} onChange={(required) => setConfig({ required })} label="Required" hint="Voters must answer before submitting." />
        {widget.type === 'text' && (
          <Toggle checked={Boolean(c.long)} onChange={(long) => setConfig({ long })} label="Long answer" hint="A paragraph box instead of one line." />
        )}
        <DeleteButton label="Delete input" onDelete={onDelete} />
      </div>
    </div>
  )
}

function DeleteButton({
  label,
  onDelete,
  /**
   * Skip the inline "are you sure" step. Used where the caller runs its own
   * confirmation (deleting a page opens a dialog when the page has content),
   * so the creator isn't asked to confirm twice.
   */
  immediate = false,
  disabled = false,
}: {
  label: string
  onDelete: () => void
  immediate?: boolean
  disabled?: boolean
}) {
  const [confirming, setConfirming] = useState(false)
  if (confirming && !immediate) {
    return (
      <div className="flex items-center gap-2">
        <button type="button" onClick={onDelete} className="flex-1 rounded-xl bg-red-600 py-2 text-[13px] font-semibold text-white transition hover:opacity-90">
          {label}
        </button>
        <button type="button" onClick={() => setConfirming(false)} className="rounded-xl border border-line-strong px-3 py-2 text-[13px] font-medium transition hover:bg-black/[0.03]">
          Cancel
        </button>
      </div>
    )
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => (immediate ? onDelete() : setConfirming(true))}
      className="w-full rounded-xl border border-line-strong py-2 text-[13px] font-medium text-red-600 transition hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:text-muted disabled:hover:bg-transparent"
    >
      {label}
    </button>
  )
}

function ChoicesEditor({ choices, onChange }: { choices: string[]; onChange: (c: string[]) => void }) {
  return (
    <Field label="Choices">
      <div className="space-y-2">
        {choices.map((choice, i) => (
          <div key={i} className="flex gap-2">
            <TextInput value={choice} onChange={(e) => onChange(choices.map((x, j) => (j === i ? e.target.value : x)))} />
            <button type="button" onClick={() => onChange(choices.filter((_, j) => j !== i))} aria-label="Remove choice" className="flex-none rounded-xl border border-line-strong px-3 text-muted transition hover:text-red-600">
              ×
            </button>
          </div>
        ))}
        <button type="button" onClick={() => onChange([...choices, `Option ${choices.length + 1}`])} className="w-full rounded-xl border border-dashed border-line-strong py-2 text-[13px] font-medium text-muted transition hover:bg-black/[0.03]">
          + Add choice
        </button>
      </div>
    </Field>
  )
}

/* -------------------------------- Welcome -------------------------------- */

function Swatch({
  label,
  css,
  selected,
  onClick,
}: {
  label: string
  css: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={selected}
      onClick={onClick}
      className={`h-8 w-8 rounded-full border transition ${
        selected ? 'border-ink ring-2 ring-black/[0.14] ring-offset-1' : 'border-line-strong hover:border-ink/40'
      }`}
      style={{ background: css }}
    />
  )
}

function HeroBackdropField({
  value,
  onChange,
  dither,
  onDitherChange,
}: {
  value: string
  onChange: (v: string) => void
  dither: boolean
  onDitherChange: (v: boolean) => void
}) {
  const custom = isCustomHeroBg(value)
  return (
    <Group title="Media backdrop">
      <div className="space-y-3.5">
        <div>
          <p className="mb-1.5 text-[13px] text-muted">Gradients</p>
          <div className="flex flex-wrap gap-2">
            {HERO_GRADIENTS.map((p) => (
              <Swatch key={p.value} label={p.label} css={p.css} selected={value === p.value} onClick={() => onChange(p.value)} />
            ))}
          </div>
        </div>

        {/* Only meaningful over a gradient — a flat fill has no banding to break
            up — so the control appears with the thing it affects. */}
        {isHeroGradient(value) && (
          <Toggle
            checked={dither !== false}
            onChange={onDitherChange}
            label="Dither texture"
            hint="Pixel and character stipple over the gradient."
          />
        )}

        <div>
          <p className="mb-1.5 text-[13px] text-muted">Solids</p>
          <div className="flex flex-wrap gap-2">
            {HERO_SOLIDS.map((p) => (
              <Swatch key={p.value} label={p.label} css={p.css} selected={value === p.value} onClick={() => onChange(p.value)} />
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label
            title="Custom colour"
            className={`relative h-8 w-8 shrink-0 cursor-pointer overflow-hidden rounded-full border transition ${
              custom ? 'border-ink ring-2 ring-black/[0.14] ring-offset-1' : 'border-line-strong hover:border-ink/40'
            }`}
            style={{
              background: custom
                ? value
                : 'conic-gradient(#ff5f6d,#ffc371,#47e5bc,#4facfe,#c471f5,#ff5f6d)',
            }}
          >
            <input
              type="color"
              aria-label="Custom colour"
              value={custom ? value : '#6b7cff'}
              onChange={(e) => onChange(e.target.value)}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
          <span className="text-[13px] text-muted">{custom ? value : 'Custom colour'}</span>
          <button
            type="button"
            onClick={() => onChange('none')}
            className={`ml-auto rounded-[12px] border px-2.5 py-1 text-[13px] font-medium transition ${
              !hasHeroBg(value)
                ? 'border-ink bg-ink text-white'
                : 'border-line-strong text-muted hover:bg-black/[0.03] hover:text-ink'
            }`}
          >
            None
          </button>
        </div>
      </div>
    </Group>
  )
}

export function WelcomeProperties({ form, onChange }: { form: Form; onChange: (p: Partial<Form>) => void }) {
  return (
    <>
      {form.hero_image_url && (
        <HeroBackdropField
          value={form.hero_bg}
          onChange={(v) => onChange({ hero_bg: v })}
          dither={form.hero_dither}
          onDitherChange={(v) => onChange({ hero_dither: v })}
        />
      )}
      <Group>
        <Toggle
          checked={form.show_time_estimate}
          onChange={(v) => onChange({ show_time_estimate: v })}
          label="Show time to complete"
          hint="Adds a “takes X minutes” note under the Start button."
        />
        {form.show_time_estimate && (
          <Field label="Estimated minutes">
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={20}
                value={form.estimated_minutes}
                onChange={(e) => onChange({ estimated_minutes: Number(e.target.value) })}
                className="w-full accent-[#18191d]"
              />
              <span className="w-10 flex-none rounded-lg border border-line px-2 py-1 text-center text-[13px] tabular-nums text-muted">
                {form.estimated_minutes}
              </span>
            </div>
          </Field>
        )}
      </Group>
    </>
  )
}

/* ------------------------------ End screen ------------------------------- */

export function EndProperties({ form, onChange }: { form: Form; onChange: (p: Partial<Form>) => void }) {
  return (
    <Group title="After submitting">
      <Toggle checked={form.show_results_to_voters} onChange={(v) => onChange({ show_results_to_voters: v })} label="Let voters see results" hint="Show the aggregate tally on this screen after they submit." />
    </Group>
  )
}

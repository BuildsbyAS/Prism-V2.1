'use client'

import { useEffect, useRef, useState } from 'react'
import type { Form, Option, Page, Widget, WidgetType } from '@/lib/types'
import { WIDGET_META, PAGE_META, MAX_WIDGETS } from '@/lib/builder'
import { EMBED_TYPE_LABEL } from '@/lib/embed'
import { imageAdjustStyle } from '@/lib/image'
import { Field, Toggle, TextInput, NumberInput } from './controls'
import HoverHighlight from '@/components/HoverHighlight'

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

export function PageProperties({
  page,
  optionFull,
  widgetsFull,
  flash,
  onAddOption,
  onAddInput,
  onDeletePage,
  onFlashDone,
}: {
  page: Page
  optionFull: boolean
  widgetsFull: boolean
  // Bumped when the canvas "add feedback widget" slot is clicked — flashes the
  // Feedback inputs picker to point the user at the draggable input types.
  flash: boolean
  onAddOption: () => void
  onAddInput: (t: WidgetType) => void
  onDeletePage: () => void
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
      <Group title={PAGE_META[page.type].label}>
        <p className="text-[13px] leading-relaxed text-muted">{PAGE_META[page.type].hint}.</p>
      </Group>
      <Group title={feedback ? 'Options' : 'Media'}>
        <button
          type="button"
          disabled={optionFull}
          onClick={onAddOption}
          className="w-full rounded-xl border border-line-strong py-2 text-[13px] font-medium text-ink transition hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-40"
        >
          + Add {feedback ? 'option' : 'media'}
        </button>
        <p className="text-[13px] text-muted">Up to 4.</p>
      </Group>
      {feedback && (
        <Group title="Feedback inputs" className={flash ? 'u-flash' : ''}>
          <AddInputMenu full={widgetsFull} onAdd={onAddInput} />
          {widgetsFull && <p className="text-[13px] text-muted">{MAX_WIDGETS === 1 ? 'One input per page.' : `Up to ${MAX_WIDGETS} inputs.`}</p>}
          <p className="text-[13px] leading-relaxed text-muted">Select an option or input in the canvas to configure it.</p>
        </Group>
      )}
      <Group>
        <DeleteButton label="Delete page" onDelete={onDeletePage} />
      </Group>
    </>
  )
}

function AddInputMenu({ full, onAdd }: { full: boolean; onAdd: (t: WidgetType) => void }) {
  return (
    <HoverHighlight className="grid grid-cols-2 gap-2" radius={12}>
      {WIDGET_TYPES.map((t) => (
        <button
          key={t}
          type="button"
          disabled={full}
          onClick={() => onAdd(t)}
          draggable={!full}
          onDragStart={(e) => e.dataTransfer.setData('widget-type', t)}
          data-hl
          title="Click to add, or drag onto the widget slot"
          className="relative flex cursor-grab items-center gap-2 rounded-xl border border-line-strong px-3 py-2 text-left transition active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="grid h-6 w-6 flex-none place-items-center rounded-md bg-black/[0.06] text-[13px] font-bold">{WIDGET_META[t].glyph}</span>
          <span className="text-[13px] font-medium">{WIDGET_META[t].label}</span>
        </button>
      ))}
    </HoverHighlight>
  )
}

/* -------------------------------- Option --------------------------------- */

const ALT_MAX = 125

export function OptionProperties({
  option,
  onChange,
  onDelete,
  onOpenMedia,
  allowDecorative = false,
}: {
  option: Option
  onChange: (p: Partial<Option>) => void
  onDelete: () => void
  onOpenMedia: () => void
  // Decorative only makes sense for context/welcome imagery — not the media being
  // compared on a feedback page (that's the content, never decorative).
  allowDecorative?: boolean
}) {
  return (
    <>
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

      {option.embed_type === 'image' && option.embed_url && (
        <>
          <Group title="Focal point">
            <FocalPicker option={option} onChange={onChange} />
          </Group>
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

function FocalPicker({ option, onChange }: { option: Option; onChange: (p: Partial<Option>) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  function setPoint(e: React.PointerEvent) {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const x = Math.round(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)))
    const y = Math.round(Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)))
    onChange({ focal_x: x, focal_y: y })
  }

  return (
    <div>
      <div
        ref={ref}
        onPointerDown={(e) => {
          dragging.current = true
          e.currentTarget.setPointerCapture(e.pointerId)
          setPoint(e)
        }}
        onPointerMove={(e) => dragging.current && setPoint(e)}
        onPointerUp={(e) => {
          dragging.current = false
          e.currentTarget.releasePointerCapture(e.pointerId)
        }}
        className="relative aspect-[4/3] w-full cursor-crosshair select-none overflow-hidden rounded-2xl border border-line"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={option.embed_url}
          alt=""
          draggable={false}
          className="h-full w-full object-cover"
          style={imageAdjustStyle(option.focal_x, option.focal_y, option.brightness)}
        />
        <span
          className="pointer-events-none absolute h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1.5px_rgba(0,0,0,0.35)] transition-[left,top] duration-75"
          style={{ left: `${option.focal_x}%`, top: `${option.focal_y}%` }}
        >
          <span className="absolute inset-[5px] rounded-full border border-white/70" />
        </span>
      </div>
      <button
        type="button"
        onClick={() => onChange({ focal_x: 50, focal_y: 50 })}
        className="mt-2 w-full rounded-xl border border-line-strong py-1.5 text-[13px] font-medium text-muted transition hover:bg-black/[0.03] hover:text-ink"
      >
        Reset
      </button>
    </div>
  )
}

/* ------------------------------ Input config ----------------------------- */

export function InputProperties({
  widget,
  onChange,
  onChangeType,
  onDelete,
}: {
  widget: Widget
  onChange: (p: Partial<Widget>) => void
  onChangeType: (t: WidgetType) => void
  onDelete: () => void
}) {
  const c = widget.config
  const setConfig = (patch: Partial<typeof c>) => onChange({ config: { ...c, ...patch } })

  return (
    <>
      <Group title={WIDGET_META[widget.type].label}>
        <Field label="Type">
          <select
            value={widget.type}
            onChange={(e) => onChangeType(e.target.value as WidgetType)}
            className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-ink"
          >
            {WIDGET_TYPES.map((t) => (
              <option key={t} value={t}>
                {WIDGET_META[t].label}
              </option>
            ))}
          </select>
        </Field>

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
      </Group>

      <Group title="Options">
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
      </Group>
    </>
  )
}

function DeleteButton({ label, onDelete }: { label: string; onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false)
  if (confirming) {
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
    <button type="button" onClick={() => setConfirming(true)} className="w-full rounded-xl border border-line-strong py-2 text-[13px] font-medium text-red-600 transition hover:bg-black/[0.03]">
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

export function WelcomeProperties({ form, onChange }: { form: Form; onChange: (p: Partial<Form>) => void }) {
  return (
    <>
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

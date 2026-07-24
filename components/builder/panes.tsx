'use client'

import { useState } from 'react'
import type { Form, Option, Page, Widget, WidgetType } from '@/lib/types'
import { MAX_WIDGETS } from '@/lib/builder'
import { EMBED_TYPE_LABEL, hostnameOf } from '@/lib/embed'
import { imageAdjustStyle } from '@/lib/image'
import WidgetInput from '@/components/WidgetInput'
import Tooltip from '@/components/Tooltip'
import { InlineInput, InlineTextArea } from './Inline'
import { MicroLabel } from './controls'
import ImageUpload from './ImageUpload'

/* ------------------------------- Welcome --------------------------------- */

export function WelcomeCenter({ form, onChange, onOpenHeroMedia }: { form: Form; onChange: (p: Partial<Form>) => void; onOpenHeroMedia?: () => void }) {
  return (
    <div className="flex w-full flex-col gap-6 @3xl:flex-row @3xl:items-stretch @3xl:gap-8">
      <div className="flex flex-1 flex-col justify-center gap-16">
        {/* Group 1 — title + body */}
        <div className="flex flex-col gap-2">
          <InlineTextArea value={form.title} onChange={(v) => onChange({ title: v })} placeholder="What are we testing?" className="px-2 py-1 text-3xl font-semibold leading-tight tracking-tight sm:text-[34px]" />
          <InlineTextArea value={form.body_copy} onChange={(v) => onChange({ body_copy: v })} placeholder="Add the context voters read before they start…" className="px-2 py-1 text-[15px] leading-relaxed text-muted" />
        </div>
        {/* Group 2 — project brief + USPs/metrics */}
        <div className="flex flex-col gap-4">
          <div>
            <MicroLabel>Project brief</MicroLabel>
            <InlineTextArea value={form.project_brief} onChange={(v) => onChange({ project_brief: v })} placeholder="Background for the decision…" className="px-2 py-1 text-[15px] leading-relaxed text-muted" />
          </div>
          <div>
            <MicroLabel>USPs / metrics impacted</MicroLabel>
            <InlineInput value={form.usps_metrics} onChange={(v) => onChange({ usps_metrics: v })} placeholder="Conversion, clarity…" className="px-2 py-1 text-[15px] leading-relaxed text-muted" />
          </div>
        </div>
      </div>
      <div className="w-full @3xl:w-[360px]">
        <ImageUpload value={form.hero_image_url} onChange={(v) => onChange({ hero_image_url: v })} onClickUpload={onOpenHeroMedia} />
      </div>
    </div>
  )
}

/* ------------------------------- Page ------------------------------------ */

export function PageCenter({
  page,
  options,
  widgets,
  selectedOptionKey,
  selectedInputKey,
  onPageChange,
  onSelectOption,
  onSelectInput,
  onAddOption,
  onDeleteOption,
  onOpenMedia,
  onAddInput,
  onDeleteInput,
  onFlashInputs,
  patchOption,
  patchWidget,
  optionFull,
}: {
  page: Page
  options: Option[]
  widgets: Widget[]
  selectedOptionKey: string | null
  selectedInputKey: string | null
  onPageChange: (p: Partial<Page>) => void
  onSelectOption: (key: string) => void
  onSelectInput: (key: string) => void
  onAddOption: () => void
  onDeleteOption: (key: string) => void
  onOpenMedia: (key: string) => void
  onAddInput: (t: WidgetType) => void
  onDeleteInput: (key: string) => void
  onFlashInputs: () => void
  patchOption: (key: string, p: Partial<Option>) => void
  patchWidget: (key: string, p: Partial<Widget>) => void
  optionFull: boolean
}) {
  const feedback = page.type === 'feedback'
  return (
    <div className="space-y-8">
      {/* Page heading */}
      <div className="flex flex-col">
        <InlineTextArea
          value={page.title}
          onChange={(v) => onPageChange({ title: v })}
          placeholder={feedback ? 'What are we comparing?' : 'Section title'}
          className="px-0 py-1 text-2xl font-semibold tracking-tight"
        />
        <InlineTextArea
          value={page.body}
          onChange={(v) => onPageChange({ body: v })}
          placeholder="Add context for this page… (optional)"
          className="px-0 py-1 text-[15px] leading-relaxed text-muted"
        />
      </div>

      {/* Options / media */}
      <section>
        <p className="mb-3 text-[13px] font-medium text-muted">
          {feedback ? `Options to compare · ${options.length}/4` : `Media · ${options.length}`}
        </p>
        <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-2">
          {options.map((o, i) => (
            <OptionCard
              key={o.id}
              option={o}
              letter={String.fromCharCode(65 + i)}
              selected={selectedOptionKey === o.id}
              onSelect={() => onSelectOption(o.id)}
              onChange={(p) => patchOption(o.id, p)}
              onDelete={() => onDeleteOption(o.id)}
              onOpenMedia={() => onOpenMedia(o.id)}
            />
          ))}
          {!optionFull && (
            <button
              type="button"
              onClick={onAddOption}
              className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong text-[14px] font-medium text-muted transition hover:border-ink hover:text-ink"
            >
              <span className="text-2xl leading-none">+</span>
              <span className="mt-1.5">{feedback ? 'Add option' : 'Add media'}</span>
            </button>
          )}
        </div>
      </section>

      {/* Feedback inputs — feedback pages only */}
      {feedback && (
        <section>
          <div className="space-y-3">
            {widgets.map((w) => (
              <InputCard
                key={w.id}
                widget={w}
                selected={selectedInputKey === w.id}
                onSelect={() => onSelectInput(w.id)}
                onChange={(p) => patchWidget(w.id, p)}
                onDelete={() => onDeleteInput(w.id)}
              />
            ))}
            {widgets.length < MAX_WIDGETS && <WidgetSlot onAddInput={onAddInput} onClick={onFlashInputs} />}
          </div>
        </section>
      )}
    </div>
  )
}

function OptionCard({
  option,
  letter,
  selected,
  onSelect,
  onChange,
  onDelete,
  onOpenMedia,
}: {
  option: Option
  letter: string
  selected: boolean
  onSelect: () => void
  onChange: (p: Partial<Option>) => void
  onDelete: () => void
  onOpenMedia: () => void
}) {
  return (
    <div
      onClick={onSelect}
      className={`group flex cursor-pointer flex-col overflow-hidden rounded-2xl border bg-card transition ${selected ? 'border-ink' : 'border-line hover:border-line-strong'}`}
    >
      <div className="flex items-start gap-2 border-b border-line px-4 py-2.5">
        <span className="mt-1 grid h-6 w-6 flex-none place-items-center rounded-md bg-black/[0.06] text-[13px] font-bold">{letter}</span>
        <div className="min-w-0 flex-1" onClick={(e) => e.stopPropagation()}>
          <InlineInput value={option.name} onChange={(v) => onChange({ name: v })} placeholder="Option name" className="px-1.5 py-0.5 text-[15px] font-semibold tracking-tight" />
          <InlineInput value={option.description} onChange={(v) => onChange({ description: v })} placeholder="One line on what's different" className="px-1.5 py-0.5 text-[13px] leading-relaxed text-muted" />
        </div>
        <Tooltip label="Delete" className="mt-0.5 flex-none opacity-0 transition group-hover:opacity-100">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            aria-label="Delete option"
            className="text-muted transition hover:text-red-600"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2m-8 0 1 13h8l1-13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </Tooltip>
      </div>
      <div className="group/media relative w-full">
        <MediaThumb option={option} />
        {option.embed_url ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/25 opacity-0 transition group-hover/media:opacity-100">
            <div className="flex items-center gap-1.5">
              <MediaIconBtn tip="Change" onClick={onOpenMedia}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="7" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.7" /><path d="M8 4h11a2 2 0 0 1 2 2v9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /><circle cx="7" cy="11" r="1.4" fill="currentColor" /><path d="m3 16 3.5-3 3 2.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </MediaIconBtn>
              <MediaIconBtn tip="Edit" onClick={onSelect}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8h9M17 8h3M4 16h3M11 16h9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /><circle cx="15" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.7" /><circle cx="9" cy="16" r="2.2" stroke="currentColor" strokeWidth="1.7" /></svg>
              </MediaIconBtn>
              <MediaIconBtn tip="Delete" onClick={() => onChange({ embed_url: '' })}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2m-8 0 1 13h8l1-13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </MediaIconBtn>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onOpenMedia()
            }}
            className="absolute inset-0"
            aria-label="Upload media"
          />
        )}
      </div>
    </div>
  )
}

function MediaIconBtn({ tip, onClick, children }: { tip: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <div className="group/btn relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onClick()
        }}
        aria-label={tip}
        className="grid h-9 w-9 place-items-center rounded-xl bg-ink/85 text-white transition hover:bg-ink"
      >
        {children}
      </button>
      <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink px-2 py-1 text-[13px] font-medium text-white opacity-0 transition group-hover/btn:opacity-100">
        {tip}
      </span>
    </div>
  )
}

function MediaThumb({ option }: { option: Option }) {
  if (!option.embed_url) {
    return <div className="flex h-44 items-center justify-center bg-black/[0.015] text-[13px] text-muted">Upload media</div>
  }
  if (option.embed_type === 'image') {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={option.embed_url}
        alt={option.is_decorative ? '' : option.alt_text || option.name}
        style={imageAdjustStyle(option.focal_x, option.focal_y, option.brightness)}
        className="h-44 w-full object-cover"
      />
    )
  }
  const host = hostnameOf(option.embed_url)
  return (
    <div className="flex h-44 flex-col items-center justify-center gap-1 bg-black/[0.015] text-center">
      <span className="text-[14px] font-medium">{EMBED_TYPE_LABEL[option.embed_type]}</span>
      {host && <span className="max-w-[80%] truncate text-[13px] text-muted">{host}</span>}
      <span className="mt-1 text-[13px] text-muted">Live in Preview</span>
    </div>
  )
}

function InputCard({
  widget,
  selected,
  onSelect,
  onChange,
  onDelete,
}: {
  widget: Widget
  selected: boolean
  onSelect: () => void
  onChange: (p: Partial<Widget>) => void
  onDelete: () => void
}) {
  const c = widget.config
  const showTitle = c.showTitle !== false
  const setConfig = (patch: Partial<typeof c>) => onChange({ config: { ...c, ...patch } })
  return (
    <div onClick={onSelect} className={`group relative cursor-pointer rounded-2xl border p-4 transition ${selected ? 'border-ink' : 'border-line hover:border-line-strong'}`}>
      {/* Delete — a black cross sitting centered on the card's top edge. */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        aria-label="Delete input"
        className="absolute right-4 top-0 z-10 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg bg-ink text-white opacity-0 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.4)] transition hover:bg-black group-hover:opacity-100"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {showTitle && (
        <div className="min-w-0" onClick={(e) => e.stopPropagation()}>
          <InlineTextArea value={c.label ?? ''} onChange={(v) => setConfig({ label: v })} placeholder="Your question here" className="px-2 py-1 text-lg font-semibold tracking-tight" />
          <InlineInput value={c.description ?? ''} onChange={(v) => setConfig({ description: v })} placeholder="Description (optional)" className="mt-0.5 px-2 py-1 text-[13px] leading-relaxed text-muted" />
        </div>
      )}
      <div className={showTitle ? 'mt-3' : ''} onClick={(e) => e.stopPropagation()}>
        <div className="pointer-events-none">
          <WidgetInput widget={widget} value={undefined} onChange={() => {}} hideLabel />
        </div>
      </div>
    </div>
  )
}

const WIDGET_TYPE_SET = new Set<string>(['rating', 'text', 'voice'])

/** Drop target for feedback widgets — drag an input type from the properties
 *  panel and drop it here to add a widget. Clicking it flashes that picker to
 *  teach the drag gesture. */
function WidgetSlot({ onAddInput, onClick }: { onAddInput: (t: WidgetType) => void; onClick: () => void }) {
  const [over, setOver] = useState(false)
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      onDragOver={(e) => {
        e.preventDefault()
        if (!over) setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const t = e.dataTransfer.getData('widget-type')
        if (WIDGET_TYPE_SET.has(t)) onAddInput(t as WidgetType)
      }}
      className={`flex min-h-[64px] cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed text-[14px] font-medium transition ${
        over ? 'border-ink bg-black/[0.03] text-ink' : 'border-line-strong text-muted hover:border-ink hover:text-ink'
      }`}
    >
      + Add another feedback widget (optional)
    </div>
  )
}

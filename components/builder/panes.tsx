'use client'

import { useState } from 'react'
import type { Form, Option, Page, Widget, WidgetType } from '@/lib/types'
import type { PeerMark } from '@/lib/presence'
import { MAX_WIDGETS, defaultNeutralLabel, neutralChoiceLabel } from '@/lib/builder'
import { EMBED_TYPE_LABEL, hostnameOf } from '@/lib/embed'
import { brightnessStyle } from '@/lib/image'
import { Plus, Trash, X } from '@phosphor-icons/react'
import HeroPanel from '@/components/HeroPanel'
import WidgetInput from '@/components/WidgetInput'
import Tooltip from '@/components/Tooltip'
import MediaLightbox, { optionMedia } from '@/components/MediaLightbox'
import { InlineInput, InlineTextArea } from './Inline'
import ImageUpload from './ImageUpload'
import { MediaIconBtn, EditGlyph, DeleteGlyph, ExpandGlyph } from './controls'

/* ------------------------------- Welcome --------------------------------- */

export function WelcomeCenter({
  form,
  onChange,
  onOpenHeroMedia,
  showPublishErrors = false,
}: {
  form: Form
  onChange: (p: Partial<Form>) => void
  onOpenHeroMedia?: () => void
  showPublishErrors?: boolean
}) {
  const missingTitle = showPublishErrors && !form.title.trim()
  const missingBody = showPublishErrors && !form.body_copy.trim()
  const missingHero = showPublishErrors && !form.hero_image_url.trim()
  return (
    // Full-bleed two-column hero: the negative margins cancel the canvas card's
    // padding so the backdrop runs edge to edge, exactly as the voter sees it.
    // Two columns on desktop only — @4xl (896px) sits above the 768px tablet
    // canvas, so tablet and mobile both stack.
    //
    // Height: on md+ the canvas card is given a fixed height (see `fitCanvas` in
    // the edit page) so the preview can never grow past the column. `h-full`
    // would only cover the card's *content* box, so the +5.5rem adds back the
    // pt-14/pb-8 the negative margins cancel — the vertical twin of the
    // w-[calc(100%+56px)] trick above. The hero media object-contains inside the
    // panel, so a tall upload scales down instead of pushing the card off-screen.
    // Rows: stacked, the hero takes whatever height the copy leaves (minmax(0,1fr)
    // lets it shrink); in two columns there is a single full-height row.
    <div className="-mx-[28px] -mb-8 -mt-14 grid w-[calc(100%+56px)] overflow-hidden rounded-[28px] md:h-[calc(100%+5.5rem)] md:grid-rows-[auto_minmax(0,1fr)] @4xl:grid-cols-2 @4xl:grid-rows-[minmax(0,1fr)] @4xl:items-stretch">
      <div className="flex flex-col justify-center gap-2 overflow-y-auto px-[28px] py-14 @4xl:py-20">
        {/* font-pixel: these editors stand in for the voter's <h1>/<h2>, which the
            global heading rule renders in the pixel face — a textarea isn't a
            heading, so it has to opt in explicitly or the preview would lie. */}
        <InlineTextArea
          value={form.title}
          onChange={(v) => onChange({ title: v })}
          placeholder="What are we testing?"
          aria-invalid={missingTitle}
          className={`px-2 py-1 font-pixel text-3xl font-semibold leading-tight tracking-tight sm:text-[34px] ${
            missingTitle ? 'bg-red-50 ring-2 ring-red-500/70' : ''
          }`}
        />
        {missingTitle && <p role="alert" className="px-2 text-[13px] font-medium text-red-600">Add an introduction title.</p>}
        <InlineTextArea
          value={form.body_copy}
          onChange={(v) => onChange({ body_copy: v })}
          placeholder="Add the context voters read before they start…"
          aria-invalid={missingBody}
          className={`px-2 py-1 text-[15px] leading-relaxed text-muted ${
            missingBody ? 'bg-red-50 ring-2 ring-red-500/70' : ''
          }`}
        />
        {missingBody && <p role="alert" className="px-2 text-[13px] font-medium text-red-600">Add introduction context.</p>}
      </div>
      {form.hero_image_url ? (
        <HeroPanel bg={form.hero_bg} dither={form.hero_dither} className="h-[60vh] md:h-full">
          <ImageUpload value={form.hero_image_url} onChange={(v) => onChange({ hero_image_url: v })} onClickUpload={onOpenHeroMedia} bare />
        </HeroPanel>
      ) : (
        /* In two columns the dropzone owns the whole right cell. This was a flex
           row with items-center, which sized the zone to its *content* — a narrow
           box floating in the middle of the column. A plain block with h-full
           lets ImageUpload's own h-full/w-full fill the cell instead. */
        /* No `onClickUpload`: with nothing here yet the only thing the modal
           could offer is a file picker, so the empty zone opens the OS one
           directly and saves a click. The modal is still what Edit opens once
           there's an image — that's where replacing and the backdrop live. */
        <div
          className={`relative px-[28px] pb-10 @4xl:h-full @4xl:py-14 @4xl:pl-0 ${
            missingHero ? 'rounded-2xl bg-red-50 ring-2 ring-inset ring-red-500/70' : ''
          }`}
        >
          <ImageUpload value="" onChange={(v) => onChange({ hero_image_url: v })} />
          {missingHero && (
            <p role="alert" className="absolute bottom-3 left-[28px] text-[13px] font-medium text-red-600 @4xl:bottom-5">
              Add an introduction image.
            </p>
          )}
        </div>
      )}
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
  flashInputKey,
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
  readOnly = false,
  showPublishErrors = false,
  missingFeedbackPage = false,
  optionMarks,
  inputMarks,
}: {
  page: Page
  options: Option[]
  widgets: Widget[]
  selectedOptionKey: string | null
  selectedInputKey: string | null
  /** The input the canvas just scrolled to — pulses it once on arrival. */
  flashInputKey: string | null
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
  /** Closed form: the canvas is a record, so nothing that adds to it is drawn.
   *  The whole canvas is inert anyway — these would be unreachable prompts to do
   *  something the form can't do. */
  readOnly?: boolean
  showPublishErrors?: boolean
  /** The form contains context pages only, so publishing needs one changed to Get Vote. */
  missingFeedbackPage?: boolean
  /** Collaborators' selections, by option id and by input id — see PeerMark. */
  optionMarks?: Record<string, PeerMark>
  inputMarks?: Record<string, PeerMark>
}) {
  const feedback = page.type === 'feedback'
  const missingTitle = showPublishErrors && feedback && !page.title.trim()
  const missingResponseContent =
    showPublishErrors &&
    feedback &&
    !(options.length >= 2 || (options.length >= 1 && widgets.length >= 1))
  // One viewer for the whole page rather than one per card: only one can be open
  // at a time, and the option it holds is all that differs.
  const [zoom, setZoom] = useState<Option | null>(null)
  return (
    <div className="space-y-8">
      {zoom && <MediaLightbox media={optionMedia(zoom)} onClose={() => setZoom(null)} />}
      {showPublishErrors && missingFeedbackPage && (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[14px] font-medium text-red-700">
          This form needs at least one Get Vote page. Change this page to Get Vote in Properties, or add one.
        </p>
      )}
      {/* Page heading */}
      <div className="flex flex-col">
        <InlineTextArea
          value={page.title}
          onChange={(v) => onPageChange({ title: v })}
          placeholder={feedback ? 'What are we comparing?' : 'Section title'}
          aria-invalid={missingTitle}
          className={`px-2 py-1 font-pixel text-2xl font-semibold tracking-tight ${
            missingTitle ? 'bg-red-50 ring-2 ring-red-500/70' : ''
          }`}
        />
        {missingTitle && <p role="alert" className="px-2 text-[13px] font-medium text-red-600">Add a title for this Get Vote page.</p>}
        <InlineTextArea
          value={page.body}
          onChange={(v) => onPageChange({ body: v })}
          placeholder="Add context for this page… (optional)"
          className="px-0 py-1 text-[15px] leading-relaxed text-muted"
        />
      </div>

      {/* Options / media */}
      <section
        className={missingResponseContent ? 'rounded-2xl bg-red-50 p-3 ring-2 ring-red-500/70' : ''}
      >
        <p className="mb-3 text-[13px] font-medium text-muted">
          {feedback ? `Options to compare · ${options.length}/4` : `Media · ${options.length}`}
        </p>
        <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-2">
          {options.map((o, i) => (
            <OptionCard
              key={o.id}
              option={o}
              letter={String.fromCharCode(65 + i)}
              feedback={feedback}
              selected={selectedOptionKey === o.id}
              onSelect={() => onSelectOption(o.id)}
              onChange={(p) => patchOption(o.id, p)}
              onDelete={() => onDeleteOption(o.id)}
              onOpenMedia={() => onOpenMedia(o.id)}
              onZoom={setZoom}
              mark={optionMarks?.[o.id]}
            />
          ))}
          {!optionFull && !readOnly && (
            <button
              type="button"
              onClick={onAddOption}
              className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong text-[14px] font-medium text-muted transition hover:border-ink hover:text-ink"
            >
              <Plus size={22} aria-hidden="true" />
              <span className="mt-1.5">{feedback ? 'Add option' : 'Add media'}</span>
            </button>
          )}
        </div>
        {missingResponseContent && (
          <p role="alert" className="mt-3 text-[13px] font-medium text-red-600">
            Add at least 2 options, or 1 option and a feedback input.
          </p>
        )}
        {/* The neutral answer. Not a <label> any more: its wording is editable in
            place, and inside a label every click in the field would have toggled
            the checkbox. The checkbox and the status text both still toggle it,
            so the row keeps two hit targets — they just aren't the text field. */}
        {feedback && options.length >= 2 && (
          <div
            className={`mt-4 flex items-center gap-3 rounded-2xl border px-4 py-3.5 transition ${
              page.show_neutral_option !== false
                ? 'border-line bg-card text-ink'
                : 'border-dashed border-line-strong bg-black/[0.015] text-muted'
            }`}
          >
            <input
              type="checkbox"
              checked={page.show_neutral_option !== false}
              disabled={readOnly}
              onChange={(event) => onPageChange({ show_neutral_option: event.target.checked })}
              aria-label={`Offer “${neutralChoiceLabel(page, options.length)}” to voters`}
              className="h-4 w-4 flex-none accent-[#18191d] disabled:cursor-default"
            />
            {readOnly ? (
              <span className="min-w-0 flex-1 text-[14px] font-medium">{neutralChoiceLabel(page, options.length)}</span>
            ) : (
              // Blank means "use the generated wording", so the placeholder is
              // that wording — an empty field reads as what voters will see
              // rather than as something missing.
              <InlineInput
                value={page.neutral_label ?? ''}
                onChange={(v) => onPageChange({ neutral_label: v })}
                placeholder={defaultNeutralLabel(options.length)}
                aria-label="Neutral answer wording"
                className="u-placeholder-strong min-w-0 flex-1 px-1.5 py-0.5 text-[14px] font-medium"
              />
            )}
            <button
              type="button"
              disabled={readOnly}
              onClick={() => onPageChange({ show_neutral_option: page.show_neutral_option === false })}
              className="flex-none text-[12px] text-muted transition enabled:hover:text-ink disabled:cursor-default"
            >
              {page.show_neutral_option !== false ? 'Visible to voters' : 'Hidden from voters'}
            </button>
          </div>
        )}
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
                flash={flashInputKey === w.id}
                onSelect={() => onSelectInput(w.id)}
                onChange={(p) => patchWidget(w.id, p)}
                onDelete={() => onDeleteInput(w.id)}
                mark={inputMarks?.[w.id]}
              />
            ))}
            {widgets.length < MAX_WIDGETS && !readOnly && <WidgetSlot onAddInput={onAddInput} onClick={onFlashInputs} />}
          </div>
        </section>
      )}
    </div>
  )
}

function OptionCard({
  option,
  letter,
  feedback,
  selected,
  onSelect,
  onChange,
  onDelete,
  onOpenMedia,
  onZoom,
  mark,
}: {
  option: Option
  letter: string
  /** Feedback pages compare named options; static pages just show the media. */
  feedback: boolean
  selected: boolean
  onSelect: () => void
  onChange: (p: Partial<Option>) => void
  onDelete: () => void
  onOpenMedia: () => void
  onZoom: (option: Option) => void
  /** Set when a collaborator has this card selected. */
  mark?: PeerMark
}) {
  return (
    <div
      onClick={onSelect}
      // An outline rather than a border for the collaborator's ring: the border is
      // already spoken for by your own selection, and the two need to be able to
      // show at once — you and someone else can be on the same card.
      style={mark ? { outline: `2px solid ${mark.color}`, outlineOffset: '2px' } : undefined}
      className={`group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border bg-card transition ${selected ? 'border-ink' : 'border-line hover:border-line-strong'}`}
    >
      <PeerTag mark={mark} />
      {/* Static media is context, not a choice — there's nothing to label or tell
          apart, so the A/B letter and the name/description editors are dropped
          and the card is only the media, matching what the voter sees. Delete
          moves onto the media, since the header that held it is gone. */}
      {feedback && (
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
              <Trash size={16} aria-hidden="true" />
            </button>
          </Tooltip>
        </div>
      )}
      {/* flex-1: media now keeps its own aspect ratio, so two cards in a row can
          want different heights. The grid stretches both to the taller one and
          this takes the slack, keeping the shorter media centred instead of
          leaving a gap under it. */}
      <div className="group/media relative flex w-full flex-1">
        <MediaThumb option={option} />
        {!feedback && (
          <div className="absolute right-2 top-2 z-10 opacity-0 transition group-hover:opacity-100">
            <Tooltip label="Delete">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete()
                }}
                aria-label="Delete media"
                className="grid h-8 w-8 place-items-center rounded-lg bg-white/90 text-muted shadow-sm transition hover:text-red-600"
              >
                <Trash size={16} aria-hidden="true" />
              </button>
            </Tooltip>
          </div>
        )}
        {option.embed_url ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/25 opacity-0 transition group-hover/media:opacity-100">
            <div className="flex items-center gap-1.5">
              {/* Expand leads: the card is a thumbnail in a grid, so "let me
                  actually look at this" is the most common thing to want of it.
                  The scrim above the media takes every click, which is why this
                  is a button here rather than a click on the image. */}
              <MediaIconBtn tip="Expand" onClick={() => onZoom(option)}>
                {ExpandGlyph}
              </MediaIconBtn>
              {/* Edit opens the media editor itself. It used to only select the
                  card, which put this option's settings in the properties rail —
                  and on a page whose rail is already full of page settings, that
                  landed below the fold and read as a dead button. Selecting still
                  happens (openMedia does both), so the rail follows along. */}
              <MediaIconBtn tip="Edit" onClick={onOpenMedia}>
                {EditGlyph}
              </MediaIconBtn>
              {/* Clearing the URL leaves an empty, still-named option — which is
                  meaningful on a feedback page but is just an orphan card on a
                  static one, where the corner button removes the whole thing. */}
              {feedback && (
                <MediaIconBtn tip="Delete" onClick={() => onChange({ embed_url: '' })}>
                  {DeleteGlyph}
                </MediaIconBtn>
              )}
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


function MediaThumb({ option }: { option: Option }) {
  if (!option.embed_url) {
    return <div className="flex min-h-44 w-full items-center justify-center bg-black/[0.015] text-[13px] text-muted">Upload media</div>
  }
  if (option.embed_type === 'image') {
    return (
      // Contained, not cropped — the card is where the creator checks their
      // upload, so it has to show the same full image the voter gets. The box
      // keeps a floor so short media doesn't collapse the card and a ceiling so
      // a tall screenshot doesn't push the rest of the page out of view.
      <div className="flex min-h-44 w-full items-center justify-center bg-black/[0.015] p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={option.embed_url}
          alt={option.is_decorative ? '' : option.alt_text || option.name}
          style={brightnessStyle(option.brightness)}
          className="max-h-[320px] max-w-full rounded-lg"
        />
      </div>
    )
  }
  const host = hostnameOf(option.embed_url)
  return (
    <div className="flex min-h-44 w-full flex-col items-center justify-center gap-1 bg-black/[0.015] text-center">
      <span className="text-[14px] font-medium">{EMBED_TYPE_LABEL[option.embed_type]}</span>
      {host && <span className="max-w-[80%] truncate text-[13px] text-muted">{host}</span>}
      <span className="mt-1 text-[13px] text-muted">Live in Preview</span>
    </div>
  )
}

function InputCard({
  widget,
  selected,
  flash = false,
  onSelect,
  onChange,
  onDelete,
  mark,
}: {
  widget: Widget
  selected: boolean
  /** Pulses the card — set when the canvas had to scroll to bring it into view. */
  flash?: boolean
  onSelect: () => void
  onChange: (p: Partial<Widget>) => void
  onDelete: () => void
  /** Set when a collaborator has this card selected. */
  mark?: PeerMark
}) {
  const c = widget.config
  const showTitle = c.showTitle !== false
  const setConfig = (patch: Partial<typeof c>) => onChange({ config: { ...c, ...patch } })
  return (
    // data-widget is how the builder finds this card to scroll to it.
    <div
      data-widget={widget.id}
      onClick={onSelect}
      style={mark ? { outline: `2px solid ${mark.color}`, outlineOffset: '2px' } : undefined}
      className={`group relative cursor-pointer rounded-2xl border p-4 transition ${
        selected ? 'border-ink' : 'border-line hover:border-line-strong'
      } ${flash ? 'u-flash' : ''}`}
    >
      <PeerTag mark={mark} />
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
        <X size={14} aria-hidden="true" />
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

/**
 * Whose outline this is. The colour alone answers "someone else is in here"; with
 * two collaborators on one page it takes a name to say which of them, and the
 * avatar in the header is the key to read it by.
 *
 * Bottom-right: the top of both cards is taken (the A/B letter and the name
 * fields on an option, the delete cross on an input), and the corner it sits in
 * is the one place nothing is ever clicked.
 */
function PeerTag({ mark }: { mark?: PeerMark }) {
  if (!mark) return null
  return (
    <span
      className="pointer-events-none absolute bottom-0 right-0 z-20 rounded-tl-lg px-1.5 py-0.5 text-[11px] font-semibold leading-tight text-white"
      style={{ backgroundColor: mark.color }}
    >
      {mark.name}
    </span>
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

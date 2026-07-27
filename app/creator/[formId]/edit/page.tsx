'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import type { Form, Option, Page, PageType, Widget, WidgetType } from '@/lib/types'
import { getFullForm, saveFullForm } from '@/lib/store'
import {
  newPage,
  newOption,
  newWidget,
  dupPage,
  dupOption,
  dupWidget,
  readiness,
  pageReady,
  PAGE_META,
  MAX_OPTIONS,
  MAX_WIDGETS,
  type Selection,
} from '@/lib/builder'
import UserMenu from '@/components/UserMenu'
import HoverHighlight from '@/components/HoverHighlight'
import Tooltip from '@/components/Tooltip'
import { WelcomeCenter, PageCenter } from '@/components/builder/panes'
import { EndScreenCenter, ShareDialog } from '@/components/builder/Share'
import { PageProperties, OptionProperties, InputProperties, WelcomeProperties, EndProperties } from '@/components/builder/properties'
import DeviceSwitch, { DEVICE_MAX_WIDTH, type Device } from '@/components/builder/DeviceSwitch'
import MediaModal from '@/components/builder/MediaModal'
import PreviewOverlay from '@/components/builder/PreviewOverlay'

function snapshot(form: Form, pages: Page[], options: Option[], widgets: Widget[]): string {
  return JSON.stringify({
    t: form.title,
    b: form.body_copy,
    h: form.hero_image_url,
    hbg: form.hero_bg,
    ty: form.thank_you_message,
    sr: form.show_results_to_voters,
    rl: form.require_voter_login,
    te: form.show_time_estimate,
    em: form.estimated_minutes,
    p: pages,
    o: options,
    w: widgets,
  })
}

export default function BuilderPage() {
  const params = useParams<{ formId: string }>()
  const formId = params.formId

  const [form, setForm] = useState<Form | null>(null)
  const [pages, setPages] = useState<Page[]>([])
  const [options, setOptions] = useState<Option[]>([])
  const [widgets, setWidgets] = useState<Widget[]>([])
  const [notFound, setNotFound] = useState(false)
  const [sel, setSel] = useState<Selection>({ kind: 'welcome' })
  const [device, setDevice] = useState<Device>('desktop')
  const [mediaFor, setMediaFor] = useState<string | null>(null)
  const [heroMedia, setHeroMedia] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [flashInputs, setFlashInputs] = useState(false)
  const clearFlashInputs = useCallback(() => setFlashInputs(false), [])
  const [origin] = useState(() => (typeof window !== 'undefined' ? window.location.origin : ''))
  const [publishedSnapshot, setPublishedSnapshot] = useState<string | null>(null)

  const loadedRef = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    getFullForm(formId).then((f) => {
      if (!f) return setNotFound(true)
      setForm(f.form)
      setPages(f.pages)
      setOptions(f.options)
      setWidgets(f.widgets)
      if (f.form.status === 'open') setPublishedSnapshot(snapshot(f.form, f.pages, f.options, f.widgets))
    })
  }, [formId])

  const persist = useCallback(async (f: Form, pg: Page[], opts: Option[], wids: Widget[]) => {
    await saveFullForm({
      form: f,
      pages: pg.map((p, i) => ({ ...p, order_index: i })),
      options: opts.map((o, i) => ({ ...o, order_index: i })),
      widgets: wids.map((w, i) => ({ ...w, order_index: i })),
    })
  }, [])

  useEffect(() => {
    if (!form) return
    if (!loadedRef.current) {
      loadedRef.current = true
      return
    }
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => void persist(form, pages, options, widgets), 700)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [form, pages, options, widgets, persist])

  const patchForm = useCallback((p: Partial<Form>) => setForm((f) => (f ? { ...f, ...p } : f)), [])
  const patchPage = useCallback((id: string, p: Partial<Page>) => setPages((ps) => ps.map((x) => (x.id === id ? { ...x, ...p } : x))), [])
  const patchOption = useCallback((key: string, p: Partial<Option>) => setOptions((os) => os.map((o) => (o.id === key ? { ...o, ...p } : o))), [])
  const patchWidget = useCallback((key: string, p: Partial<Widget>) => setWidgets((ws) => ws.map((w) => (w.id === key ? { ...w, ...p } : w))), [])

  // Pages
  function addPage(type: PageType, afterIndex = pages.length - 1) {
    if (!form) return
    const page = newPage(form.id, type, 0)
    setPages((ps) => {
      const next = ps.slice()
      next.splice(afterIndex + 1, 0, page)
      return next
    })
    // A feedback page is a comparison — seed it with two options (A/B) so it's
    // never empty. Static pages start blank (you add the context media).
    if (type === 'feedback') {
      const a = newOption(form.id, page.id, options.length, 0)
      const b = newOption(form.id, page.id, options.length + 1, 1)
      setOptions((os) => [...os, a, b])
    }
    setSel({ kind: 'page', id: page.id })
  }
  function deletePage(id: string) {
    setPages((ps) => ps.filter((p) => p.id !== id))
    setOptions((os) => os.filter((o) => o.page_id !== id))
    setWidgets((ws) => ws.filter((w) => w.page_id !== id))
    setSel({ kind: 'welcome' })
  }
  function duplicatePage(id: string) {
    const page = pages.find((p) => p.id === id)
    if (!page) return
    const copy = dupPage(page)
    const idx = pages.findIndex((p) => p.id === id)
    setPages((ps) => {
      const next = ps.slice()
      next.splice(idx + 1, 0, copy)
      return next
    })
    setOptions((os) => [...os, ...os.filter((o) => o.page_id === id).map((o) => ({ ...dupOption(o), page_id: copy.id }))])
    setWidgets((ws) => [...ws, ...ws.filter((w) => w.page_id === id).map((w) => ({ ...dupWidget(w), page_id: copy.id }))])
    setSel({ kind: 'page', id: copy.id })
  }
  function reorderPages(from: number, to: number) {
    setPages((ps) => {
      const next = ps.slice()
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
  }

  // Options / inputs (scoped to a page)
  function addOption(pageId: string) {
    if (!form) return
    const count = options.filter((o) => o.page_id === pageId).length
    const o = newOption(form.id, pageId, options.length, count)
    setOptions((os) => [...os, o])
    setSel({ kind: 'option', key: o.id })
  }
  function removeOption(key: string) {
    const o = options.find((x) => x.id === key)
    setOptions((os) => os.filter((x) => x.id !== key))
    if (o) setSel({ kind: 'page', id: o.page_id })
  }
  function addInput(pageId: string, type: WidgetType) {
    if (!form) return
    const w = newWidget(form.id, pageId, type, widgets.length)
    setWidgets((ws) => [...ws, w])
    setSel({ kind: 'input', key: w.id })
  }
  function removeInput(key: string) {
    const w = widgets.find((x) => x.id === key)
    setWidgets((ws) => ws.filter((x) => x.id !== key))
    if (w) setSel({ kind: 'page', id: w.page_id })
  }
  const changeWidgetType = useCallback((key: string, type: WidgetType) => {
    setWidgets((ws) =>
      ws.map((w) => {
        if (w.id !== key) return w
        const fresh = newWidget(w.form_id, w.page_id, type, w.order_index)
        return { ...w, type, config: { ...fresh.config, label: w.config.label, description: w.config.description, required: w.config.required, showTitle: w.config.showTitle } }
      }),
    )
  }, [])
  function openMedia(key: string) {
    setSel({ kind: 'option', key })
    setMediaFor(key)
  }

  function publish() {
    if (!form) return
    const next: Form = { ...form, status: 'open', published_at: new Date().toISOString() }
    setForm(next)
    setPublishedSnapshot(snapshot(next, pages, options, widgets))
  }
  function unpublish() {
    patchForm({ status: 'draft' })
    setPublishedSnapshot(null)
  }

  async function openPreview() {
    if (!form) return
    // Flush the latest edits so the previewed iframe reads current state.
    if (saveTimer.current) clearTimeout(saveTimer.current)
    await persist(form, pages, options, widgets)
    setPreviewOpen(true)
  }

  if (notFound) {
    return (
      <>
        <Topbar>
          <Breadcrumb />
          <UserMenu />
        </Topbar>
        <main className="mx-auto max-w-[600px] px-6 py-24 text-center">
          <h1 className="text-xl font-semibold">Form not found</h1>
          <Link href="/creator" className="mt-5 inline-block rounded-[16px] bg-ink px-5 py-2.5 text-[14px] font-medium text-white">← Back to forms</Link>
        </main>
      </>
    )
  }
  if (!form) {
    return (
      <>
        <Topbar>
          <Breadcrumb />
          <UserMenu />
        </Topbar>
        <div className="mx-auto max-w-[1100px] px-6 py-16 text-[14px] text-muted">Loading builder…</div>
      </>
    )
  }

  // Derived focus
  const selectedOption = sel.kind === 'option' ? options.find((o) => o.id === sel.key) ?? null : null
  const selectedInput = sel.kind === 'input' ? widgets.find((w) => w.id === sel.key) ?? null : null
  const mediaOption = mediaFor ? options.find((o) => o.id === mediaFor) ?? null : null
  const currentPageId =
    sel.kind === 'page' ? sel.id : selectedOption ? selectedOption.page_id : selectedInput ? selectedInput.page_id : null
  const currentPage = currentPageId ? pages.find((p) => p.id === currentPageId) ?? null : null
  const pageOptions = currentPage ? options.filter((o) => o.page_id === currentPage.id) : []
  const pageWidgets = currentPage ? widgets.filter((w) => w.page_id === currentPage.id) : []
  const currentPageIndex = currentPage ? pages.findIndex((p) => p.id === currentPage.id) : -1

  const ready = readiness(form, pages, options, widgets)
  const publicUrl = `${origin}/f/${form.slug}`
  const published = form.status === 'open'
  const dirty = published && publishedSnapshot !== null && snapshot(form, pages, options, widgets) !== publishedSnapshot
  const publishLabel = !published ? 'Publish form' : dirty ? 'Publish changes' : 'Published'
  const screenLabel = sel.kind === 'welcome' ? 'Welcome screen' : sel.kind === 'end' ? 'End screen' : currentPage ? PAGE_META[currentPage.type].label : ''
  const previewStart = sel.kind === 'welcome' ? 'welcome' : sel.kind === 'end' ? 'end' : currentPage?.id ?? 'welcome'

  return (
    <>
      <Topbar>
        <Breadcrumb title={form.title} onRename={(v) => patchForm({ title: v })} />
        <span className="hidden text-[14px] text-muted sm:inline">All changes autosaved</span>
        <div className="flex items-center gap-3 text-[14px]">
          {published && (
            <Link href={`/creator/${formId}/results`} className="rounded-[16px] border border-line px-3 py-1.5 font-medium text-ink transition hover:bg-black/[0.03]">
              See results ↗
            </Link>
          )}
          <button type="button" onClick={openPreview} className="rounded-[16px] border border-line px-3 py-1.5 font-medium text-ink transition hover:bg-black/[0.03]">
            Preview ↗
          </button>
          <button type="button" onClick={() => setShareOpen(true)} className="rounded-[16px] bg-ink px-4 py-1.5 font-medium text-white transition hover:opacity-90">
            {publishLabel}
          </button>
          <div className="mx-0.5 h-5 w-px bg-line" />
          <UserMenu />
        </div>
      </Topbar>

      <div className="grid w-full grid-cols-1 md:h-[calc(100dvh-3.5rem)] md:grid-cols-[264px_1fr_320px]">
        {/* Left rail — Welcome · pages · End */}
        <aside className="border-b border-line p-3 md:overflow-y-auto md:border-b-0 md:border-r">
          <HoverHighlight>
            <RailRow active={sel.kind === 'welcome'} onClick={() => setSel({ kind: 'welcome' })} icon="✦" label="Welcome" done={ready.welcome} />

            <div className="my-2 border-t border-line pt-2">
              <div className="space-y-0.5">
                {pages.map((p, i) => (
                  <PageRow
                    key={p.id}
                    index={i}
                    active={currentPageId === p.id}
                    icon={PAGE_META[p.type].glyph}
                    label={p.title || PAGE_META[p.type].label}
                    done={pageReady(p, options, widgets)}
                    onClick={() => setSel({ kind: 'page', id: p.id })}
                    onDuplicate={() => duplicatePage(p.id)}
                    onDelete={() => deletePage(p.id)}
                    onReorder={reorderPages}
                  />
                ))}
                {pages.length === 0 && <p className="px-2.5 py-1.5 text-[13px] text-muted">No pages yet</p>}
              </div>
              <AddPage onAdd={(t) => addPage(t)} />
            </div>

            <div className="mt-2 border-t border-line pt-2">
              <RailRow active={sel.kind === 'end'} onClick={() => setSel({ kind: 'end' })} icon="✓" label="End screen" done={ready.thankyou} />
            </div>
          </HoverHighlight>
        </aside>

        {/* Center canvas */}
        <section className="flex flex-col items-center bg-black/[0.015] px-4 py-6 sm:px-10 md:overflow-y-auto">
          <DeviceSwitch value={device} onChange={setDevice} />
          <div className="mt-6 w-full transition-[max-width] duration-300 ease-out" style={{ maxWidth: DEVICE_MAX_WIDTH[device] }}>
            <p className="mb-3 px-1 text-[13px] font-medium text-muted">{screenLabel}</p>
            <div className="@container flex min-h-[520px] items-center rounded-[28px] border border-line bg-card px-[28px] pt-14 pb-8 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_16px_44px_-24px_rgba(0,0,0,0.18)]">
              <div className="w-full">
                {sel.kind === 'welcome' && <WelcomeCenter form={form} onChange={patchForm} onOpenHeroMedia={() => setHeroMedia(true)} />}
                {currentPage && (
                  <PageCenter
                    page={currentPage}
                    options={pageOptions}
                    widgets={pageWidgets}
                    selectedOptionKey={sel.kind === 'option' ? sel.key : null}
                    selectedInputKey={sel.kind === 'input' ? sel.key : null}
                    onPageChange={(p) => patchPage(currentPage.id, p)}
                    onSelectOption={(key) => setSel({ kind: 'option', key })}
                    onSelectInput={(key) => setSel({ kind: 'input', key })}
                    onAddOption={() => addOption(currentPage.id)}
                    onDeleteOption={removeOption}
                    onOpenMedia={openMedia}
                    onAddInput={(t) => addInput(currentPage.id, t)}
                    onDeleteInput={removeInput}
                    onFlashInputs={() => {
                      setSel({ kind: 'page', id: currentPage.id })
                      setFlashInputs(true)
                    }}
                    patchOption={patchOption}
                    patchWidget={patchWidget}
                    optionFull={pageOptions.length >= MAX_OPTIONS}
                  />
                )}
                {sel.kind === 'end' && <EndScreenCenter form={form} onChange={patchForm} />}
              </div>
            </div>

            {/* Add the next content page from the canvas (not on the end screen). */}
            {sel.kind !== 'end' && (
              <div className="mt-4">
                <AddPage
                  variant="page"
                  onAdd={(t) => addPage(t, sel.kind === 'welcome' ? -1 : currentPageIndex)}
                />
              </div>
            )}
          </div>
        </section>

        {/* Right properties panel */}
        <aside className="border-t border-line md:overflow-y-auto md:border-l md:border-t-0">
          <p className="border-b border-line px-4 py-3.5 text-[13px] font-medium text-muted">Properties</p>
          {sel.kind === 'welcome' && <WelcomeProperties form={form} onChange={patchForm} />}
          {sel.kind === 'page' && currentPage && (
            <PageProperties
              page={currentPage}
              optionFull={pageOptions.length >= MAX_OPTIONS}
              widgetsFull={pageWidgets.length >= MAX_WIDGETS}
              flash={flashInputs}
              onAddOption={() => addOption(currentPage.id)}
              onAddInput={(t) => addInput(currentPage.id, t)}
              onDeletePage={() => deletePage(currentPage.id)}
              onFlashDone={clearFlashInputs}
            />
          )}
          {sel.kind === 'option' && selectedOption && (
            <OptionProperties
              option={selectedOption}
              onChange={(p) => patchOption(selectedOption.id, p)}
              onDelete={() => removeOption(selectedOption.id)}
              onOpenMedia={() => setMediaFor(selectedOption.id)}
              allowDecorative={currentPage?.type === 'static'}
            />
          )}
          {sel.kind === 'input' && selectedInput && (
            <InputProperties widget={selectedInput} onChange={(p) => patchWidget(selectedInput.id, p)} onChangeType={(t) => changeWidgetType(selectedInput.id, t)} onDelete={() => removeInput(selectedInput.id)} />
          )}
          {sel.kind === 'end' && <EndProperties form={form} onChange={patchForm} />}
        </aside>
      </div>

      {previewOpen && <PreviewOverlay slug={form.slug} start={previewStart} onClose={() => setPreviewOpen(false)} />}

      {mediaOption && (
        <MediaModal
          embedType={mediaOption.embed_type}
          embedUrl={mediaOption.embed_url}
          onChange={(p) => patchOption(mediaOption.id, p)}
          alt={mediaOption.is_decorative ? '' : mediaOption.alt_text || mediaOption.name}
          focalX={mediaOption.focal_x}
          focalY={mediaOption.focal_y}
          brightness={mediaOption.brightness}
          onClose={() => setMediaFor(null)}
        />
      )}

      {heroMedia && (
        <MediaModal imageOnly embedType="image" embedUrl={form.hero_image_url} onChange={(p) => patchForm({ hero_image_url: p.embed_url })} onClose={() => setHeroMedia(false)} />
      )}

      {shareOpen && (
        <ShareDialog form={form} publicUrl={publicUrl} ready={ready} published={published} dirty={dirty} onChange={patchForm} onPublish={publish} onUnpublish={unpublish} onClose={() => setShareOpen(false)} />
      )}
    </>
  )
}

/* -------------------------------- topbar --------------------------------- */

function Topbar({ children }: { children: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/80 backdrop-blur">
      <div className="flex h-14 w-full items-center justify-between px-[14px]">{children}</div>
    </header>
  )
}

function Breadcrumb({ title, onRename }: { title?: string | null; onRename?: (v: string) => void }) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-[14px]">
      <Link href="/creator" className="grid h-6 w-6 flex-none place-items-center rounded-lg bg-ink text-[13px] font-bold text-white" aria-label="Prism home">
        P
      </Link>
      <Link href="/creator" className="flex-none font-medium text-muted transition hover:text-ink">
        Forms
      </Link>
      {title !== undefined && (
        <>
          <span className="flex-none text-muted">›</span>
          {onRename ? (
            <input
              value={title ?? ''}
              onChange={(e) => onRename(e.target.value)}
              placeholder="Untitled form"
              aria-label="Form name"
              size={Math.max((title || 'Untitled form').length, 6)}
              className="min-w-0 max-w-[46vw] truncate rounded-md bg-transparent px-1.5 py-0.5 font-medium outline-none transition placeholder:text-muted hover:bg-black/[0.04] focus:bg-black/[0.05] focus:ring-2 focus:ring-black/[0.06]"
            />
          ) : (
            <span className="min-w-0 truncate font-medium">{title || 'Untitled form'}</span>
          )}
        </>
      )}
    </div>
  )
}

/* --------------------------------- rail ---------------------------------- */

function RailRow({ active, onClick, icon, label, done }: { active: boolean; onClick: () => void; icon: string; label: string; done?: boolean }) {
  return (
    <button type="button" onClick={onClick} data-hl className={`relative flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition ${active ? 'bg-black/[0.06]' : ''}`}>
      <span className="grid h-6 w-6 flex-none place-items-center rounded-lg bg-black/[0.06] text-[13px] font-bold">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{label}</span>
      {done !== undefined && <span className={`h-1.5 w-1.5 flex-none rounded-full ${done ? 'bg-open' : 'bg-line-strong'}`} />}
    </button>
  )
}

function PageRow({
  index,
  active,
  icon,
  label,
  done,
  onClick,
  onDuplicate,
  onDelete,
  onReorder,
}: {
  index: number
  active: boolean
  icon: string
  label: string
  done: boolean
  onClick: () => void
  onDuplicate: () => void
  onDelete: () => void
  onReorder: (from: number, to: number) => void
}) {
  return (
    <div
      data-hl
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        const from = Number(e.dataTransfer.getData('text/plain'))
        if (!Number.isNaN(from) && from !== index) onReorder(from, index)
      }}
      className={`group relative flex items-center gap-1 rounded-xl px-1 py-1.5 transition ${active ? 'bg-black/[0.06]' : ''}`}
    >
      <span
        draggable
        onDragStart={(e) => e.dataTransfer.setData('text/plain', String(index))}
        aria-label="Drag to reorder"
        className="flex-none cursor-grab px-1 text-muted opacity-0 transition group-hover:opacity-100 active:cursor-grabbing"
      >
        ⠿
      </span>
      <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
        <span className="grid h-6 w-6 flex-none place-items-center rounded-lg bg-black/[0.06] text-[13px] font-bold">{icon}</span>
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{label}</span>
        <span className={`h-1.5 w-1.5 flex-none rounded-full ${done ? 'bg-open' : 'bg-line-strong'}`} />
      </button>
      <div className="flex flex-none items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
        <Tooltip label="Duplicate">
          <button type="button" onClick={onDuplicate} aria-label="Duplicate" className="grid h-6 w-6 place-items-center rounded-md text-muted transition hover:bg-black/[0.06] hover:text-ink">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.7" /><path d="M4 16V6a2 2 0 0 1 2-2h10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
          </button>
        </Tooltip>
        <Tooltip label="Delete">
          <button type="button" onClick={onDelete} aria-label="Delete" className="grid h-6 w-6 place-items-center rounded-md text-muted transition hover:bg-black/[0.06] hover:text-red-600">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2m-8 0 1 13h8l1-13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </Tooltip>
      </div>
    </div>
  )
}

/* ----------------------------- add content ------------------------------- */

function AddPage({ onAdd, variant = 'rail' }: { onAdd: (type: PageType) => void; variant?: 'rail' | 'page' }) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const page = variant === 'page'
  const items: { type: PageType; label: string; hint: string; glyph: string }[] = [
    { type: 'feedback', label: 'Get feedback', hint: 'Compare options and collect feedback', glyph: PAGE_META.feedback.glyph },
    { type: 'static', label: 'Add more context', hint: 'No feedback required', glyph: PAGE_META.static.glyph },
  ]

  function toggle() {
    if (!open && btnRef.current) setRect(btnRef.current.getBoundingClientRect())
    setOpen((o) => !o)
  }

  // Fixed positioning so the menu escapes the scrolling column and floats above
  // everything (not clipped by the rail's overflow). Its width hugs its content,
  // so we center it on the trigger by measuring the mounted node.
  const top = rect ? rect.bottom + 6 : 0
  const positionMenu = useCallback((node: HTMLDivElement | null) => {
    const r = btnRef.current?.getBoundingClientRect()
    if (!node || !r) return
    const w = node.offsetWidth
    const h = node.offsetHeight
    const centered = r.left + r.width / 2 - w / 2
    node.style.left = `${Math.min(Math.max(8, centered), window.innerWidth - w - 8)}px`
    // Flip above the trigger when the menu would overflow the viewport bottom and
    // there's more room above — otherwise it's clipped with no way to scroll to it.
    const spaceBelow = window.innerHeight - r.bottom
    const openAbove = spaceBelow < h + 12 && r.top > spaceBelow
    node.style.top = openAbove ? `${Math.max(8, r.top - h - 6)}px` : `${r.bottom + 6}px`
    node.style.transformOrigin = openAbove ? 'bottom' : 'top'
  }, [])

  return (
    <div className={page ? '' : 'mt-1.5'}>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className={
          page
            ? 'flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong py-4 text-[14px] font-medium text-muted transition hover:border-ink hover:bg-black/[0.02] hover:text-ink'
            : 'flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong py-2 text-[14px] font-medium text-muted transition hover:bg-black/[0.03] hover:text-ink'
        }
      >
        <span className="text-base leading-none">+</span> Add content
      </button>
      {open && rect && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            ref={positionMenu}
            className="u-popover fixed left-0 z-50 w-max max-w-[360px] origin-top overflow-hidden rounded-2xl border border-line bg-card p-1.5 shadow-[0_8px_30px_-8px_rgba(0,0,0,0.25),0_2px_8px_-2px_rgba(0,0,0,0.12)]"
            style={{ top }}
          >
            {items.map((it) => (
              <button
                key={it.type}
                type="button"
                onClick={() => {
                  onAdd(it.type)
                  setOpen(false)
                }}
                className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-black/[0.04]"
              >
                <span className="grid h-7 w-7 flex-none place-items-center rounded-lg bg-black/[0.06] text-[13px] font-bold">{it.glyph}</span>
                <span>
                  <span className="block whitespace-nowrap text-[14px] font-medium">{it.label}</span>
                  <span className="block whitespace-nowrap text-[13px] text-muted">{it.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import type { Form, Option, Page, PageType, Widget, WidgetType } from '@/lib/types'
import { getFullForm, saveFullForm, isStorageFull, getFormOwnerEmail, updateFormAccess } from '@/lib/store'
import { useCurrentUser } from '@/lib/auth'
import { canEditForm, formAccess } from '@/lib/access'
import { useFormRoom, type DocEdit, type PeerMark } from '@/lib/presence'
import { personColor, personName } from '@/lib/format'
import {
  hasResults,
  newPage,
  newOption,
  newWidget,
  dupPage,
  dupOption,
  dupWidget,
  readiness,
  publishDetailsMissing,
  pageReady,
  pageHasContent,
  formName,
  PAGE_META,
  MAX_OPTIONS,
  MAX_WIDGETS,
  type Selection,
} from '@/lib/builder'
import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import { ArrowCounterClockwise, ArrowLeft, CopySimple, DotsSixVertical, FlagCheckered, Plus, Sparkle, Trash, UserPlus } from '@phosphor-icons/react'
import HoverHighlight from '@/components/HoverHighlight'
import Tooltip from '@/components/Tooltip'
import ConfirmDialog from '@/components/ConfirmDialog'
import StatusBadge from '@/components/StatusBadge'
import MobileFormView from '@/components/builder/MobileFormView'
import { useIsMobile } from '@/lib/useIsMobile'
import { WelcomeCenter, PageCenter } from '@/components/builder/panes'
import { EndScreenCenter, ShareDialog } from '@/components/builder/Share'
import { PageProperties, OptionProperties, InputProperties, WelcomeProperties, EndProperties } from '@/components/builder/properties'
import DeviceSwitch, { DEVICE_MAX_WIDTH, type Device } from '@/components/builder/DeviceSwitch'
import FormHeader from '@/components/builder/FormHeader'
import PresenceBar from '@/components/builder/PresenceBar'
import CollaboratorDialog from '@/components/builder/CollaboratorDialog'
import CanvasNudge from '@/components/builder/CanvasNudge'
import MediaModal from '@/components/builder/MediaModal'
import PanelResizer, { useRailWidth, usePanelWidth } from '@/components/builder/PanelResizer'

function snapshot(form: Form, pages: Page[], options: Option[], widgets: Widget[]): string {
  return JSON.stringify({
    t: form.title,
    b: form.body_copy,
    h: form.hero_image_url,
    hbg: form.hero_bg,
    hd: form.hero_dither,
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

/** The sticky topbar's height — a card tucked under it counts as out of view. */
const TOPBAR_HEIGHT = 56

/** Screen ids are 'welcome', 'end', or a page id — see the canvas scrollspy. */
function selectionFor(screen: string): Selection {
  return screen === 'welcome' ? { kind: 'welcome' } : screen === 'end' ? { kind: 'end' } : { kind: 'page', id: screen }
}

/**
 * A selection flattened to a string, so it can be published to collaborators and
 * compared against theirs. `option:<id>` is what draws an outline round that card
 * in their colour.
 */
function selectionKey(sel: Selection): string {
  return sel.kind === 'welcome' || sel.kind === 'end'
    ? sel.kind
    : sel.kind === 'page'
      ? `page:${sel.id}`
      : `${sel.kind}:${sel.key}`
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
  const [shareOpen, setShareOpen] = useState(false)
  const [collaboratorsOpen, setCollaboratorsOpen] = useState(false)
  // Set only after Publish is pressed. It keeps validation quiet while the
  // creator is drafting, then marks the first screen that needs attention.
  const [publishErrorScreen, setPublishErrorScreen] = useState<string | null>(null)
  const [flashInputs, setFlashInputs] = useState(false)
  // The input card the canvas has just scrolled to, pulsed for a beat on arrival.
  const [flashWidget, setFlashWidget] = useState<string | null>(null)
  // Same, for the option settings the properties column has just scrolled to.
  const [flashOption, setFlashOption] = useState<string | null>(null)
  // The page a confirmation is open for, and what it's about to do to it.
  const [pageAction, setPageAction] = useState<{ id: string; kind: 'delete' | 'clear' } | null>(null)
  const [nudgeDismissed, setNudgeDismissed] = useState(false)
  const clearFlashInputs = useCallback(() => setFlashInputs(false), [])
  const [origin] = useState(() => (typeof window !== 'undefined' ? window.location.origin : ''))
  const rail = useRailWidth()
  const panel = usePanelWidth()
  const [publishedSnapshot, setPublishedSnapshot] = useState<string | null>(null)
  // Incremented for each clean-state Publish click so repeated clicks restart
  // the toast entrance instead of being swallowed by an already-true boolean.
  const [upToDateToast, setUpToDateToast] = useState<number | null>(null)
  // Non-null when the last autosave failed — surfaced as a banner, because the
  // builder otherwise looks identical whether or not the write landed.
  const [saveError, setSaveError] = useState<string | null>(null)
  const isMobile = useIsMobile()
  const { user } = useCurrentUser()

  const loadedRef = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** The edit the debounce still owes storage — see the unmount flush below. */
  const pending = useRef<{ form: Form; pages: Page[]; options: Option[]; widgets: Widget[] } | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const optionFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const upToDateTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /**
   * A closed form is a record, not a draft. The builder still opens — the
   * creator can read back what was asked, and preview it — but nothing in it
   * can change.
   *
   * Enforced twice over. The editing columns go `inert`, which is what the
   * creator sees; and every mutator below returns early, so a control that
   * forgets to disable itself still cannot write.
   */
  const locked = form?.status === 'closed'
  const access = form ? formAccess(form, user) : null
  const editable = canEditForm(access)
  const viewOnly = access === 'view'
  const readOnly = locked || !editable

  // ---- Which screen the canvas shows ---------------------------------------
  // One screen at a time, chosen from the rail. The canvas used to stack all of
  // them in a snapping scroll with an IntersectionObserver spy deciding which
  // one you were "on" — two ways to navigate that had to be kept in step, and a
  // long scroll between the page you were editing and the next. The rail is now
  // the only way through the form, so the canvas is just the selected screen.
  //
  // Options and inputs are edited in place on a page, so they resolve to that
  // page's screen — selecting one must not blank the canvas.
  const activeScreen =
    sel.kind === 'welcome' || sel.kind === 'end'
      ? sel.kind
      : sel.kind === 'page'
        ? sel.id
        : (sel.kind === 'option' ? options.find((o) => o.id === sel.key) : widgets.find((w) => w.id === sel.key))?.page_id ?? 'welcome'

  const goToScreen = useCallback((id: string) => setSel(selectionFor(id)), [])

  // ---- Who else is in here -------------------------------------------------
  // A form has collaborators, so the editor has to be able to answer "is anyone
  // else in this right now" — renaming a page under someone, or publishing while
  // they're still writing, are both things you'd hold off on if you knew.
  const [ownerEmail, setOwnerEmail] = useState<string | null>(null)
  // Who is being followed, by address rather than by tab so it survives them
  // reloading. An address that is no longer in `peers` simply follows nobody:
  // the pill and the ring disappear when they leave, and resume if they return.
  const [following, setFollowing] = useState<string | null>(null)
  // The same value, readable from the presence callback below, which is installed
  // once and would otherwise close over whoever was followed at the time.
  const followingRef = useRef<string | null>(null)

  /** Screens the canvas can show — a peer may be on a page you haven't loaded. */
  const screenExists = useCallback(
    (id: string) => id === 'welcome' || id === 'end' || pages.some((p) => p.id === id),
    [pages],
  )

  /**
   * They moved, so the follower moves. Driven by the presence event rather than
   * by watching presence state, which keeps this a response to something that
   * happened — and leaves you free to look elsewhere in between without being
   * yanked back until they actually navigate again.
   */
  const onPeerScreen = useCallback(
    (email: string, screen: string) => {
      if (email !== followingRef.current) return
      if (screenExists(screen)) goToScreen(screen)
    },
    [screenExists, goToScreen],
  )

  // What this tab has selected and which screen that resolves to, readable from
  // the transport callbacks below — they're installed once, so they can't close
  // over either value.
  const selRef = useRef(sel)
  const screenRef = useRef(activeScreen)
  useEffect(() => {
    selRef.current = sel
    screenRef.current = activeScreen
  }, [sel, activeScreen])

  /**
   * Keep the selection pointing at something that still exists.
   *
   * A collaborator deleting the option you had selected used to empty your
   * canvas: `sel` still named the dead option, so the editor couldn't work out
   * which page you were on and fell all the way back to the introduction. Land
   * on the page you were already looking at instead — the screen doesn't move,
   * only the selection inside it.
   */
  const keepSelectionAlive = useCallback((next: { options?: Option[]; widgets?: Widget[]; pages?: Page[] }) => {
    const current = selRef.current
    const gone =
      (current.kind === 'option' && next.options && !next.options.some((o) => o.id === current.key)) ||
      (current.kind === 'input' && next.widgets && !next.widgets.some((w) => w.id === current.key)) ||
      (current.kind === 'page' && next.pages && !next.pages.some((p) => p.id === current.id))
    if (!gone) return
    const here = screenRef.current
    const stillThere = here === 'welcome' || here === 'end' || (next.pages ?? pages).some((p) => p.id === here)
    setSel(selectionFor(stillThere ? here : 'welcome'))
  }, [pages])

  /**
   * A collaborator's change, applied to this tab's state.
   *
   * Field patches only touch the keys they carry, so two people editing different
   * fields of the same option don't undo each other; a collection replaces its
   * own state wholesale, which is what an add, a delete or a reorder is. `reload`
   * comes from an edit too big for the wire, so it's read from storage instead.
   */
  const applyEdit = useCallback(
    (edit: DocEdit) => {
      switch (edit.t) {
        case 'form':
          setForm((f) => (f ? { ...f, ...edit.patch } : f))
          break
        case 'page':
          setPages((ps) => ps.map((p) => (p.id === edit.id ? { ...p, ...edit.patch } : p)))
          break
        case 'option':
          setOptions((os) => os.map((o) => (o.id === edit.id ? { ...o, ...edit.patch } : o)))
          break
        case 'widget':
          setWidgets((ws) => ws.map((w) => (w.id === edit.id ? { ...w, ...edit.patch } : w)))
          break
        case 'pages':
          setPages(edit.rows)
          keepSelectionAlive({ pages: edit.rows })
          break
        case 'options':
          setOptions(edit.rows)
          keepSelectionAlive({ options: edit.rows })
          break
        case 'widgets':
          setWidgets(edit.rows)
          keepSelectionAlive({ widgets: edit.rows })
          break
        case 'reload':
          getFullForm(formId).then((f) => {
            if (!f) return
            setForm(f.form)
            setPages(f.pages)
            setOptions(f.options)
            setWidgets(f.widgets)
            keepSelectionAlive({ pages: f.pages, options: f.options, widgets: f.widgets })
          })
          break
      }
    },
    [formId, keepSelectionAlive],
  )

  const { peers, send } = useFormRoom({
    formId: form ? formId : null,
    screen: activeScreen,
    selection: selectionKey(sel),
    viewerEmail: user?.email ?? null,
    enabled: !isMobile,
    onPeerScreen,
    onEdit: applyEdit,
  })

  /** Start (or stop) following someone, and jump to where they are right now. */
  const follow = useCallback(
    (email: string | null) => {
      followingRef.current = email
      setFollowing(email)
      const target = email ? peers.find((p) => p.email === email)?.screen : null
      if (target && screenExists(target)) goToScreen(target)
    },
    [peers, screenExists, goToScreen],
  )

  useEffect(() => {
    if (!form) return
    let live = true
    getFormOwnerEmail(form, { userId: user?.id ?? null, email: user?.email ?? null })
      .then((email) => live && setOwnerEmail(email))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [form, user?.id, user?.email])

  /**
   * Everyone else's selection, resolved to colours the canvas and rail can draw.
   *
   * Keyed the way each surface asks for it: cards by entity id, rail rows by
   * screen. A screen can hold several people, so those come back as a list.
   */
  const marks = useMemo(() => {
    const optionMarks: Record<string, PeerMark> = {}
    const inputMarks: Record<string, PeerMark> = {}
    const railMarks: Record<string, PeerMark[]> = {}
    for (const peer of peers) {
      if (peer.self) continue
      const mark: PeerMark = { color: personColor(peer.email), name: personName(peer.email).split(' ')[0] }
      ;(railMarks[peer.screen] ??= []).push(mark)
      const [kind, id] = (peer.selection ?? '').split(':')
      if (!id) continue
      if (kind === 'option') optionMarks[id] = mark
      else if (kind === 'input') inputMarks[id] = mark
    }
    return { optionMarks, inputMarks, railMarks }
  }, [peers])

  /** How a screen is named in a presence tooltip — the rail's own wording. */
  const screenLabel = useCallback(
    (id: string) => {
      if (id === 'welcome') return 'Introduction'
      if (id === 'end') return 'End screen'
      const page = pages.find((p) => p.id === id)
      if (!page) return 'another screen'
      return page.title.trim() || PAGE_META[page.type].label
    },
    [pages],
  )

  /**
   * Bring an input's card into view on the canvas and pulse it once.
   *
   * The rail sits beside a canvas that scrolls independently, and the options
   * grid above the inputs is tall — so both adding an input and selecting one
   * routinely act on a card that's below the fold. Attention has to land on the
   * card, not on a panel describing one you can't see.
   *
   * Deferred a task: on `addInput` the card doesn't exist yet when the click is
   * handled. React flushes a discrete event's updates before yielding, so by the
   * next macrotask the new card is in the DOM and measurable — reading it inline
   * only ever worked for cards that were already there.
   *
   * Only when it's actually off-screen. A card you clicked on the canvas is
   * already in front of you, and flashing on every selection would make the
   * pulse mean "selected" rather than "it moved".
   */
  const revealWidget = useCallback((key: string) => {
    setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-widget="${key}"]`)
      if (!el) return
      const r = el.getBoundingClientRect()
      if (r.top >= TOPBAR_HEIGHT && r.bottom <= window.innerHeight) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setFlashWidget(key)
      if (flashTimer.current) clearTimeout(flashTimer.current)
      flashTimer.current = setTimeout(() => setFlashWidget(null), 1000)
    }, 0)
  }, [])

  /**
   * Select an option and make sure its settings are on screen.
   *
   * They render *below* the page's own properties, so on a Get Vote page — page
   * type, the inputs list, delete — the option's section routinely lands past
   * the fold of the properties column. Clicking Edit on a card then looked like
   * nothing happened at all. Same rule as the canvas: only when it's out of
   * view, so clicking an option whose settings are already visible is quiet.
   */
  const revealOption = useCallback((key: string) => {
    setSel({ kind: 'option', key })
    setTimeout(() => {
      const el = document.querySelector<HTMLElement>('[data-option-panel]')
      const panel = el?.closest('aside')
      if (!el || !panel) return
      const r = el.getBoundingClientRect()
      const p = panel.getBoundingClientRect()
      if (r.top >= p.top && r.bottom <= p.bottom) return
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      setFlashOption(key)
      if (optionFlashTimer.current) clearTimeout(optionFlashTimer.current)
      optionFlashTimer.current = setTimeout(() => setFlashOption(null), 1000)
    }, 0)
  }, [])

  /** Select an input from the properties rail, and scroll the canvas to it. */
  const revealInput = useCallback(
    (key: string) => {
      setSel({ kind: 'input', key })
      revealWidget(key)
    },
    [revealWidget],
  )

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current)
      if (optionFlashTimer.current) clearTimeout(optionFlashTimer.current)
      if (upToDateTimer.current) clearTimeout(upToDateTimer.current)
    },
    [],
  )

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
    try {
      await saveFullForm({
        form: f,
        pages: pg.map((p, i) => ({ ...p, order_index: i })),
        options: opts.map((o, i) => ({ ...o, order_index: i })),
        widgets: wids.map((w, i) => ({ ...w, order_index: i })),
      })
      setSaveError(null)
    } catch (e) {
      // An autosave that fails silently is indistinguishable from one that
      // worked: the canvas keeps showing React state while storage holds the
      // last version that fit, and only the preview gives it away. Say so.
      setSaveError(
        isStorageFull(e)
          ? 'Out of browser storage — recent changes aren’t saved. Remove some uploaded media, or connect Supabase.'
          : 'Couldn’t save your changes.',
      )
    }
  }, [])

  useEffect(() => {
    if (!form || readOnly) return
    if (!loadedRef.current) {
      loadedRef.current = true
      return
    }
    pending.current = { form, pages, options, widgets }
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      pending.current = null
      void persist(form, pages, options, widgets)
    }, 700)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [form, pages, options, widgets, persist, readOnly])

  /**
   * Write whatever the debounce still owes on the way out.
   *
   * The cleanup above clears the pending timer, and it runs on unmount as well
   * as on every change — so leaving the builder inside those 700ms discarded
   * the edit outright. Publishing and going straight back to the dashboard was
   * the worst version: the form came back a draft, with nothing to say why.
   */
  useEffect(
    () => () => {
      const owed = pending.current
      pending.current = null
      if (owed) void persist(owed.form, owed.pages, owed.options, owed.widgets)
    },
    [persist],
  )

  // Each of these does two things now: change this tab, and tell the room. The
  // patch goes out as it's typed rather than waiting for the 700ms autosave —
  // "real time" is the point, and a keystroke-sized patch is cheap.
  const patchForm = useCallback((p: Partial<Form>) => {
    if (readOnly) return
    setForm((f) => (f ? { ...f, ...p } : f))
    send({ t: 'form', patch: p })
  }, [readOnly, send])
  const patchPage = useCallback((id: string, p: Partial<Page>) => {
    if (readOnly) return
    setPages((ps) => ps.map((x) => (x.id === id ? { ...x, ...p } : x)))
    send({ t: 'page', id, patch: p })
  }, [readOnly, send])
  const patchOption = useCallback((key: string, p: Partial<Option>) => {
    if (readOnly) return
    setOptions((os) => os.map((o) => (o.id === key ? { ...o, ...p } : o)))
    send({ t: 'option', id: key, patch: p })
  }, [readOnly, send])
  const patchWidget = useCallback((key: string, p: Partial<Widget>) => {
    if (readOnly) return
    setWidgets((ws) => ws.map((w) => (w.id === key ? { ...w, ...p } : w)))
    send({ t: 'widget', id: key, patch: p })
  }, [readOnly, send])

  /**
   * Structural changes — add, delete, duplicate, reorder — go out as the whole
   * collection rather than as a description of the operation. It's one message
   * either way, and a collection can't drift out of step the way a replayed
   * "insert at index 3" can.
   */
  const putPages = useCallback((rows: Page[]) => {
    setPages(rows)
    send({ t: 'pages', rows })
  }, [send])
  const putOptions = useCallback((rows: Option[]) => {
    setOptions(rows)
    send({ t: 'options', rows })
  }, [send])
  const putWidgets = useCallback((rows: Widget[]) => {
    setWidgets(rows)
    send({ t: 'widgets', rows })
  }, [send])

  // Pages
  function addPage(type: PageType, afterIndex = pages.length - 1) {
    if (readOnly) return
    if (!form) return
    const page = newPage(form.id, type, 0)
    const nextPages = pages.slice()
    nextPages.splice(afterIndex + 1, 0, page)
    putPages(nextPages)
    // A feedback page is a comparison — seed it with two options (A/B) so it's
    // never empty. Static pages start blank (you add the context media).
    if (type === 'feedback') {
      const a = newOption(form.id, page.id, options.length, 0)
      const b = newOption(form.id, page.id, options.length + 1, 1)
      putOptions([...options, a, b])
    }
    setSel({ kind: 'page', id: page.id })
  }
  function deletePage(id: string) {
    if (readOnly) return
    putPages(pages.filter((p) => p.id !== id))
    putOptions(options.filter((o) => o.page_id !== id))
    putWidgets(widgets.filter((w) => w.page_id !== id))
    setSel({ kind: 'welcome' })
  }
  /**
   * Empty a page without removing it: the title and body go, its inputs go, and
   * a feedback page comes back seeded with the A/B pair a new one starts with.
   * This is what "delete" becomes for the last page standing.
   */
  function clearPage(id: string) {
    if (readOnly) return
    const page = pages.find((p) => p.id === id)
    if (!page || !form) return
    putPages(pages.map((p) => (p.id === id ? { ...p, title: '', body: '' } : p)))
    putWidgets(widgets.filter((w) => w.page_id !== id))
    const rest = options.filter((o) => o.page_id !== id)
    putOptions(
      page.type === 'feedback'
        ? [...rest, newOption(form.id, id, rest.length, 0), newOption(form.id, id, rest.length + 1, 1)]
        : rest,
    )
    setSel({ kind: 'page', id })
  }
  /**
   * Deleting takes a page's options and inputs with it and there's no undo, so
   * anything with work in it asks first. A page you just added is still blank —
   * confirming that would be friction for nothing — so it goes immediately.
   *
   * The exception is the last page: a form with only a welcome and an end screen
   * asks the voter for nothing, so that page can't be deleted, only emptied.
   * Clearing always confirms — unlike deleting a blank page, there is no version
   * of it that costs nothing, and the button is disabled when it would be a
   * no-op (see `canClearPage`).
   */
  function requestDeletePage(id: string) {
    if (readOnly) return
    const page = pages.find((p) => p.id === id)
    if (!page) return
    const kind = pages.length === 1 ? 'clear' : 'delete'
    if (kind === 'delete' && !pageHasContent(page, options, widgets)) deletePage(id)
    else setPageAction({ id, kind })
  }
  function duplicatePage(id: string) {
    if (readOnly) return
    const page = pages.find((p) => p.id === id)
    if (!page) return
    const copy = dupPage(page)
    const idx = pages.findIndex((p) => p.id === id)
    const nextPages = pages.slice()
    nextPages.splice(idx + 1, 0, copy)
    putPages(nextPages)
    putOptions([...options, ...options.filter((o) => o.page_id === id).map((o) => ({ ...dupOption(o), page_id: copy.id }))])
    putWidgets([...widgets, ...widgets.filter((w) => w.page_id === id).map((w) => ({ ...dupWidget(w), page_id: copy.id }))])
    setSel({ kind: 'page', id: copy.id })
  }
  function reorderPages(from: number, to: number) {
    if (readOnly) return
    const next = pages.slice()
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    putPages(next)
  }

  // Options / inputs (scoped to a page)
  function addOption(pageId: string) {
    if (readOnly) return
    if (!form) return
    const count = options.filter((o) => o.page_id === pageId).length
    const o = newOption(form.id, pageId, options.length, count)
    putOptions([...options, o])
    setSel({ kind: 'option', key: o.id })
  }
  function removeOption(key: string) {
    if (readOnly) return
    const o = options.find((x) => x.id === key)
    putOptions(options.filter((x) => x.id !== key))
    if (o) setSel({ kind: 'page', id: o.page_id })
  }
  function addInput(pageId: string, type: WidgetType) {
    if (readOnly) return
    if (!form) return
    const w = newWidget(form.id, pageId, type, widgets.length)
    putWidgets([...widgets, w])
    setSel({ kind: 'input', key: w.id })
    // A new input lands under the options grid, which is usually taller than the
    // canvas — without this the click reads as "nothing happened".
    revealWidget(w.id)
  }
  function removeInput(key: string) {
    if (readOnly) return
    const w = widgets.find((x) => x.id === key)
    putWidgets(widgets.filter((x) => x.id !== key))
    if (w) setSel({ kind: 'page', id: w.page_id })
  }
  const changeWidgetType = useCallback((key: string, type: WidgetType) => {
    const target = widgets.find((w) => w.id === key)
    if (!target) return
    const fresh = newWidget(target.form_id, target.page_id, type, target.order_index)
    const c = target.config
    // Swapping the input type keeps what the creator wrote and replaces only the
    // type's own settings, so the patch is exactly those two keys.
    patchWidget(key, {
      type,
      config: { ...fresh.config, label: c.label, description: c.description, required: c.required, showTitle: c.showTitle },
    })
  }, [widgets, patchWidget])
  function openMedia(key: string) {
    if (readOnly) return
    setSel({ kind: 'option', key })
    setMediaFor(key)
  }

  function publish() {
    if (readOnly) return
    if (!form) return
    // Belt and braces with the dialog's validation. A live form has to be
    // attributable (name, pod) and time-boxed (expiry) as much as it has to have
    // content, and this is the one function that flips the status.
    if (!ready.publishable || publishDetailsMissing(form).length > 0) return
    const next: Form = { ...form, status: 'open', published_at: new Date().toISOString() }
    setForm(next)
    setPublishedSnapshot(snapshot(next, pages, options, widgets))
    void writeNow(next)
  }
  function unpublish() {
    if (readOnly) return
    if (!form) return
    const next: Form = { ...form, status: 'draft' }
    setForm(next)
    setPublishedSnapshot(null)
    void writeNow(next)
  }

  /**
   * Persist a status change immediately instead of leaving it to the debounce.
   *
   * Going live is a decision, not a keystroke: waiting 700ms to write it meant
   * the next navigation cancelled the timer and the form quietly stayed a
   * draft — the publish looked like it had done nothing at all.
   */
  async function writeNow(next: Form) {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    pending.current = null
    await persist(next, pages, options, widgets)
  }

  /**
   * Write pending edits before the Preview or Results tab takes over. Both read
   * the saved form — the preview literally re-fetches it in an iframe — so a
   * debounced save still in flight would show them the previous version.
   */
  async function flushSave() {
    if (!form || readOnly) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    await persist(form, pages, options, widgets)
  }

  async function changeAccess(next: { collaborators: string[]; viewers: string[] }) {
    if (!form || access !== 'owner') return
    const previous = {
      collaborators: form.collaborators ?? [],
      viewers: form.viewers ?? [],
    }
    setForm((current) => (current ? { ...current, ...next } : current))
    send({ t: 'form', patch: next })
    try {
      await updateFormAccess(form.id, next.collaborators, next.viewers)
    } catch (error) {
      setForm((current) => (current ? { ...current, ...previous } : current))
      send({ t: 'form', patch: previous })
      throw error
    }
  }

  if (notFound) {
    return (
      <>
        <FormHeader formId={formId} tab="edit" />
        <main className="mx-auto max-w-[600px] px-6 py-24 text-center">
          <h1 className="font-sans text-xl font-semibold">Form not found</h1>
          <Link href="/creator" className="mt-5 inline-flex items-center gap-1.5 rounded-[16px] bg-ink px-5 py-2.5 text-[14px] font-medium text-white"><ArrowLeft size={14} aria-hidden="true" /> Back to forms</Link>
        </main>
      </>
    )
  }
  if (!form) {
    return (
      <>
        <FormHeader formId={formId} tab="edit" />
        <div className="mx-auto max-w-[1100px] px-6 py-16 text-[14px] text-muted">Loading builder…</div>
      </>
    )
  }

  // On a phone this route is read-only: the builder needs three columns of real
  // width, so instead of a stack nobody can work in, show the form as a voter
  // sees it. Placed after the load guards so the preview has a form to render.
  if (isMobile) return <MobileFormView form={form} published={form.status === 'open'} />

  // Derived focus
  const selectedOption = sel.kind === 'option' ? options.find((o) => o.id === sel.key) ?? null : null
  const selectedInput = sel.kind === 'input' ? widgets.find((w) => w.id === sel.key) ?? null : null
  const mediaOption = mediaFor ? options.find((o) => o.id === mediaFor) ?? null : null
  const currentPageId =
    sel.kind === 'page' ? sel.id : selectedOption ? selectedOption.page_id : selectedInput ? selectedInput.page_id : null
  const currentPage = currentPageId ? pages.find((p) => p.id === currentPageId) ?? null : null
  const pageOptions = currentPage ? options.filter((o) => o.page_id === currentPage.id) : []
  const pageWidgets = currentPage ? widgets.filter((w) => w.page_id === currentPage.id) : []

  // Every screen, in voter order; the canvas shows the selected one. A deleted
  // page can leave `sel` pointing at nothing for a render, so fall back to the
  // welcome screen rather than an empty canvas.
  const screens = [
    { id: 'welcome', label: 'Introduction page', page: null as Page | null },
    ...pages.map((p) => ({ id: p.id, label: p.title || PAGE_META[p.type].label, page: p as Page | null })),
    { id: 'end', label: 'End screen', page: null as Page | null },
  ]
  const screen = screens.find((s) => s.id === activeScreen) ?? screens[0]
  // The introduction screen is the one preview that models a *full viewport* (the
  // voter's split hero runs edge to edge, no scroll) rather than a document, so
  // its card is sized as a screen and the hero scales down inside it. Every other
  // screen keeps its natural height.
  const screenFit = screen.id === 'welcome'
  // On desktop that screen is a laptop window, so the card is locked to a
  // MacBook 14" display's proportions instead of stretching to whatever height
  // the editor column happens to have — which made the preview taller and taller
  // on a big monitor and lied about how much copy sits above the fold. Tablet and
  // mobile keep filling the column; their widths already imply the device.
  const laptopAspect = screenFit && device === 'desktop'
  const fillHeight = screenFit && !laptopAspect

  const ready = readiness(form, pages, options, widgets)
  const publicUrl = `${origin}/f/${form.slug}`
  const published = form.status === 'open'
  const dirty = published && publishedSnapshot !== null && snapshot(form, pages, options, widgets) !== publishedSnapshot
  const publishLabel = !published ? 'Publish form' : dirty ? 'Publish changes' : 'Published'

  const feedbackPages = pages.filter((p) => p.type === 'feedback')
  const missingFeedbackPage = feedbackPages.length === 0

  function firstPublishErrorScreen(): string | null {
    if (!ready.welcome) return 'welcome'
    const unfinished = feedbackPages.find((p) => !pageReady(p, options, widgets))
    if (unfinished) return unfinished.id
    if (missingFeedbackPage) return pages[0]?.id ?? 'welcome'
    return null
  }

  function openPublish() {
    if (published && !dirty) {
      showUpToDateToast()
      return
    }
    const invalidScreen = firstPublishErrorScreen()
    if (invalidScreen) {
      setPublishErrorScreen(invalidScreen)
      goToScreen(invalidScreen)
      return
    }
    setPublishErrorScreen(null)
    setShareOpen(true)
  }

  function showUpToDateToast() {
    setUpToDateToast((version) => (version ?? 0) + 1)
    if (upToDateTimer.current) clearTimeout(upToDateTimer.current)
    upToDateTimer.current = setTimeout(() => setUpToDateToast(null), 2400)
  }

  // Publish stays actionable so it can lead the creator to the first content
  // error. Release details live in the dialog, whose own action remains
  // clickable and reports missing fields inline.
  const publishButton = (
    <button
      type="button"
      onClick={openPublish}
      className="rounded-[16px] bg-ink px-4 py-1.5 font-medium text-white transition hover:opacity-90"
    >
      {publishLabel}
    </button>
  )

  /**
   * "Your introduction is done — now set up what people vote on."
   *
   * Shown on the introduction screen once its title and subtitle are in, and
   * only while a Get Vote page is still unfinished. That second condition is
   * what keeps this from nagging: it stops appearing for good the moment every
   * voter-facing question is ready, so it needs no "seen it" flag in storage.
   * The × is only for the current sitting.
   */
  const nextVotePage = pages.find((p) => p.type === 'feedback' && !pageReady(p, options, widgets))
  const showIntroNudge = !readOnly && screen.id === 'welcome' && ready.welcome && !ready.middle && !nudgeDismissed

  // The last page can only be emptied, so the rail and the properties panel both
  // offer Clear in place of Delete — and only when there is something to clear.
  const lastPage = pages.length === 1
  const canClearPage = currentPage ? pageHasContent(currentPage, options, widgets) : false

  // Name what the action takes with it, so the confirmation is worth reading.
  const actionTarget = pageAction ? pages.find((p) => p.id === pageAction.id) ?? null : null
  // Quoted rather than suffixed with "?" — page titles are usually questions
  // themselves, and "Delete Which headline is fastest??" reads like a typo.
  const actionTitle =
    pageAction && actionTarget
      ? `${pageAction.kind === 'clear' ? 'Clear' : 'Delete'} “${actionTarget.title.trim() || PAGE_META[actionTarget.type].label}”`
      : ''
  const actionSummary = (() => {
    if (!pageAction || !actionTarget) return undefined
    const opts = options.filter((o) => o.page_id === actionTarget.id).length
    const wids = widgets.filter((w) => w.page_id === actionTarget.id).length
    const noun = actionTarget.type === 'feedback' ? 'option' : 'media item'
    const parts: string[] = []
    if (opts) parts.push(`${opts} ${opts === 1 ? noun : `${noun}s`}`)
    if (wids) parts.push(`${wids} feedback ${wids === 1 ? 'input' : 'inputs'}`)
    if (pageAction.kind === 'clear') {
      // Say that the page survives — it's the one thing a creator reaching for
      // "delete" won't expect, and it's why the button isn't called Delete.
      const what = parts.length ? `Its title and ${parts.join(' and ')} go` : 'Its title and body go'
      return `${what}. The page stays — a form needs one — and starts over empty. This can’t be undone.`
    }
    if (!parts.length) return 'This can’t be undone.'
    const verb = opts + wids === 1 ? 'goes' : 'go'
    return `Its ${parts.join(' and ')} ${verb} with it. This can’t be undone.`
  })()

  return (
    <>
      <FormHeader
        formId={formId}
        tab="edit"
        canSeeResults={hasResults(form) && (editable || form.show_results_to_voters)}
        // Renames the form, not the welcome headline it starts out showing.
        // Without a handler the name renders as plain text, which is what a
        // closed form wants.
        name={formName(form)}
        onRename={readOnly ? undefined : (v) => patchForm({ name: v })}
        // Preview opens on the screen you were editing rather than back at the
        // introduction every time.
        previewQuery={`?start=${encodeURIComponent(activeScreen)}`}
        beforeLeave={flushSave}
        // Draft / Active / Closed, the same badge the Preview and Results views
        // wear. It used to appear only on a closed form, so the one state you
        // could read off the editor was the one you couldn't do anything about.
        // A closed form keeps its "read-only" note beside it — that's about this
        // view, not about the form.
        status={
          <span className="flex shrink-0 items-center gap-2">
            <StatusBadge status={form.status} />
            {locked && <span className="text-[13px] text-muted">read-only</span>}
            {viewOnly && <span className="text-[13px] text-muted">view only</span>}
          </span>
        }
      >
        {/* Save status first, then the actions — status is a passive note, so
            it reads before the buttons rather than splitting them. The device
            switch previews the canvas, so it sits with them too; the centre of
            the bar belongs to the view tabs. */}
        {/* "All changes autosaved" is a claim, so it only stands while it's
            true. A failed write says so instead — and stays visible at every
            width, unlike the reassurance, which is fine to drop on a narrow bar. */}
        {!readOnly &&
          (saveError ? (
            <span
              role="status"
              title={saveError}
              className="inline-flex max-w-[280px] items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-[13px] font-medium text-red-600"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
              <span className="truncate">{saveError}</span>
            </span>
          ) : (
            <span className="hidden text-muted xl:inline">All changes autosaved</span>
          ))}
        <div className="hidden md:block">
          <DeviceSwitch value={device} onChange={setDevice} />
        </div>
        {/* Immediately left of Publish, because that's the button whose meaning
            changes when someone else is in here. Shown on a closed form too —
            nobody can edit it, but "who else is reading this" still stands. */}
        <PresenceBar
          peers={peers}
          ownerEmail={ownerEmail}
          screenLabel={screenLabel}
          following={following}
          onFollow={follow}
          onStopFollowing={() => follow(null)}
        />
        {access === 'owner' && (
          <button
            type="button"
            onClick={() => setCollaboratorsOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-[16px] border border-line-strong bg-card px-3.5 py-1.5 font-medium transition hover:bg-black/[0.03]"
          >
            <UserPlus size={15} aria-hidden="true" />
            Add collaborator
          </button>
        )}
        {readOnly ? null : publishButton}
      </FormHeader>

      {/* --rail and --panel are the two draggable columns (see PanelResizer).
          They only feed the md+ template — below that the three columns stack
          full width and neither handle is rendered. */}
      {/* A closed form is read-only, but not dead: `inert` sits on the canvas
          alone, so every editor inside it is out of the tab order and out of
          reach of a pointer, while the rail stays live and you can still walk
          through the screens and read them. Disabling the rail too (which is
          what wrapping this whole grid did) made the form unreadable past
          whichever screen happened to be selected.
          The properties column goes entirely — every control in it edits, so
          on a closed form it would be a panel of dead switches. */}
      <div
        className="u-view relative grid w-full grid-cols-1 md:h-[calc(100dvh-3.5rem)] md:grid-cols-[var(--rail)_1fr] md:data-[panel=on]:grid-cols-[var(--rail)_1fr_var(--panel)]"
        data-panel={readOnly ? 'off' : 'on'}
        style={{ '--rail': `${rail.width}px`, '--panel': `${panel.width}px` } as React.CSSProperties}
      >
        <PanelResizer {...rail} />
        {!readOnly && <PanelResizer {...panel} />}
        {/* Left rail — Introduction · pages · End, in the order the voter meets
            The pages you author group onto a soft panel between the two fixed
            screens: they're the part that varies in length, so a shape around
            them says "this is the list" better than the hairlines that used to
            do the same job in three flat sections. Every row stacks from the top
            — the panel is sized by its contents, and End screen follows straight
            after it — and the panel only shrinks (scrolling inside) once the
            pages outgrow the column. */}
        <aside className="flex flex-col gap-2 border-b border-line p-2 md:h-full md:min-h-0 md:border-b-0 md:border-r">
          <HoverHighlight className="flex min-h-0 flex-1 flex-col gap-2">
            <RailRow active={activeScreen === 'welcome'} onClick={() => goToScreen('welcome')} icon={Sparkle} label="Introduction" done={ready.welcome} marks={marks.railMarks.welcome} />

            <div className="flex min-h-0 flex-col rounded-2xl bg-black/[0.05] p-1.5">
              {/* The list is not `flex-1`: Add content belongs directly under the
                  last page, not pushed to the foot of a half-empty panel. It
                  still shrinks and scrolls once the pages outgrow the space,
                  which is the only time Add content ends up at the bottom. */}
              <div className="min-h-0 space-y-0.5 overflow-y-auto">
                {pages.map((p, i) => (
                  <PageRow
                    key={p.id}
                    index={i}
                    active={currentPageId === p.id}
                    icon={PAGE_META[p.type].icon}
                    label={p.title || PAGE_META[p.type].label}
                    done={pageReady(p, options, widgets)}
                    marks={marks.railMarks[p.id]}
                    onClick={() => goToScreen(p.id)}
                    onDuplicate={() => duplicatePage(p.id)}
                    onDelete={() => requestDeletePage(p.id)}
                    // The only page can be emptied but not removed.
                    clearOnly={lastPage}
                    deletable={!lastPage || pageHasContent(p, options, widgets)}
                    onReorder={reorderPages}
                    // Closed: the row still selects its screen, but loses the
                    // drag handle and the duplicate/delete pair.
                    readOnly={readOnly}
                  />
                ))}
                {pages.length === 0 && <p className="px-2 py-1 text-[12px] text-muted">No pages yet</p>}
              </div>
              {/* Nothing can be added to a closed form, so the CTA goes rather
                  than sitting there greyed out. */}
              {!readOnly && <AddPage onAdd={() => addPage('feedback')} />}
            </div>

            <RailRow active={activeScreen === 'end'} onClick={() => goToScreen('end')} icon={FlagCheckered} label="End screen" done={ready.thankyou} marks={marks.railMarks.end} />
          </HoverHighlight>
        </aside>

        {/* Center canvas — the selected screen, and nothing else. The column
            still scrolls when a single screen outgrows it (four options and an
            input on one feedback page), but there is no scrolling *between*
            screens: that's the rail's job. */}
        {/* `inert` goes on the content, never on this column: an inert subtree
            isn't hit-testable, so with it here a wheel over the canvas fell
            through to the document and a card taller than the fold could not be
            scrolled to. The scroll container stays live; everything drawn inside
            it is what's out of reach. */}
        <section className="bg-black/[0.015] px-4 py-6 sm:px-10 md:overflow-y-auto">
          <div
            // key: a fresh card per screen, so switching pages never carries a
            // scroll offset or a focused field over from the last one.
            key={screen.id}
            inert={readOnly}
            className={`mx-auto flex w-full flex-col transition-[max-width] duration-300 ease-out ${fillHeight ? 'md:h-full' : ''}`}
            style={{ maxWidth: DEVICE_MAX_WIDTH[device] }}
          >
            <p className="mb-3 px-1 text-[13px] font-medium text-muted">{screen.label}</p>
            <div
              className={`@container flex min-h-[520px] items-center rounded-[28px] border border-line bg-card px-[28px] pt-14 pb-8 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_16px_44px_-24px_rgba(0,0,0,0.18)] ${
                screenFit ? 'md:min-h-0 md:items-stretch' : ''
              } ${fillHeight ? 'md:flex-1' : ''} ${
                // 1512×982 — the MacBook 14" logical resolution. Height follows
                // the column's width, so the card keeps the ratio at any rail or
                // panel width the creator drags to.
                laptopAspect ? 'md:aspect-[1512/982] md:flex-none' : ''
              }`}
            >
              {/* data-screen names what the canvas is showing. Nothing styles it;
                  it's what tells you which screen you're on from the outside —
                  the rail marks the active row with a background alone. */}
              <div data-screen={screen.id} className={`w-full ${screenFit ? 'md:h-full' : ''}`}>
                {screen.id === 'welcome' && (
                  <WelcomeCenter
                    form={form}
                    onChange={patchForm}
                    onOpenHeroMedia={() => setHeroMedia(true)}
                    showPublishErrors={publishErrorScreen === 'welcome'}
                  />
                )}
                {screen.page && (
                  <PageCenter
                    page={screen.page}
                    options={pageOptions}
                    widgets={pageWidgets}
                    selectedOptionKey={sel.kind === 'option' ? sel.key : null}
                    selectedInputKey={sel.kind === 'input' ? sel.key : null}
                    flashInputKey={flashWidget}
                    onPageChange={(p) => patchPage(screen.page!.id, p)}
                    onSelectOption={revealOption}
                    onSelectInput={(key) => setSel({ kind: 'input', key })}
                    onAddOption={() => addOption(screen.page!.id)}
                    onDeleteOption={removeOption}
                    onOpenMedia={openMedia}
                    onAddInput={(t) => addInput(screen.page!.id, t)}
                    onDeleteInput={removeInput}
                    onFlashInputs={() => {
                      setSel({ kind: 'page', id: screen.page!.id })
                      setFlashInputs(true)
                    }}
                    patchOption={patchOption}
                    patchWidget={patchWidget}
                    optionFull={pageOptions.length >= MAX_OPTIONS}
                    readOnly={readOnly}
                    showPublishErrors={publishErrorScreen === screen.page.id}
                    missingFeedbackPage={missingFeedbackPage}
                    optionMarks={marks.optionMarks}
                    inputMarks={marks.inputMarks}
                  />
                )}
                {screen.id === 'end' && (
                  <EndScreenCenter form={form} pages={pages} options={options} widgets={widgets} onChange={patchForm} />
                )}
              </div>
            </div>

            {showIntroNudge && (
              <CanvasNudge
                title="Introduction page is ready"
                body={
                  nextVotePage
                    ? 'Next, finish what people will be voting on.'
                    : 'Next, add the page people will vote on.'
                }
                cta={nextVotePage ? 'Go to Get Vote' : 'Add Get Vote'}
                onAct={() => (nextVotePage ? goToScreen(nextVotePage.id) : addPage('feedback'))}
                onDismiss={() => setNudgeDismissed(true)}
              />
            )}
          </div>
        </section>

        {/* Right properties panel — omitted entirely on a closed form. */}
        {!readOnly && (
        <aside className="border-t border-line md:overflow-y-auto md:border-l md:border-t-0">
          <p className="border-b border-line px-4 py-3.5 text-[13px] font-medium text-muted">Properties</p>
          {sel.kind === 'welcome' && <WelcomeProperties form={form} onChange={patchForm} />}
          {/* Whatever is selected on a page, the page's own properties stay on
              screen: `currentPage` resolves an option or input back to the page
              it lives on. The selection only decides what *else* is shown — its
              input settings nested in the inputs list, or an option's below. */}
          {currentPage && (
            <>
              <PageProperties
                page={currentPage}
                widgets={pageWidgets}
                widgetsFull={pageWidgets.length >= MAX_WIDGETS}
                selectedInputKey={sel.kind === 'input' ? sel.key : null}
                onSelectInput={revealInput}
                onChangeInputType={changeWidgetType}
                inputSettings={
                  selectedInput && (
                    <InputProperties
                      widget={selectedInput}
                      onChange={(p) => patchWidget(selectedInput.id, p)}
                      onDelete={() => removeInput(selectedInput.id)}
                    />
                  )
                }
                flash={flashInputs}
                onChangeType={(t) => patchPage(currentPage.id, { type: t })}
                onAddInput={(t) => addInput(currentPage.id, t)}
                onDeletePage={() => requestDeletePage(currentPage.id)}
                lastPage={lastPage}
                canClear={canClearPage}
                onFlashDone={clearFlashInputs}
              />
              {selectedOption && (
                <OptionProperties
                  option={selectedOption}
                  heading={selectedOption.name || 'Selected media'}
                  flash={flashOption === selectedOption.id}
                  onChange={(p) => patchOption(selectedOption.id, p)}
                  onDelete={() => removeOption(selectedOption.id)}
                  onOpenMedia={() => setMediaFor(selectedOption.id)}
                  allowDecorative={currentPage.type === 'static'}
                />
              )}
            </>
          )}
          {sel.kind === 'end' && <EndProperties form={form} onChange={patchForm} />}
        </aside>
        )}
      </div>

      {viewOnly && (
        <div
          role="note"
          className="u-popover fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-[14px] border border-line bg-card px-4 py-2.5 text-[14px] font-medium text-ink shadow-[0_12px_32px_-12px_rgba(0,0,0,0.32)]"
        >
          You have view-only access. You can browse this form, but only editors can make changes.
        </div>
      )}

      {mediaOption && (
        <MediaModal
          embedType={mediaOption.embed_type}
          embedUrl={mediaOption.embed_url}
          onChange={(p) => patchOption(mediaOption.id, p)}
          alt={mediaOption.is_decorative ? '' : mediaOption.alt_text || mediaOption.name}
          brightness={mediaOption.brightness}
          onClose={() => setMediaFor(null)}
        />
      )}

      {heroMedia && (
        <MediaModal imageOnly embedType="image" embedUrl={form.hero_image_url} onChange={(p) => patchForm({ hero_image_url: p.embed_url })} onClose={() => setHeroMedia(false)} />
      )}

      {shareOpen && (
        <ShareDialog form={form} publicUrl={publicUrl} ready={ready} published={published} dirty={dirty} onChange={patchForm} onPublish={publish} onUpToDate={showUpToDateToast} onUnpublish={unpublish} onClose={() => setShareOpen(false)} />
      )}

      {collaboratorsOpen && access === 'owner' && (
        <CollaboratorDialog
          ownerEmail={ownerEmail}
          viewerEmail={user?.email ?? null}
          collaborators={form.collaborators ?? []}
          viewers={form.viewers ?? []}
          publicUrl={publicUrl}
          onChange={changeAccess}
          onClose={() => setCollaboratorsOpen(false)}
        />
      )}

      {upToDateToast !== null && (
        <div
          key={upToDateToast}
          role="status"
          aria-live="polite"
          className="u-popover fixed bottom-6 left-1/2 z-[80] -translate-x-1/2 rounded-[14px] bg-ink px-4 py-2.5 text-[14px] font-medium text-white shadow-[0_12px_32px_-12px_rgba(0,0,0,0.45)]"
        >
          The form is up to date.
        </div>
      )}

      {pageAction && (
        <ConfirmDialog
          title={actionTitle}
          body={actionSummary}
          confirmLabel={pageAction.kind === 'clear' ? 'Clear page' : 'Delete page'}
          onCancel={() => setPageAction(null)}
          onConfirm={() => {
            if (pageAction.kind === 'clear') clearPage(pageAction.id)
            else deletePage(pageAction.id)
            setPageAction(null)
          }}
        />
      )}
    </>
  )
}

/* -------------------------------- topbar --------------------------------- */

/* --------------------------------- rail ---------------------------------- */

/**
 * The row's icon tile doubles as its readiness indicator: it takes the status
 * "open" tint once a screen has everything it needs, and stays neutral until
 * then. This replaces the trailing green/grey dot — same information, without
 * spending a column of an already narrow rail on it.
 */
function tileClass(done?: boolean): string {
  return `grid h-5 w-5 flex-none place-items-center rounded-md text-[11px] font-bold transition-colors ${
    done ? 'bg-open-bg text-open' : 'bg-black/[0.06]'
  }`
}

function RailRow({ active, onClick, icon: Icon, label, done, marks }: { active: boolean; onClick: () => void; icon: PhosphorIcon; label: string; done?: boolean; marks?: PeerMark[] }) {
  return (
    <button type="button" onClick={onClick} data-hl className={`relative flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left transition ${active ? 'bg-black/[0.06]' : ''}`}>
      <span className={tileClass(done)}>
        <Icon size={13} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{label}</span>
      <PeerDots marks={marks} />
    </button>
  )
}

/**
 * Who is on this screen, as dots in their avatar colours.
 *
 * The rail is the only place that can say where someone is when they're *not* on
 * the screen you're looking at — the canvas outlines only cover what's in front
 * of you. Dots rather than faces: at this size initials are unreadable, and the
 * colour is the part that carries the meaning.
 */
function PeerDots({ marks }: { marks?: PeerMark[] }) {
  if (!marks?.length) return null
  return (
    <span className="flex flex-none items-center gap-0.5" aria-hidden="true">
      {marks.slice(0, 3).map((m, i) => (
        <span key={`${m.color}-${i}`} className="u-circle h-1.5 w-1.5 rounded-full" style={{ backgroundColor: m.color }} />
      ))}
    </span>
  )
}

function PageRow({
  index,
  active,
  icon: Icon,
  label,
  done,
  onClick,
  onDuplicate,
  onDelete,
  clearOnly = false,
  deletable = true,
  onReorder,
  readOnly = false,
  marks,
}: {
  index: number
  active: boolean
  icon: PhosphorIcon
  label: string
  done: boolean
  /** Collaborators currently on this page — see PeerDots. */
  marks?: PeerMark[]
  onClick: () => void
  onDuplicate: () => void
  onDelete: () => void
  /** Last page standing: the action empties it instead of removing it. */
  clearOnly?: boolean
  /** False when the action would do nothing — an already-empty last page. */
  deletable?: boolean
  onReorder: (from: number, to: number) => void
  /** Closed form: the row still selects its screen, but can't reorder, duplicate
   *  or delete. Rendered as absent rather than disabled — a row of dead icons on
   *  every page is noise on a form that is only there to be read. */
  readOnly?: boolean
}) {
  return (
    <div
      data-hl
      onDragOver={readOnly ? undefined : (e) => e.preventDefault()}
      onDrop={
        readOnly
          ? undefined
          : (e) => {
              e.preventDefault()
              const from = Number(e.dataTransfer.getData('text/plain'))
              if (!Number.isNaN(from) && from !== index) onReorder(from, index)
            }
      }
      // Selected reads as a card lifted off the panel rather than a darker patch
      // of it: another wash of black over the grey barely separates from the
      // hover highlight sliding around on the same surface.
      className={`group relative flex items-center gap-0.5 rounded-xl px-0.5 py-1 transition ${
        active ? 'bg-card shadow-[0_1px_2px_rgba(0,0,0,0.06)]' : ''
      }`}
    >
      {readOnly ? (
        // Keeps the title aligned with the editable rows above and below it.
        <span className="flex-none px-1 text-transparent" aria-hidden="true">
          <DotsSixVertical size={12} />
        </span>
      ) : (
        <span
          draggable
          onDragStart={(e) => e.dataTransfer.setData('text/plain', String(index))}
          aria-label="Drag to reorder"
          className="flex-none cursor-grab px-1 text-muted opacity-0 transition group-hover:opacity-100 active:cursor-grabbing"
        >
          <DotsSixVertical size={12} aria-hidden="true" />
        </span>
      )}
      <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <span className={tileClass(done)}>
          <Icon size={13} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{label}</span>
        {/* Sits before the hover actions, which replace nothing — the dots stay
            visible while you reach for Duplicate. */}
        <PeerDots marks={marks} />
      </button>
      {/* Hidden until hover, so the row's width is spent on the title. */}
      {!readOnly && (
      <div className="flex flex-none items-center opacity-0 transition group-hover:opacity-100">
        <Tooltip label="Duplicate">
          <button type="button" onClick={onDuplicate} aria-label="Duplicate" className="grid h-5 w-5 place-items-center rounded-md text-muted transition hover:bg-black/[0.06] hover:text-ink">
            <CopySimple size={13} aria-hidden="true" />
          </button>
        </Tooltip>
        {/* Same slot, different job on the last page: a reset arrow rather than a
            bin, so the icon doesn't promise a delete the form can't allow. */}
        <Tooltip label={clearOnly ? 'Clear page' : 'Delete'}>
          <button
            type="button"
            onClick={onDelete}
            disabled={!deletable}
            aria-label={clearOnly ? 'Clear page' : 'Delete'}
            className="grid h-5 w-5 place-items-center rounded-md text-muted transition hover:bg-black/[0.06] hover:text-red-600 disabled:pointer-events-none disabled:opacity-30"
          >
            {clearOnly ? (
              <ArrowCounterClockwise size={13} aria-hidden="true" />
            ) : (
              <Trash size={13} aria-hidden="true" />
            )}
          </button>
        </Tooltip>
      </div>
      )}
    </div>
  )
}

/* ----------------------------- add content ------------------------------- */

/**
 * Adds a page. It used to open a menu asking for feedback-vs-static up front;
 * that choice is now a property of the selected page, edited in the right-hand
 * panel, so adding is a single click and the type is changed after the fact.
 */
/** Rail-only: the canvas is a continuous scroll of the form as the voter meets
 *  it, so it carries no insert slots of its own. */
function AddPage({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={onAdd}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong py-1.5 text-[13px] font-medium text-muted transition hover:bg-black/[0.03] hover:text-ink"
      >
        <Plus size={14} aria-hidden="true" /> Add content
      </button>
    </div>
  )
}

'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCurrentUser } from '@/lib/auth'
import {
  getDashboard,
  getTeamForms,
  deleteForm,
  renameForm,
  createForm,
  acceptsResponses,
  type TeamForm,
  type DashboardForm,
  type ListedForm,
} from '@/lib/store'
import { formName } from '@/lib/builder'
import { expiryLabel, personColor, personInitials, personName } from '@/lib/format'
import {
  CaretDown,
  ChartBar,
  Check,
  DotsThreeVertical,
  ListBullets,
  MagnifyingGlass,
  PencilSimple,
  SlidersHorizontal,
  Sparkle,
  SquaresFour,
  Trash,
  UsersThree,
  X,
} from '@phosphor-icons/react'
import CreatorHeader from '@/components/CreatorHeader'
import FormThumbnail from '@/components/FormThumbnail'
import StatusBadge from '@/components/StatusBadge'
import Tooltip from '@/components/Tooltip'
import type { FormStatus } from '@/lib/types'

type ViewMode = 'list' | 'card'
type StatusFilter = 'all' | FormStatus
/** A pod name, '' for forms with none, or 'all'. */
type PodFilter = string
/**
 * Two lists, one layout: your own workspace, and every form the team has
 * published (see getTeamForms). Each is its own route so the header can
 * link between them — this component is the body both routes render.
 */
export type DashboardTab = 'mine' | 'team'
// Versioned. The default used to be the list, and anyone who had loaded the
// dashboard back then has 'list' saved under the old key — a saved value beats a
// changed default, so cards would never have shown up for them. The bump drops
// that one stale preference; a choice made from here on still survives a reload.
const VIEW_STORAGE_KEY = 'prism.dashboard.view.v2'

// The two lists outlive a tab switch, which is now a route change: a remount
// paints the last snapshot instead of a skeleton, then refreshes underneath.
const listCache: { mine: DashboardForm[] | null; team: TeamForm[] | null } = {
  mine: null,
  team: null,
}

// The saved view preference lives in localStorage; useSyncExternalStore keeps
// the server snapshot and the client in step without a hydration gap. Cards are
// what you get until you say otherwise — the thumbnail is how a form is
// recognised, and the list can't show one.
let viewCache: ViewMode = 'card'
const viewListeners = new Set<() => void>()

function subscribeView(cb: () => void) {
  viewListeners.add(cb)
  return () => viewListeners.delete(cb)
}
function getViewSnapshot(): ViewMode {
  const saved = localStorage.getItem(VIEW_STORAGE_KEY)
  if (saved === 'list' || saved === 'card') viewCache = saved
  return viewCache
}
function getViewServerSnapshot(): ViewMode {
  return 'card'
}
function setStoredView(next: ViewMode) {
  viewCache = next
  localStorage.setItem(VIEW_STORAGE_KEY, next)
  viewListeners.forEach((cb) => cb())
}

const STATUS_ORDER: Record<FormStatus, number> = { draft: 0, open: 1, closed: 2 }

/**
 * One shared column template for the header and every row, so the list reads as
 * a table rather than a stack of independently-sized rows.
 *
 * Columns: Status · Form · [Pod] · [Collaborator] · Expires · Responses · Actions.
 * Text columns are left-aligned, dates and counts right-aligned against the
 * actions. The action track is fixed rather than `auto`: the header has no
 * buttons to size it, while Team rows can carry two, and independent auto-sized
 * grids would otherwise put every preceding column at a different x-position.
 * The template changes per breakpoint in step with which cells are hidden — a
 * `display:none` cell takes no grid track, so the counts have to match or every
 * row shifts.
 */
const ROW_GRID: Record<DashboardTab, string> = {
  mine: 'grid-cols-[84px_minmax(0,1fr)_184px] sm:grid-cols-[84px_minmax(0,1fr)_96px_184px] lg:grid-cols-[84px_minmax(0,1fr)_104px_96px_184px]',
  // Team carries a Pod column: it's how the team feed is navigated, so it earns
  // a place from sm up rather than waiting for lg like Collaborator and Expires.
  team: 'grid-cols-[84px_minmax(0,1fr)_184px] sm:grid-cols-[84px_minmax(0,1fr)_112px_96px_184px] lg:grid-cols-[84px_minmax(0,1fr)_112px_150px_104px_96px_184px]',
}

/** Just the date. The column header carries the "expires" part, and the full
 *  phrasing still shows under the title on narrow screens. */
function expiryShort(iso: string | null): string | null {
  if (!iso) return null
  const when = new Date(iso)
  if (Number.isNaN(when.getTime())) return null
  return when.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

// Untitled forms display a placeholder, so search matches on that same string.
function formTitle(form: ListedForm) {
  return formName(form) || 'Untitled form'
}

// Drafts are private until published, so the Team tab has no such filter.
const STATUS_FILTERS: Record<DashboardTab, { value: StatusFilter; label: string }[]> = {
  mine: [
    { value: 'all', label: 'All' },
    { value: 'draft', label: 'Draft' },
    { value: 'open', label: 'Active' },
    { value: 'closed', label: 'Closed' },
  ],
  team: [
    { value: 'all', label: 'All' },
    { value: 'open', label: 'Active' },
    { value: 'closed', label: 'Closed' },
  ],
}

/**
 * One card/row in either list. `creator` is set only in the Team tab, where
 * a form may belong to someone else — that's what decides whether the entry
 * offers the creator's controls (Edit / Results / delete) or a voter's link.
 */
interface ListItem {
  form: ListedForm
  responseCount: number
  lastResponseAt: string | null
  creator?: { email: string; mine: boolean }
  /** Team only: whether this viewer has already submitted the form. */
  hasResponded?: boolean
}

function toListItems(
  tab: DashboardTab,
  mine: DashboardForm[] | null,
  team: TeamForm[] | null,
) {
  if (tab === 'mine') return mine
  return team?.map((c) => ({ ...c, creator: { email: c.creatorEmail, mine: c.mine } })) ?? null
}

/**
 * Where an entry's broad click target goes: the builder for your own, the real
 * shared form for someone else's.
 *
 * Your own closed form opens its results instead of the builder — it can't be
 * edited any more (see the builder's read-only mode), so what's left to do with
 * it is read what it found.
 *
 * Preview is intentionally absent here: it has its own explicit button. A click
 * on the artwork, card body, or list row should mean "open what was shared".
 */
function entryHref(item: ListItem): string {
  if (!item.creator || item.creator.mine) {
    return item.form.status === 'closed'
      ? `/creator/${item.form.id}/results`
      : `/creator/${item.form.id}/edit`
  }
  return `/f/${item.form.slug}`
}

/** The dashboard body. Both /creator and /creator/team render this — the
 *  header owns the switch between them. */
export default function Dashboard({ tab }: { tab: DashboardTab }) {
  const router = useRouter()
  const { user, loading: authLoading } = useCurrentUser()
  const [forms, setForms] = useState<DashboardForm[] | null>(listCache.mine)
  const [team, setTeam] = useState<TeamForm[] | null>(listCache.team)
  const [teamError, setTeamError] = useState<string | null>(null)
  const [teamReloadKey, setTeamReloadKey] = useState(0)
  const [creating, setCreating] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  // Team only. '' is the "No pod" bucket — forms published before pods existed,
  // which are real entries and shouldn't vanish from an unfiltered list.
  const [podFilter, setPodFilter] = useState<PodFilter>('all')
  const view = useSyncExternalStore(subscribeView, getViewSnapshot, getViewServerSnapshot)

  async function handleCreate() {
    if (creating) return
    setCreating(true)
    const form = await createForm('simple', user?.id)
    router.push(`/creator/${form.id}/edit`)
  }

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.replace('/login')
      return
    }
    getDashboard(user.id).then((f) => {
      listCache.mine = f
      setForms(f)
    })
  }, [authLoading, user, router])

  // Only fetched on the route that shows it — nothing renders the team
  // feed from /creator, and it's the more expensive of the two queries.
  useEffect(() => {
    if (tab !== 'team' || !user) return
    getTeamForms(user.id)
      .then((c) => {
        listCache.team = c
        setTeam(c)
        setTeamError(null)
      })
      .catch((error: unknown) => {
        console.error('Could not load the Team workspace', error)
        listCache.team = null
        setTeam(null)
        setTeamError('The shared workspace could not be loaded.')
      })
  }, [tab, user, teamReloadKey])

  async function handleRename(id: string, name: string) {
    await renameForm(id, name)
    // Refetch rather than patch in place, for the same reason delete does: the
    // team feed renders the same name and its snapshot is now stale.
    listCache.team = null
    setTeam(null)
    if (!user) return
    const next = await getDashboard(user.id)
    listCache.mine = next
    setForms(next)
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this form and all its responses? This cannot be undone.')) return
    await deleteForm(id)
    // The deleted form may also sit in the team feed; drop that snapshot
    // rather than repaint a stale one on the next visit.
    listCache.team = null
    setTeam(null)
    if (user) {
      const next = await getDashboard(user.id)
      listCache.mine = next
      setForms(next)
    }
  }

  const items = toListItems(tab, forms, team)

  return (
    <>
      <CreatorHeader />
      <main className="mx-auto w-full max-w-[1100px] px-4 py-10 sm:px-6 sm:py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[14px] font-medium text-muted">
              {tab === 'mine' ? 'Your workspace' : 'Shared workspace'}
            </p>
            <h1 className="mt-1 text-[40px] font-semibold tracking-tight">
              {tab === 'mine' ? 'Forms' : 'Team'}
            </h1>
          </div>
          {/* Forms are created in your own workspace, never from Team — that tab
              is a read-only window onto what the team has published, and a form
              started there would land in your list anyway, one tab away from
              where you were looking. */}
          {/* Hidden below md: a new form drops you straight into the builder,
              which is desktop-only, so offering it on a phone would lead
              somewhere you can't work. CSS rather than a JS viewport check, so
              there's no flash of a button that then disappears. */}
          {tab === 'mine' && (
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="hidden rounded-[16px] bg-ink px-5 py-2.5 text-[14px] font-medium text-white transition hover:opacity-90 disabled:opacity-50 md:block"
            >
              {creating ? 'Creating…' : '+ New form'}
            </button>
          )}
        </div>

        {tab === 'team' && teamError ? (
          <TeamErrorState
            message={teamError}
            onRetry={() => {
              setTeam(null)
              setTeamError(null)
              setTeamReloadKey((key) => key + 1)
            }}
          />
        ) : items === null ? (
          <GridSkeleton />
        ) : items.length === 0 ? (
          tab === 'mine' ? (
            <EmptyState onCreate={handleCreate} creating={creating} />
          ) : (
            <TeamEmptyState />
          )
        ) : (
          <Workspace
            tab={tab}
            items={items}
            view={view}
            onChangeView={setStoredView}
            statusFilter={statusFilter}
            onChangeStatus={setStatusFilter}
            podFilter={podFilter}
            onChangePod={setPodFilter}
            viewerEmail={user?.email ?? null}
            onDelete={tab === 'mine' ? handleDelete : undefined}
            onRename={tab === 'mine' ? handleRename : undefined}
          />
        )}
      </main>
    </>
  )
}

function Workspace({
  tab,
  items,
  view,
  onChangeView,
  statusFilter,
  onChangeStatus,
  podFilter,
  onChangePod,
  viewerEmail,
  onDelete,
  onRename,
}: {
  tab: DashboardTab
  items: ListItem[]
  view: ViewMode
  onChangeView: (v: ViewMode) => void
  statusFilter: StatusFilter
  podFilter: PodFilter
  onChangePod: (p: PodFilter) => void
  onChangeStatus: (s: StatusFilter) => void
  /** Signed-in creator. On your own board no `creator` is attached to a row, so
   *  this is how the card knows whose form it is. */
  viewerEmail: string | null
  /** Both omitted in Team, where the list is read-only. */
  onDelete?: (id: string) => void
  onRename?: (id: string, name: string) => void
}) {
  const [search, setSearch] = useState('')

  // Search narrows first, so the status counts reflect what a query actually
  // matches rather than the whole list. In Team the author is part of what
  // you'd search for, so it matches names as well as titles.
  const query = search.trim().toLowerCase()
  const matching = query
    ? items.filter(
        (item) =>
          formTitle(item.form).toLowerCase().includes(query) ||
          (item.creator ? personName(item.creator.email).toLowerCase().includes(query) : false),
      )
    : items

  // Pods come from the data rather than POD_OPTIONS: offering all nine when
  // seven have nothing in them is a menu of dead ends. '' collects forms
  // published before pods existed.
  const podCounts = new Map<string, number>()
  for (const { form } of matching) podCounts.set(form.pod ?? '', (podCounts.get(form.pod ?? '') ?? 0) + 1)
  const podChoices = [...podCounts.keys()].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))

  // Pod narrows before status, so the status counts describe the pod you're
  // looking at — not the whole feed, which would promise rows you can't see.
  const inPod =
    tab === 'team' && podFilter !== 'all' ? matching.filter(({ form }) => (form.pod ?? '') === podFilter) : matching

  const counts = inPod.reduce(
    (acc, { form }) => {
      acc.all += 1
      acc[form.status] += 1
      return acc
    },
    { all: 0, draft: 0, open: 0, closed: 0 } as Record<StatusFilter, number>,
  )

  // Always group by status — drafts, then active, then closed — keeping the
  // store's newest-first order within each group. toSorted leaves `items` intact.
  const visible = (
    statusFilter === 'all' ? inPod : inPod.filter(({ form }) => form.status === statusFilter)
  ).toSorted((a, b) => STATUS_ORDER[a.form.status] - STATUS_ORDER[b.form.status])
  const filters = STATUS_FILTERS[tab]
  const activeLabel = filters.find((f) => f.value === statusFilter)?.label ?? 'All'

  return (
    <>
      {/* The rule that used to sit on the filter bar itself, left behind as its
          own line — the bar is sticky now, and a top border on it would double
          up against the header's when the two meet. */}
      <div className="mt-7 border-t border-line" />

      {/* Filtering is how you navigate a long list, so the controls stay put
          while it scrolls: pinned directly under the 56px header (top-14), with
          an opaque background — the header's translucent blur is fine over the
          page, but rows sliding a few pixels under these controls ghost through
          it. The negative margins let that background span the container's
          padding, or rows — which bleed 12px each side — peek out at the edges. */}
      <div className="sticky top-14 z-30 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-bg px-4 py-4 sm:-mx-6 sm:px-6">
        {/* Team filters on two axes — pod and status — and a pill row per axis
            would be two rows of chips competing for the same bar. Dropdowns
            state the current selection in one line each. My Forms keeps the
            pills: one axis, four options, all worth seeing at once. */}
        {tab === 'team' ? (
          <div className="flex flex-wrap items-center gap-2">
            <FilterMenu
              label="Pod"
              value={podFilter}
              onChange={onChangePod}
              options={[
                { value: 'all', label: 'All pods', count: matching.length },
                ...podChoices.map((pod) => ({
                  value: pod,
                  label: pod || 'No pod',
                  count: podCounts.get(pod) ?? 0,
                })),
              ]}
            />
            <FilterMenu
              label="Status"
              value={statusFilter}
              onChange={(v) => onChangeStatus(v as StatusFilter)}
              options={filters.map(({ value, label }) => ({
                value,
                label,
                count: counts[value],
              }))}
            />
            {/* Only once something is actually filtered — a permanent Reset is a
                control that does nothing most of the time, and the shortest way
                back to the whole list shouldn't be two menus deep. */}
            {(podFilter !== 'all' || statusFilter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  onChangePod('all')
                  onChangeStatus('all')
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-muted outline-none transition hover:bg-black/[0.04] hover:text-ink focus-visible:ring-2 focus-visible:ring-ink/25"
              >
                <X size={12} weight="bold" aria-hidden="true" />
                Reset
              </button>
            )}
          </div>
        ) : (
          <div className="inline-flex flex-wrap items-center gap-1 rounded-full bg-black/[0.04] p-1">
            {filters.map(({ value, label }) => {
              const active = statusFilter === value
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => onChangeStatus(value)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${
                    active
                      ? 'bg-card text-ink shadow-[0_1px_2px_rgba(0,0,0,0.06),0_1px_1px_rgba(0,0,0,0.04)]'
                      : 'text-muted hover:text-ink'
                  }`}
                >
                  {label}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums transition ${
                      active ? 'bg-black/[0.06] text-ink' : 'bg-black/[0.05] text-muted'
                    }`}
                  >
                    {counts[value]}
                  </span>
                </button>
              )
            })}
          </div>
        )}
        <div className="flex items-center gap-2">
          <SearchInput value={search} onChange={setSearch} team={tab === 'team'} />
          <ViewToggle view={view} onChange={onChangeView} />
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="mt-8 rounded-[26px] border border-dashed border-line-strong bg-black/[0.015] px-6 py-14 text-center text-[15px] text-muted">
          {query ? <>No forms match “{search.trim()}”.</> : <>No {activeLabel.toLowerCase()} forms.</>}
        </div>
      ) : view === 'card' ? (
        <div className="u-stagger mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((item) => (
            <FormCard key={item.form.id} item={item} viewerEmail={viewerEmail} onDelete={onDelete} onRename={onRename} />
          ))}
        </div>
      ) : (
        <div className="mt-5">
          <ListHeader tab={tab} showCreator={visible.some((i) => i.creator)} />
          <div className="u-stagger divide-y divide-line border-t border-line">
            {visible.map((item) => (
              <FormRow key={item.form.id} item={item} tab={tab} onDelete={onDelete} onRename={onRename} />
            ))}
          </div>
        </div>
      )}
    </>
  )
}

function SearchInput({
  value,
  onChange,
  team,
}: {
  value: string
  onChange: (v: string) => void
  team: boolean
}) {
  const label = team ? 'Search forms or people' : 'Search forms'
  return (
    <div className="relative">
      <MagnifyingGlass
        size={14}
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onChange('')}
        placeholder={label}
        aria-label={team ? 'Search forms by title or creator' : 'Search forms by title'}
        className="h-9 w-[168px] rounded-full bg-black/[0.04] pl-[30px] pr-[30px] text-[13px] outline-none transition placeholder:text-muted focus:bg-card focus:ring-2 focus:ring-black/[0.06] sm:w-[200px] [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-full text-muted transition hover:bg-black/[0.06] hover:text-ink"
        >
          <X size={12} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-black/[0.04] p-1">
      <button
        type="button"
        onClick={() => onChange('list')}
        aria-label="List view"
        aria-pressed={view === 'list'}
        className={`grid h-7 w-8 place-items-center rounded-full transition ${
          view === 'list'
            ? 'bg-card text-ink shadow-[0_1px_2px_rgba(0,0,0,0.06),0_1px_1px_rgba(0,0,0,0.04)]'
            : 'text-muted hover:text-ink'
        }`}
      >
        <ListBullets size={15} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => onChange('card')}
        aria-label="Card view"
        aria-pressed={view === 'card'}
        className={`grid h-7 w-8 place-items-center rounded-full transition ${
          view === 'card'
            ? 'bg-card text-ink shadow-[0_1px_2px_rgba(0,0,0,0.06),0_1px_1px_rgba(0,0,0,0.04)]'
            : 'text-muted hover:text-ink'
        }`}
      >
        <SquaresFour size={15} aria-hidden="true" />
      </button>
    </div>
  )
}

/** One label/value line in a card — the card's stand-in for a list column. */
/** A labelled fact on a card — label over value, so two sit side by side. */
function CardMeta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[13px] text-muted">{label}</p>
      <p className="mt-0.5 flex min-w-0 text-[14px] font-medium text-ink">{children}</p>
    </div>
  )
}

function FormCard({ item, viewerEmail, onDelete, onRename }: { item: ListItem; viewerEmail: string | null; onDelete?: (id: string) => void; onRename?: (id: string, name: string) => void }) {
  const { form, responseCount, creator, hasResponded = false } = item
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const title = formTitle(form)
  const href = entryHref(item)
  const mine = !creator || creator.mine
  // font-sans opts out of the global pixel heading rule — form titles are
  // content, not display type, so they read better in Geist Sans.
  const body = (
    <h2 className="line-clamp-2 font-sans text-[17px] font-semibold leading-snug tracking-tight">
      {title}
    </h2>
  )
  /**
   * Everyone on the form: whoever made it, then whoever they added.
   *
   * The creator leads and is never omitted — they're a collaborator by
   * definition, and a stack that hid them on your own board made a shared form
   * look like it belonged to the person you'd invited. On Team the creator
   * comes with the row; on your own board it's you, hence `viewerEmail`.
   *
   * Deduped, because a creator who also appears in `collaborators` is one
   * person, and lowercased for that comparison since addresses aren't
   * case-sensitive.
   */
  const owner = creator?.email ?? viewerEmail
  const faces: { email: string; label: string }[] = []
  const seen = new Set<string>()
  for (const email of [...(owner ? [owner] : []), ...(form.collaborators ?? [])]) {
    const key = email.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    faces.push({
      email,
      // "You" matches how the row names the viewer elsewhere.
      label: viewerEmail && key === viewerEmail.toLowerCase() ? 'You' : personName(email),
    })
  }

  return (
    // Flat by design: a single hairline carries the card, and hover shifts the
    // border and surface rather than adding elevation. u-stagger makes each card
    // a stacking context, so lift the card while its menu is open (as FormRow does).
    // No overflow-hidden on the card: the actions menu opens downward out of the
    // thumbnail and would be clipped by it. The thumbnail clips itself instead.
    <div
      className={`group relative flex flex-col rounded-[20px] border bg-card transition hover:bg-black/[0.015] ${
        menuOpen ? 'z-50 border-line-strong' : 'border-line hover:border-line-strong'
      }`}
    >
      {/* The form's own hero, at card size — see FormThumbnail. rounded-t-[19px]
          rather than [20px]: it sits inside the card's 1px border, so matching
          the outer radius leaves a hairline of card showing at the corners. */}
      <Link
        href={href}
        aria-label={title}
        className="block aspect-[17/6] w-full overflow-hidden rounded-t-[19px] bg-black/[0.03]"
      >
        <FormThumbnail form={form} />
      </Link>

      {onDelete && (
        // Over the thumbnail rather than beside the status chip: the chip row is
        // gone, and a menu floating on the artwork is out of the way of every
        // other thing on the card.
        <div className="absolute right-2 top-2 z-10">
          <RowMenu
            open={menuOpen}
            onOpenChange={setMenuOpen}
            onDelete={() => onDelete(form.id)}
            onRename={onRename && (() => setRenaming(true))}
            editHref={form.status === 'draft' ? undefined : `/creator/${form.id}/edit`}
            editLabel={form.status === 'closed' ? 'View form' : 'Edit form'}
            onThumbnail
          />
        </div>
      )}

      <div className="relative flex flex-1 flex-col p-4">
        {/* Straddles the thumbnail's edge, as in the design — hence the pull-up
            and the ring, which reads as a cut-out from the card beneath. */}
        {faces.length > 0 && (
          <div className="absolute -top-4 right-4 flex">
            {faces.slice(0, 3).map((f, i) => (
              /* Names on hover, via the app's own tooltip rather than `title`:
                 the native one waits about a second and prints the raw address.
                 The overlap lives on this wrapper — it's the flex item now — and
                 z-index is a static class per position so Tailwind emits it. */
              <Tooltip
                key={f.email}
                label={f.label}
                className={`-ml-2 first:ml-0 ${['z-30', 'z-20', 'z-10'][i]}`}
              >
                <span
                  className="u-circle grid h-7 w-7 place-items-center rounded-full text-[11px] font-semibold text-white ring-2 ring-card"
                  style={{ backgroundColor: personColor(f.email) }}
                >
                  {personInitials(f.email)}
                </span>
              </Tooltip>
            ))}
            {faces.length > 3 && (
              /* The overflow chip stays neutral — it stands for several people,
                 so borrowing any one person's colour would be a lie. */
              <Tooltip
                label={faces.slice(3).map((f) => f.label).join(', ')}
                className="-ml-2"
              >
                <span className="u-circle grid h-7 w-7 place-items-center rounded-full bg-ink/70 text-[11px] font-semibold text-white ring-2 ring-card">
                  +{faces.length - 3}
                </span>
              </Tooltip>
            )}
          </div>
        )}

        {/* self-start, or the badge stretches to the card's width: it's a block
            child of a flex column, which stretches its items by default. */}
        <div className="self-start">
          <StatusBadge status={form.status} />
        </div>

        {/* Renaming replaces the link outright — an input nested in one can't be
            clicked into without following it. */}
        {renaming && onRename ? (
          <div className="mt-3">
            <RenameField
              value={formName(form)}
              className="font-sans text-[17px] font-semibold leading-snug tracking-tight"
              onDone={(next) => {
                setRenaming(false)
                if (next !== null) onRename(form.id, next)
              }}
            />
          </div>
        ) : (
          <Link href={href} className="mt-3">
            {body}
          </Link>
        )}

        {/* Two facts, side by side and labelled — the same columns the list view
            carries, in the shape the card has room for. mt-auto pins them to the
            bottom so cards with one-line and two-line titles still line up. */}
        <div className="mt-auto grid grid-cols-2 gap-3 pt-4">
          <CardMeta label="Expires on">
            <span className="tabular-nums">{expiryShort(form.expires_at) ?? '—'}</span>
          </CardMeta>
          <CardMeta label="POD">
            <span className="truncate">{form.pod || '—'}</span>
          </CardMeta>
        </div>
      </div>

      {/* Same one-primary-action rule as the row — see FormRow for the table. */}
      <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
        <p className="flex items-baseline gap-1.5">
          <span className="text-[19px] font-semibold leading-none tabular-nums">{responseCount}</span>
          <span className="text-[13px] text-muted">{responseCount === 1 ? 'response' : 'responses'}</span>
        </p>
        {mine ? (
          <Link
            href={form.status === 'draft' ? `/creator/${form.id}/edit` : `/creator/${form.id}/results`}
            aria-label={form.status === 'draft' ? `Edit ${title}` : `Results for ${title}`}
            className="rounded-[12px] bg-black/[0.045] px-8 py-2 text-center text-[13px] font-semibold text-ink transition hover:bg-black/[0.08]"
          >
            {form.status === 'draft' ? 'Edit' : 'Results'}
          </Link>
        ) : (
          <TeamEntryActions form={form} title={title} hasResponded={hasResponded} />
        )}
      </div>
    </div>
  )
}

/** Who made a form, for the Team list. There is no profile table — the
 *  account email is the only identity the app has (see personName). */
function CreatorChip({ email, mine }: { email: string; mine: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted" title={email}>
      <span className="u-circle grid h-5 w-5 shrink-0 place-items-center rounded-full bg-black/[0.06] text-[10px] font-semibold text-ink">
        {personInitials(email)}
      </span>
      <span className="truncate">{mine ? 'You' : personName(email)}</span>
    </span>
  )
}

function FormRow({ item, tab, onDelete, onRename }: { item: ListItem; tab: DashboardTab; onDelete?: (id: string) => void; onRename?: (id: string, name: string) => void }) {
  const { form, responseCount, creator, hasResponded = false } = item
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const title = formTitle(form)
  const expiry = expiryLabel(form.expires_at)
  const href = entryHref(item)
  const mine = !creator || creator.mine
  const body = (
    <>
      <h2 className="truncate font-sans text-[15px] font-semibold tracking-tight">{title}</h2>
      {/* Narrow screens drop the collaborator, expiry and response columns, so
          those facts fold onto one line under the title instead. Two variants
          rather than one with conditional separators: the response count comes
          back as its own column at sm, and a lone `·` left behind by a hidden
          part is worse than saying it twice. */}
      <p className="mt-0.5 flex items-center gap-1.5 truncate text-[13px] text-muted lg:hidden">
        {creator && <CreatorChip email={creator.email} mine={creator.mine} />}
        <span className="truncate sm:hidden">
          {[
            tab === 'team' ? form.pod || null : null,
            `${responseCount} ${responseCount === 1 ? 'response' : 'responses'}`,
            expiry,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
        {expiry && <span className="hidden truncate sm:inline">{expiry}</span>}
      </p>
    </>
  )
  return (
    // u-stagger animates each row, which makes it a stacking context — lift the
    // whole row while its menu is open so the popover clears the sibling rows.
    <div
      className={`group relative -mx-3 grid ${ROW_GRID[tab]} items-center gap-4 rounded-[16px] px-3 py-3.5 transition hover:bg-black/[0.025] ${
        menuOpen ? 'z-50' : ''
      }`}
    >
      <div className="min-w-0">
        <StatusBadge status={form.status} />
      </div>

      {/* before:inset-0 stretches this link across the whole row, so the entire
          row — not just the title text — opens the form, while the link keeps
          the title as its accessible name. The actions clear it via z-10.
          Renaming drops the link entirely: that same before:inset-0 overlay
          would otherwise sit on top of the input and swallow every click. */}
      {renaming && onRename ? (
        <div className="relative z-10 min-w-0">
          <RenameField
            value={formName(form)}
            className="font-sans text-[15px] font-semibold tracking-tight"
            onDone={(next) => {
              setRenaming(false)
              if (next !== null) onRename(form.id, next)
            }}
          />
        </div>
      ) : (
        <Link href={href} className="min-w-0 before:absolute before:inset-0 before:content-['']">
          {body}
        </Link>
      )}

      {/* Pod — Team only. A form published before pods existed has none, and an
          em dash reads better in a column than an empty cell. */}
      {tab === 'team' && (
        <div className="min-w-0 text-[13px] text-muted">
          <span className="block truncate">{form.pod || '—'}</span>
        </div>
      )}

      {/* Collaborator — Team only, and only from lg where there's room for it. */}
      {creator && (
        <div className="hidden min-w-0 lg:block">
          <CreatorChip email={creator.email} mine={creator.mine} />
        </div>
      )}

      <div className="hidden text-right text-[13px] tabular-nums text-muted lg:block">
        {expiryShort(form.expires_at) ?? '—'}
      </div>

      {/* Display face on the number so the counts line up as a scannable column;
          the header labels it, so the cell is just the figure. */}
      <div className="hidden text-right sm:block">
        <span className="text-[15px] font-semibold leading-none tabular-nums">
          {responseCount}
        </span>
      </div>

      {/* One primary action per row, in a fixed-width cell so every row's right
          edge lines up however the label differs.
            mine   · draft  → Edit          (nothing to read yet)
            mine   · open   → Results       (Edit moves into the menu)
            mine   · closed → Results       (it can no longer be edited)
            theirs · either → Preview       (read-only, with a Results tab) */}
      <div className="relative z-10 flex w-[184px] shrink-0 items-center justify-end gap-1.5">
        {mine ? (
          form.status === 'draft' ? (
            <Link
              href={`/creator/${form.id}/edit`}
              aria-label={`Edit ${title}`}
              className="hidden rounded-[12px] bg-black/[0.045] px-3 py-1.5 text-[13px] font-semibold text-ink transition hover:bg-black/[0.08] sm:block"
            >
              Edit
            </Link>
          ) : (
            <Link
              href={`/creator/${form.id}/results`}
              aria-label={`Results for ${title}`}
              className="hidden rounded-[12px] bg-black/[0.045] px-3 py-1.5 text-[13px] font-semibold text-ink transition hover:bg-black/[0.08] sm:block"
            >
              Results
            </Link>
          )
        ) : (
          <TeamEntryActions form={form} title={title} hasResponded={hasResponded} compact />
        )}
        {onDelete && (
          <RowMenu
            open={menuOpen}
            onOpenChange={setMenuOpen}
            onDelete={() => onDelete(form.id)}
            onRename={onRename && (() => setRenaming(true))}
            // Whatever isn't the row's primary button lives in here.
            editHref={form.status === 'draft' ? undefined : `/creator/${form.id}/edit`}
            editLabel={form.status === 'closed' ? 'View form' : 'Edit form'}
            resultsHref={form.status === 'draft' ? undefined : `/creator/${form.id}/results`}
          />
        )}
      </div>
    </div>
  )
}

/**
 * Team forms have two distinct destinations:
 *
 * - Preview is the read-only inspection surface and remains available.
 * - Vote is the real published form, opened separately so it can record a
 *   response. Once submitted, it becomes Results (when shared) or a Voted
 *   marker (when the creator kept results private).
 */
function TeamEntryActions({
  form,
  title,
  hasResponded,
  compact = false,
}: {
  form: ListedForm
  title: string
  hasResponded: boolean
  compact?: boolean
}) {
  const pad = compact ? 'px-3 py-1.5' : 'px-4 py-2'
  const actionClass = `rounded-[12px] ${pad} text-center text-[13px] font-semibold transition`
  const resultAvailable = hasResponded && form.show_results_to_voters
  const canVote = !hasResponded && acceptsResponses(form)

  return (
    <div className="flex items-center justify-end gap-1.5">
      <Link
        href={`/creator/${form.id}/preview`}
        aria-label={`Preview ${title}`}
        className={`${actionClass} bg-black/[0.045] text-ink hover:bg-black/[0.08]`}
      >
        Preview
      </Link>
      {canVote && (
        <Link
          href={`/f/${form.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Vote on ${title}`}
          className={`${actionClass} bg-ink text-white hover:opacity-90`}
        >
          Vote
        </Link>
      )}
      {resultAvailable && (
        <Link
          href={`/creator/${form.id}/results`}
          aria-label={`Results for ${title}`}
          className={`${actionClass} bg-ink text-white hover:opacity-90`}
        >
          Results
        </Link>
      )}
      {hasResponded && !form.show_results_to_voters && (
        <span
          aria-label={`Voted on ${title}`}
          className={`${actionClass} inline-flex items-center gap-1 bg-open-bg text-open`}
        >
          <Check size={13} weight="bold" aria-hidden="true" /> Voted
        </span>
      )}
    </div>
  )
}

/**
 * One filter axis, as a menu.
 *
 * Native `<select>` was the first cut and looked bolted on: the browser draws
 * its own control — its own chevron, its own focus ring, its own font metrics —
 * inside a pill styled by the app, so the two never agreed. This borrows the
 * vocabulary the dashboard already speaks (see RowMenu): a quiet pill that opens
 * a bordered card of rows, with the selection ticked and the count trailing it.
 *
 * The trigger states what's selected rather than just naming the axis, so a
 * filtered list explains itself without opening anything.
 */
function FilterMenu({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string; count: number }[]
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const selected = options.find((o) => o.value === value) ?? options[0]
  // 'all' is the resting state; anything else is a filter someone applied, and
  // the trigger says so without having to be opened.
  const active = value !== 'all'

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      setOpen(false)
      // Escape hands focus back to the control you opened, not to the document.
      triggerRef.current?.focus()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Filter by ${label.toLowerCase()}`}
        className={`inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[13px] outline-none transition focus-visible:ring-2 focus-visible:ring-ink/25 ${
          open || active
            ? 'bg-card text-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.09]'
            : 'bg-black/[0.04] text-ink hover:bg-black/[0.07]'
        }`}
      >
        <span className="font-medium text-muted">{label}</span>
        <span className="font-semibold">{selected?.label ?? '—'}</span>
        <CaretDown
          size={12}
          weight="bold"
          aria-hidden="true"
          className={`text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={label}
          // Same card as RowMenu — one menu surface across the dashboard.
          className="u-popover absolute left-0 top-full z-50 mt-1.5 max-h-[320px] min-w-[220px] origin-top overflow-y-auto rounded-[14px] border border-line bg-card p-1 shadow-[0_4px_12px_-2px_rgba(0,0,0,0.08),0_16px_40px_-12px_rgba(0,0,0,0.22)]"
        >
          {options.map((o) => {
            const isSelected = o.value === value
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(o.value)
                  setOpen(false)
                  triggerRef.current?.focus()
                }}
                // A row with nothing behind it still selects — it's how you find
                // out the pod is empty — but it reads as the dead end it is.
                className={`flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-[13px] outline-none transition hover:bg-black/[0.04] focus-visible:bg-black/[0.04] ${
                  o.count === 0 && !isSelected ? 'text-muted' : 'text-ink'
                }`}
              >
                {/* The tick keeps its column whether or not it's drawn, so the
                    labels line up instead of jumping by an icon's width. */}
                <span className="grid w-3.5 flex-none place-items-center">
                  {isSelected && <Check size={13} weight="bold" aria-hidden="true" />}
                </span>
                <span className={`min-w-0 flex-1 truncate ${isSelected ? 'font-semibold' : 'font-medium'}`}>
                  {o.label}
                </span>
                <span className="flex-none text-[12px] tabular-nums text-muted">{o.count}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Column headers — the only thing naming the date and count columns. */
function ListHeader({ tab, showCreator }: { tab: DashboardTab; showCreator: boolean }) {
  const cell = 'text-[11px] font-semibold uppercase tracking-[0.06em] text-muted'
  return (
    <div className={`-mx-3 hidden ${ROW_GRID[tab]} items-center gap-4 px-3 pb-2 sm:grid`}>
      <span className={cell}>Status</span>
      <span className={cell}>Form</span>
      {tab === 'team' && <span className={cell}>Pod</span>}
      {showCreator && <span className={`hidden lg:block ${cell}`}>Collaborator</span>}
      <span className={`hidden text-right lg:block ${cell}`}>Expires</span>
      <span className={`text-right ${cell}`}>Responses</span>
      <span aria-hidden="true" />
    </div>
  )
}

/**
 * Rename in place. Enter and blur commit, Escape reverts; `onDone(null)` means
 * "no change", which is also what an emptied field gives, so a stray click-away
 * can't blank a form's name.
 */
function RenameField({
  value,
  className = '',
  onDone,
}: {
  value: string
  className?: string
  onDone: (next: string | null) => void
}) {
  const [draft, setDraft] = useState(value)
  const cancelled = useRef(false)
  const ref = useRef<HTMLInputElement>(null)

  // Focus and preselect from a mount effect rather than `autoFocus` + onFocus:
  // autoFocus fires during commit, so whether React's onFocus handler is live
  // yet to run the select() is a race, and it lost about half the time.
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  return (
    <input
      ref={ref}
      value={draft}
      aria-label="Form name"
      onChange={(e) => setDraft(e.target.value)}
      // Enter and Escape both finish through blur, so there is one commit path.
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.blur()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          cancelled.current = true
          e.currentTarget.blur()
        }
      }}
      onBlur={() => onDone(cancelled.current ? null : draft.trim() || null)}
      className={`w-full rounded-[10px] border border-ink bg-card px-2 py-1 outline-none ${className}`}
    />
  )
}

function RowMenu({
  open,
  onOpenChange,
  onDelete,
  onRename,
  editHref,
  editLabel = 'Edit form',
  resultsHref,
  onThumbnail = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDelete: () => void
  onRename?: () => void
  /** Editing a published form — the row's primary button is Results by then. */
  editHref?: string
  editLabel?: string
  /** Rendered only under `sm`, where the row hides its primary button. */
  resultsHref?: string
  /** Sitting on a card's artwork rather than a white surface, where a muted
   *  glyph on an unknown background could land invisible on either. */
  onThumbnail?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)

  // Dismiss on outside click or Escape while the menu is open.
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) onOpenChange(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onOpenChange(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onOpenChange])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        // `hover:` only matches under `@media (hover: hover)`, so a hover-reveal
        // alone leaves this button permanently invisible on touch — keep it
        // shown under `sm`, where there is no other route to these actions.
        className={`grid h-8 w-8 place-items-center rounded-full transition ${
          onThumbnail
            ? `bg-black/45 text-white backdrop-blur-sm hover:bg-black/65 ${open ? 'opacity-100' : 'opacity-0 max-sm:opacity-100 group-hover:opacity-100 focus-visible:opacity-100'}`
            : `text-muted hover:bg-black/[0.05] hover:text-ink ${
                open
                  ? 'bg-black/[0.05] text-ink opacity-100'
                  : 'opacity-0 max-sm:opacity-100 group-hover:opacity-100 focus-visible:opacity-100'
              }`
        }`}
      >
        <DotsThreeVertical size={16} weight="bold" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1.5 min-w-[160px] overflow-hidden rounded-[14px] border border-line bg-card p-1 shadow-[0_4px_12px_-2px_rgba(0,0,0,0.08),0_16px_40px_-12px_rgba(0,0,0,0.22)]"
        >
          {resultsHref && (
            <Link
              href={resultsHref}
              role="menuitem"
              onClick={() => onOpenChange(false)}
              className="flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-[13px] font-medium text-ink transition hover:bg-black/[0.04] sm:hidden"
            >
              <ChartBar size={15} aria-hidden="true" />
              See results
            </Link>
          )}
          {editHref && (
            <Link
              href={editHref}
              role="menuitem"
              onClick={() => onOpenChange(false)}
              className="flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-[13px] font-medium text-ink transition hover:bg-black/[0.04]"
            >
              <SlidersHorizontal size={15} aria-hidden="true" />
              {editLabel}
            </Link>
          )}
          {onRename && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onOpenChange(false)
                onRename()
              }}
              className="flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-[13px] font-medium text-ink transition hover:bg-black/[0.04]"
            >
              <PencilSimple size={15} aria-hidden="true" />
              Rename
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onOpenChange(false)
              onDelete()
            }}
            className="flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-[13px] font-medium text-red-600 transition hover:bg-red-50"
          >
            <Trash size={15} aria-hidden="true" />
            Delete form
          </button>
        </div>
      )}
    </div>
  )
}

function EmptyState({ onCreate, creating }: { onCreate: () => void; creating: boolean }) {
  return (
    <div className="mt-10 flex flex-col items-center rounded-[26px] border border-dashed border-line-strong bg-black/[0.015] px-6 py-16 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-black/[0.06]">
        <Sparkle size={22} aria-hidden="true" />
      </div>
      <h2 className="mt-4 font-sans text-[17px] font-semibold tracking-tight">No forms yet</h2>
      <p className="mt-1.5 max-w-sm text-[15px] leading-relaxed text-muted">
        Build your first feedback form — a welcome screen, options for voters to compare, and the
        questions you want answered.
      </p>
      {/* Below md the button is hidden, so say why rather than leaving a dead
          end where the call to action used to be. */}
      <p className="mt-4 max-w-sm text-[14px] leading-relaxed text-muted md:hidden">
        Building a form needs a larger screen — open Prism on a desktop to get started.
      </p>
      <button
        type="button"
        onClick={onCreate}
        disabled={creating}
        className="mt-5 hidden rounded-[16px] bg-ink px-5 py-2.5 text-[14px] font-medium text-white transition hover:opacity-90 disabled:opacity-50 md:block"
      >
        {creating ? 'Creating…' : '+ Create a form'}
      </button>
    </div>
  )
}

function TeamEmptyState() {
  return (
    <div className="mt-10 flex flex-col items-center rounded-[26px] border border-dashed border-line-strong bg-black/[0.015] px-6 py-16 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-black/[0.06]">
        <UsersThree size={22} aria-hidden="true" />
      </div>
      <h2 className="mt-4 font-sans text-[17px] font-semibold tracking-tight">Nothing published yet</h2>
      <p className="mt-1.5 max-w-sm text-[15px] leading-relaxed text-muted">
        Every form the team publishes lands here — active ones to vote on, closed ones to look back
        at. Publish yours and it becomes the first.
      </p>
    </div>
  )
}

function TeamErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mt-10 flex flex-col items-center rounded-[26px] border border-dashed border-line-strong bg-black/[0.015] px-6 py-16 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-black/[0.06]">
        <UsersThree size={22} aria-hidden="true" />
      </div>
      <h2 className="mt-4 font-sans text-[17px] font-semibold tracking-tight">
        Team workspace unavailable
      </h2>
      <p className="mt-1.5 max-w-sm text-[15px] leading-relaxed text-muted">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 rounded-[16px] bg-ink px-5 py-2.5 text-[14px] font-medium text-white transition hover:opacity-90"
      >
        Try again
      </button>
    </div>
  )
}

function GridSkeleton() {
  return (
    <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-52 animate-pulse rounded-[22px] border border-line bg-black/[0.015]" />
      ))}
    </div>
  )
}

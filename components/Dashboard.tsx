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
  type TeamForm,
  type DashboardForm,
  type ListedForm,
} from '@/lib/store'
import { formName } from '@/lib/builder'
import { expiryLabel, personInitials, personName } from '@/lib/format'
import CreatorHeader from '@/components/CreatorHeader'
import StatusBadge from '@/components/StatusBadge'
import type { FormStatus } from '@/lib/types'

type ViewMode = 'list' | 'card'
type StatusFilter = 'all' | FormStatus
/**
 * Two lists, one layout: your own workspace, and every form the team has
 * published (see getTeamForms). Each is its own route so the header can
 * link between them — this component is the body both routes render.
 */
export type DashboardTab = 'mine' | 'team'
const VIEW_STORAGE_KEY = 'prism.dashboard.view'

// The two lists outlive a tab switch, which is now a route change: a remount
// paints the last snapshot instead of a skeleton, then refreshes underneath.
const listCache: { mine: DashboardForm[] | null; team: TeamForm[] | null } = {
  mine: null,
  team: null,
}

// The saved view preference lives in localStorage; useSyncExternalStore keeps
// the server snapshot and the client in step without a hydration gap. Cards are
// the default — anyone who has already chosen list keeps it, since the stored
// value wins over this.
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
 * Columns: Status · Form · [Collaborator] · Expires · Responses · Actions.
 * Text columns are left-aligned, dates and counts right-aligned against the
 * actions. The template changes per breakpoint in step with which cells are
 * hidden — a `display:none` cell takes no grid track, so the counts have to
 * match or every row shifts.
 */
const ROW_GRID: Record<DashboardTab, string> = {
  mine: 'grid-cols-[84px_minmax(0,1fr)_auto] sm:grid-cols-[84px_minmax(0,1fr)_96px_auto] lg:grid-cols-[84px_minmax(0,1fr)_104px_96px_auto]',
  team: 'grid-cols-[84px_minmax(0,1fr)_auto] sm:grid-cols-[84px_minmax(0,1fr)_96px_auto] lg:grid-cols-[84px_minmax(0,1fr)_150px_104px_96px_auto]',
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
 * Where an entry's title goes: the builder for your own, the live form for
 * someone else's. A closed form you don't own has nowhere to send you.
 *
 * Your own closed form opens its results instead of the builder — it can't be
 * edited any more (see the builder's read-only mode), so what's left to do with
 * it is read what it found.
 *
 * Someone else's goes to the read-only preview, open or closed. That page is
 * also where its results live, behind a tab.
 */
function entryHref(item: ListItem): string {
  if (!item.creator || item.creator.mine) {
    return item.form.status === 'closed'
      ? `/creator/${item.form.id}/results`
      : `/creator/${item.form.id}/edit`
  }
  return `/creator/${item.form.id}/preview`
}

/** The dashboard body. Both /creator and /creator/team render this — the
 *  header owns the switch between them. */
export default function Dashboard({ tab }: { tab: DashboardTab }) {
  const router = useRouter()
  const { user, loading: authLoading } = useCurrentUser()
  const [forms, setForms] = useState<DashboardForm[] | null>(listCache.mine)
  const [team, setTeam] = useState<TeamForm[] | null>(listCache.team)
  const [creating, setCreating] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
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
    getTeamForms(user.id).then((c) => {
      listCache.team = c
      setTeam(c)
    })
  }, [tab, user])

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

        {items === null ? (
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
  onDelete,
  onRename,
}: {
  tab: DashboardTab
  items: ListItem[]
  view: ViewMode
  onChangeView: (v: ViewMode) => void
  statusFilter: StatusFilter
  onChangeStatus: (s: StatusFilter) => void
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

  const counts = matching.reduce(
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
    statusFilter === 'all' ? matching : matching.filter(({ form }) => form.status === statusFilter)
  ).toSorted((a, b) => STATUS_ORDER[a.form.status] - STATUS_ORDER[b.form.status])
  const filters = STATUS_FILTERS[tab]
  const activeLabel = filters.find((f) => f.value === statusFilter)?.label ?? 'All'

  return (
    <>
      <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
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
            <FormCard key={item.form.id} item={item} onDelete={onDelete} onRename={onRename} />
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
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
      >
        <path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
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
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
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
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
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
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 5h6v6H4zM14 5h6v6h-6zM4 15h6v4H4zM14 15h6v4h-6z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  )
}

/** One label/value line in a card — the card's stand-in for a list column. */
function CardMeta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[13px] text-muted">{label}</span>
      <span className="min-w-0 text-right text-[13px] font-medium text-ink">{children}</span>
    </div>
  )
}

function FormCard({ item, onDelete, onRename }: { item: ListItem; onDelete?: (id: string) => void; onRename?: (id: string, name: string) => void }) {
  const { form, responseCount, creator } = item
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const title = formTitle(form)
  const href = entryHref(item)
  const mine = !creator || creator.mine
  // font-sans opts out of the global pixel heading rule — form titles are
  // content, not display type, so they read better in Geist Sans.
  const body = (
    <h2 className="line-clamp-2 font-sans text-[15px] font-semibold leading-snug tracking-tight">
      {title}
    </h2>
  )
  return (
    // Flat by design: a single hairline carries the card, and hover shifts the
    // border and surface rather than adding elevation. u-stagger makes each card
    // a stacking context, so lift the card while its menu is open (as FormRow does).
    <div
      className={`group flex flex-col rounded-[20px] border bg-card p-4 transition hover:bg-black/[0.015] ${
        menuOpen ? 'relative z-50 border-line-strong' : 'border-line hover:border-line-strong'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <StatusBadge status={form.status} />
        {onDelete && (
          <RowMenu
            open={menuOpen}
            onOpenChange={setMenuOpen}
            onDelete={() => onDelete(form.id)}
            onRename={onRename && (() => setRenaming(true))}
            editHref={form.status === 'draft' ? undefined : `/creator/${form.id}/edit`}
            editLabel={form.status === 'closed' ? 'View form' : 'Edit form'}
          />
        )}
      </div>

      {/* Renaming replaces the link outright — an input nested in one can't be
          clicked into without following it. */}
      {renaming && onRename ? (
        <div className="mt-3 flex-1">
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
        <Link href={href} className="mt-3 flex-1">
          {body}
        </Link>
      )}

      {/* The list's columns, as label/value lines — so a form reads the same
          whichever view you're in. Collaborator only where there is one. */}
      <div className="mt-4 space-y-1.5 border-t border-line pt-3">
        {creator && (
          <CardMeta label="Collaborator">
            <span className="flex justify-end">
              <CreatorChip email={creator.email} mine={creator.mine} />
            </span>
          </CardMeta>
        )}
        <CardMeta label="Expires">
          <span className="tabular-nums">{expiryShort(form.expires_at) ?? '—'}</span>
        </CardMeta>
        <CardMeta label="Responses">
          <span className="font-pixel text-[15px] font-semibold leading-none tabular-nums">
            {responseCount}
          </span>
        </CardMeta>
      </div>

      {/* Same one-primary-action rule as the row — see FormRow for the table. */}
      <div className="mt-4">
        {mine ? (
          <Link
            href={form.status === 'draft' ? `/creator/${form.id}/edit` : `/creator/${form.id}/results`}
            aria-label={form.status === 'draft' ? `Edit ${title}` : `Results for ${title}`}
            className="block rounded-[12px] bg-black/[0.045] py-1.5 text-center text-[13px] font-semibold text-ink transition hover:bg-black/[0.08]"
          >
            {form.status === 'draft' ? 'Edit' : 'Results'}
          </Link>
        ) : (
          <Link
            href={`/creator/${form.id}/preview`}
            aria-label={`Preview ${title}`}
            className="block rounded-[12px] bg-black/[0.045] py-1.5 text-center text-[13px] font-semibold text-ink transition hover:bg-black/[0.08]"
          >
            Preview
          </Link>
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
  const { form, responseCount, creator } = item
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
        <span className="font-pixel text-[15px] font-semibold leading-none tabular-nums">
          {responseCount}
        </span>
      </div>

      {/* One primary action per row, in a fixed-width cell so every row's right
          edge lines up however the label differs.
            mine   · draft  → Edit          (nothing to read yet)
            mine   · open   → Results       (Edit moves into the menu)
            mine   · closed → Results       (it can no longer be edited)
            theirs · either → Preview       (read-only, with a Results tab) */}
      <div className="relative z-10 flex w-[124px] shrink-0 items-center justify-end gap-1.5">
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
          <Link
            href={`/creator/${form.id}/preview`}
            aria-label={`Preview ${title}`}
            className="rounded-[12px] bg-black/[0.045] px-3 py-1.5 text-[13px] font-semibold text-ink transition hover:bg-black/[0.08]"
          >
            Preview
          </Link>
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

/** Column headers — the only thing naming the date and count columns. */
function ListHeader({ tab, showCreator }: { tab: DashboardTab; showCreator: boolean }) {
  const cell = 'text-[11px] font-semibold uppercase tracking-[0.06em] text-muted'
  return (
    <div className={`-mx-3 hidden ${ROW_GRID[tab]} items-center gap-4 px-3 pb-2 sm:grid`}>
      <span className={cell}>Status</span>
      <span className={cell}>Form</span>
      {showCreator && <span className={`hidden lg:block ${cell}`}>Collaborator</span>}
      <span className={`hidden text-right lg:block ${cell}`}>Expires</span>
      <span className={`text-right ${cell}`}>Responses</span>
      <span className="w-[124px]" />
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
        className={`grid h-8 w-8 place-items-center rounded-full text-muted transition hover:bg-black/[0.05] hover:text-ink ${
          open
            ? 'bg-black/[0.05] text-ink opacity-100'
            : 'opacity-0 max-sm:opacity-100 group-hover:opacity-100 focus-visible:opacity-100'
        }`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="12" cy="19" r="1.6" />
        </svg>
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
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 19V9m7 10V5m7 14v-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
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
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 8h9M17 8h3M4 16h3M11 16h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                <circle cx="15" cy="8" r="2" stroke="currentColor" strokeWidth="1.6" />
                <circle cx="9" cy="16" r="2" stroke="currentColor" strokeWidth="1.6" />
              </svg>
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
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 20h16M5 15.5 15.5 5a2.1 2.1 0 0 1 3 3L8 18.5l-4 1z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
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
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 7h16M9 7V5h6v2m-8 0 1 13h8l1-13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
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
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-black/[0.06] text-xl">✨</div>
      <h2 className="mt-4 text-[17px] font-semibold tracking-tight">No forms yet</h2>
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
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-black/[0.06] text-xl">🌍</div>
      <h2 className="mt-4 text-[17px] font-semibold tracking-tight">Nothing published yet</h2>
      <p className="mt-1.5 max-w-sm text-[15px] leading-relaxed text-muted">
        Every form the team publishes lands here — active ones to vote on, closed ones to look back
        at. Publish yours and it becomes the first.
      </p>
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

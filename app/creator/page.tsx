'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCurrentUser } from '@/lib/auth'
import { getDashboard, deleteForm, createForm, type DashboardForm } from '@/lib/store'
import { timeAgo } from '@/lib/format'
import CreatorHeader from '@/components/CreatorHeader'
import StatusBadge from '@/components/StatusBadge'
import type { FormStatus } from '@/lib/types'

type ViewMode = 'list' | 'card'
type StatusFilter = 'all' | FormStatus
const VIEW_STORAGE_KEY = 'prism.dashboard.view'

// The saved view preference lives in localStorage; useSyncExternalStore keeps
// the server snapshot ('list') and the client in step without a hydration gap.
let viewCache: ViewMode = 'list'
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
  return 'list'
}
function setStoredView(next: ViewMode) {
  viewCache = next
  localStorage.setItem(VIEW_STORAGE_KEY, next)
  viewListeners.forEach((cb) => cb())
}

const STATUS_ORDER: Record<FormStatus, number> = { draft: 0, open: 1, closed: 2 }

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'open', label: 'Active' },
  { value: 'closed', label: 'Closed' },
]

export default function CreatorDashboard() {
  const router = useRouter()
  const { user, loading: authLoading } = useCurrentUser()
  const [forms, setForms] = useState<DashboardForm[] | null>(null)
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
    getDashboard(user.id).then(setForms)
  }, [authLoading, user, router])

  async function handleDelete(id: string) {
    if (!confirm('Delete this form and all its responses? This cannot be undone.')) return
    await deleteForm(id)
    if (user) setForms(await getDashboard(user.id))
  }

  return (
    <>
      <CreatorHeader />
      <main className="mx-auto w-full max-w-[1100px] px-4 py-10 sm:px-6 sm:py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[14px] font-medium text-muted">Your workspace</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-[28px]">Forms</h1>
          </div>
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating}
            className="rounded-[16px] bg-ink px-5 py-2.5 text-[14px] font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {creating ? 'Creating…' : '+ New form'}
          </button>
        </div>

        {forms === null ? (
          <GridSkeleton />
        ) : forms.length === 0 ? (
          <EmptyState onCreate={handleCreate} creating={creating} />
        ) : (
          <Workspace
            forms={forms}
            view={view}
            onChangeView={setStoredView}
            statusFilter={statusFilter}
            onChangeStatus={setStatusFilter}
            onDelete={handleDelete}
          />
        )}
      </main>
    </>
  )
}

function Workspace({
  forms,
  view,
  onChangeView,
  statusFilter,
  onChangeStatus,
  onDelete,
}: {
  forms: DashboardForm[]
  view: ViewMode
  onChangeView: (v: ViewMode) => void
  statusFilter: StatusFilter
  onChangeStatus: (s: StatusFilter) => void
  onDelete: (id: string) => void
}) {
  const counts = forms.reduce(
    (acc, { form }) => {
      acc.all += 1
      acc[form.status] += 1
      return acc
    },
    { all: 0, draft: 0, open: 0, closed: 0 } as Record<StatusFilter, number>,
  )

  // Always group by status — drafts, then active, then closed — keeping the
  // store's newest-first order within each group. toSorted leaves `forms` intact.
  const visible = (
    statusFilter === 'all' ? forms : forms.filter(({ form }) => form.status === statusFilter)
  ).toSorted((a, b) => STATUS_ORDER[a.form.status] - STATUS_ORDER[b.form.status])
  const activeLabel = STATUS_FILTERS.find((f) => f.value === statusFilter)?.label ?? 'All'

  return (
    <>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap items-center gap-1 rounded-full bg-black/[0.04] p-1">
          {STATUS_FILTERS.map(({ value, label }) => {
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
        <ViewToggle view={view} onChange={onChangeView} />
      </div>

      {visible.length === 0 ? (
        <div className="mt-8 rounded-[26px] border border-dashed border-line-strong bg-black/[0.015] px-6 py-14 text-center text-[15px] text-muted">
          No {activeLabel.toLowerCase()} forms.
        </div>
      ) : view === 'card' ? (
        <div className="u-stagger mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((item) => (
            <FormCard key={item.form.id} item={item} onDelete={onDelete} />
          ))}
        </div>
      ) : (
        <div className="u-stagger mt-2 divide-y divide-line">
          {visible.map((item) => (
            <FormRow key={item.form.id} item={item} onDelete={onDelete} />
          ))}
        </div>
      )}
    </>
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

function FormCard({ item, onDelete }: { item: DashboardForm; onDelete: (id: string) => void }) {
  const { form, responseCount, lastResponseAt } = item
  return (
    <div className="group flex flex-col rounded-[26px] border border-line bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_16px_44px_-24px_rgba(0,0,0,0.18)] transition duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_1px_2px_rgba(0,0,0,0.03),0_24px_50px_-24px_rgba(0,0,0,0.28)]">
      <div className="flex items-start justify-between gap-3">
        <StatusBadge status={form.status} />
        <button
          type="button"
          onClick={() => onDelete(form.id)}
          aria-label="Delete form"
          className="text-muted opacity-0 transition hover:text-red-600 group-hover:opacity-100"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 7h16M9 7V5h6v2m-8 0 1 13h8l1-13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <Link href={`/creator/${form.id}/edit`} className="mt-3 flex-1">
        <h2 className="text-[17px] font-semibold tracking-tight">
          {form.title || 'Untitled form'}
        </h2>
        {form.testing_question && (
          <p className="mt-1 line-clamp-2 text-[14px] leading-relaxed text-muted">
            {form.testing_question}
          </p>
        )}
      </Link>

      <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-[14px] text-muted">
        <span className="font-medium text-ink">
          {responseCount} {responseCount === 1 ? 'response' : 'responses'}
        </span>
        <span>{lastResponseAt ? timeAgo(lastResponseAt) : 'no responses yet'}</span>
      </div>

      <div className="mt-3 flex gap-2">
        <Link
          href={`/creator/${form.id}/edit`}
          className="flex-1 rounded-[16px] border border-line-strong py-2 text-center text-[14px] font-semibold text-ink transition hover:bg-black/[0.03]"
        >
          Edit
        </Link>
        <Link
          href={`/creator/${form.id}/results`}
          className="flex-1 rounded-[16px] border border-line-strong py-2 text-center text-[14px] font-semibold text-ink transition hover:bg-black/[0.03]"
        >
          Results
        </Link>
      </div>
    </div>
  )
}

function FormRow({ item, onDelete }: { item: DashboardForm; onDelete: (id: string) => void }) {
  const { form, responseCount } = item
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    // u-stagger animates each row, which makes it a stacking context — lift the
    // whole row while its menu is open so the popover clears the sibling rows.
    <div
      className={`group -mx-2 flex items-center gap-4 rounded-[14px] px-2 py-4 transition hover:bg-black/[0.02] ${
        menuOpen ? 'relative z-50' : ''
      }`}
    >
      <div className="w-[76px] shrink-0">
        <StatusBadge status={form.status} />
      </div>

      <Link href={`/creator/${form.id}/edit`} className="min-w-0 flex-1">
        <h2 className="truncate text-[15px] font-semibold tracking-tight">
          {form.title || 'Untitled form'}
        </h2>
        {form.testing_question && (
          <p className="truncate text-[13px] leading-relaxed text-muted">{form.testing_question}</p>
        )}
      </Link>

      <div className="hidden w-[110px] shrink-0 text-right text-[13px] font-medium text-ink sm:block">
        {responseCount} {responseCount === 1 ? 'response' : 'responses'}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Link
          href={`/creator/${form.id}/edit`}
          className="rounded-[12px] border border-line-strong px-3 py-1.5 text-[13px] font-semibold text-ink transition hover:bg-black/[0.03]"
        >
          Edit
        </Link>
        <Link
          href={`/creator/${form.id}/results`}
          className="rounded-[12px] border border-line-strong px-3 py-1.5 text-[13px] font-semibold text-ink transition hover:bg-black/[0.03]"
        >
          Results
        </Link>
        <RowMenu open={menuOpen} onOpenChange={setMenuOpen} onDelete={() => onDelete(form.id)} />
      </div>
    </div>
  )
}

function RowMenu({
  open,
  onOpenChange,
  onDelete,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDelete: () => void
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
        className={`grid h-8 w-8 place-items-center rounded-full text-muted transition hover:bg-black/[0.05] hover:text-ink ${
          open ? 'bg-black/[0.05] text-ink opacity-100' : 'opacity-0 group-hover:opacity-100'
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
      <button
        type="button"
        onClick={onCreate}
        disabled={creating}
        className="mt-5 rounded-[16px] bg-ink px-5 py-2.5 text-[14px] font-medium text-white transition hover:opacity-90 disabled:opacity-50"
      >
        {creating ? 'Creating…' : '+ Create a form'}
      </button>
    </div>
  )
}

function GridSkeleton() {
  return (
    <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-52 animate-pulse rounded-[26px] border border-line bg-black/[0.015]" />
      ))}
    </div>
  )
}

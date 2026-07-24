'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCurrentUser } from '@/lib/auth'
import { getDashboard, deleteForm, createForm, type DashboardForm } from '@/lib/store'
import { timeAgo } from '@/lib/format'
import CreatorHeader from '@/components/CreatorHeader'
import StatusBadge from '@/components/StatusBadge'

export default function CreatorDashboard() {
  const router = useRouter()
  const { user, loading: authLoading } = useCurrentUser()
  const [forms, setForms] = useState<DashboardForm[] | null>(null)
  const [creating, setCreating] = useState(false)

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
          <div className="u-stagger mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {forms.map(({ form, responseCount, lastResponseAt }) => (
              <div
                key={form.id}
                className="group flex flex-col rounded-[26px] border border-line bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_16px_44px_-24px_rgba(0,0,0,0.18)] transition duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_1px_2px_rgba(0,0,0,0.03),0_24px_50px_-24px_rgba(0,0,0,0.28)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <StatusBadge status={form.status} />
                  <button
                    type="button"
                    onClick={() => handleDelete(form.id)}
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
            ))}
          </div>
        )}
      </main>
    </>
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

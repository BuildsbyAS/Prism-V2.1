'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import type { FullForm } from '@/lib/types'
import { getFullForm, DEMO_STORAGE_KEY } from '@/lib/store'
import { useCurrentUser } from '@/lib/auth'
import { formName, hasResults } from '@/lib/builder'
import { ArrowLeft, ArrowSquareOut, Check, Info, LinkSimple } from '@phosphor-icons/react'
import StatusBadge from '@/components/StatusBadge'
import FormHeader from '@/components/builder/FormHeader'
import DeviceSwitch, { type Device } from '@/components/builder/DeviceSwitch'

// An iframe gets its own viewport equal to its width, so resizing it makes the
// voter page's responsive layout reflow the way a real device would.
const PREVIEW_WIDTH: Record<Device, string> = {
  desktop: '100%',
  tablet: '834px',
  mobile: '390px',
}

/**
 * A form as its voters see it. Reached from the Team list, where someone else's
 * form has no editor to open — and from the Preview tab of your own.
 */
export default function FormPreviewPage() {
  const params = useParams<{ formId: string }>()
  const formId = params.formId
  const { user } = useCurrentUser()
  const [full, setFull] = useState<FullForm | null>(null)
  const [missing, setMissing] = useState(false)
  const [device, setDevice] = useState<Device>('desktop')
  const [copied, setCopied] = useState(false)
  const copyResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Bumped to remount the iframe — see refresh().
  const [reloadKey, setReloadKey] = useState(0)
  /**
   * The screen to open on, forwarded from the builder's Preview tab as `?start=`.
   * Read from `location` rather than useSearchParams so this page needs no
   * Suspense boundary; it's client-only anyway, and the value never changes
   * without a navigation that remounts the page.
   */
  const [start] = useState(() =>
    typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('start'),
  )

  /**
   * Reload the form and the framed voter page.
   *
   * `reloadKey` is the iframe's React key: bumping it remounts the iframe, which
   * is the only way to make it re-read. Its own `src` never changes, so React
   * would otherwise keep the existing document — showing whatever the form
   * looked like when this tab was opened, however long ago that was.
   */
  const refresh = useCallback(() => {
    getFullForm(formId).then((f) => {
      if (!f) return setMissing(true)
      setFull(f)
      setReloadKey((n) => n + 1)
    })
  }, [formId])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(
    () => () => {
      if (copyResetTimer.current) clearTimeout(copyResetTimer.current)
    },
    [],
  )

  /**
   * Follow edits made elsewhere. The builder is usually a second tab, and in
   * demo mode it writes to localStorage — which fires `storage` in *other* tabs
   * only, so this is exactly the signal we want and never an echo of our own
   * write. Focus covers the rest: switching back from the builder, and Supabase
   * mode, where no storage event is coming.
   */
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === null || e.key === DEMO_STORAGE_KEY) refresh()
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', refresh)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('focus', refresh)
    }
  }, [refresh])

  // Someone else's form has no Editor tab — there is nothing behind it for you.
  const canEdit = Boolean(full && user && full.form.creator_id === user.id)
  const publicPath = full ? `/f/${full.form.slug}` : null

  async function copyFormLink() {
    if (!publicPath) return
    const url = new URL(publicPath, window.location.origin).toString()
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // Clipboard permissions can be unavailable in an embedded browser. Keep
      // the action working through the older selection API in that case.
      const field = document.createElement('textarea')
      field.value = url
      field.setAttribute('readonly', '')
      field.style.position = 'fixed'
      field.style.opacity = '0'
      document.body.appendChild(field)
      field.select()
      document.execCommand('copy')
      field.remove()
    }
    setCopied(true)
    if (copyResetTimer.current) clearTimeout(copyResetTimer.current)
    copyResetTimer.current = setTimeout(() => setCopied(false), 1800)
  }

  if (missing) {
    return (
      <>
        <FormHeader formId={formId} tab="preview" canEdit={false} />
        <main className="mx-auto max-w-[600px] px-6 py-24 text-center">
          <h1 className="font-sans text-xl font-semibold">Form not found</h1>
          <Link
            href="/creator/team"
            className="mt-5 inline-block rounded-[16px] bg-ink px-5 py-2.5 text-[14px] font-medium text-white"
          >
            <ArrowLeft size={14} aria-hidden="true" /> Back to team
          </Link>
        </main>
      </>
    )
  }

  return (
    <>
      <FormHeader
        formId={formId}
        tab="preview"
        name={full ? formName(full.form) : null}
        canEdit={canEdit}
        canSeeResults={
          !full || (hasResults(full.form) && (canEdit || full.form.show_results_to_voters))
        }
        status={full ? <StatusBadge status={full.form.status} /> : undefined}
      >
        {publicPath && full?.form.status !== 'draft' && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={copyFormLink}
              aria-label={copied ? 'Form link copied' : 'Copy form link'}
              className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-line bg-card px-2.5 font-medium text-ink transition hover:bg-black/[0.03]"
            >
              {copied ? <Check size={15} weight="bold" aria-hidden="true" /> : <LinkSimple size={15} aria-hidden="true" />}
              <span className="hidden xl:inline">{copied ? 'Copied' : 'Copy form link'}</span>
            </button>
            <Link
              href={publicPath}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open form in a new tab"
              className="inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-ink px-2.5 font-medium text-white transition hover:opacity-90"
            >
              <ArrowSquareOut size={15} aria-hidden="true" />
              <span className="hidden xl:inline">Open form</span>
            </Link>
          </div>
        )}
        <DeviceSwitch value={device} onChange={setDevice} />
      </FormHeader>

      <div className="flex h-[calc(100dvh-3.5rem)] flex-col overflow-hidden">
        <div
          role="note"
          className="flex flex-none items-center justify-center gap-1.5 border-b border-orange-200 bg-orange-50 px-4 py-2 text-center text-[14px] font-medium text-orange-700"
        >
          <Info size={14} className="flex-none" aria-hidden="true" />
          <span>
            Preview mode — any votes or responses you submit here are for testing only. Nothing is saved or counted in results.
          </span>
        </div>

        <main className="u-view flex min-h-0 flex-1 justify-center overflow-hidden bg-black/[0.04] p-6">
          {full ? (
            <div
              className={`h-full overflow-hidden bg-white transition-[width] duration-300 ease-out ${
                device === 'desktop'
                  ? 'w-full rounded-[18px]'
                  : 'rounded-[28px] border border-line shadow-[0_16px_44px_-24px_rgba(0,0,0,0.3)]'
              }`}
              style={{ width: PREVIEW_WIDTH[device], maxWidth: '100%' }}
            >
              {/* preview=1 keeps the voter page from counting this as a real run;
                  start picks the screen, so opening Preview from the builder lands
                  where you were editing instead of back at the introduction.
                  `key` is what makes refresh() reload it — the src is unchanged, so
                  without it React keeps the document already in the frame. */}
              <iframe
                key={reloadKey}
                src={`/f/${full.form.slug}?preview=1${start ? `&start=${encodeURIComponent(start)}` : ''}`}
                title={`Preview of ${formName(full.form)}`}
                className="h-full w-full border-0"
              />
            </div>
          ) : (
            <div className="h-full w-full animate-pulse rounded-[18px] bg-black/[0.03]" />
          )}
        </main>
      </div>
    </>
  )
}

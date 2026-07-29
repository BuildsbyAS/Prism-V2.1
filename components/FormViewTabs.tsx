'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export type FormTab = 'edit' | 'preview' | 'results'

/**
 * Editor / Preview / Results — the creator's three views of one form, as routes
 * rather than local state, so each is linkable and the browser's back button
 * behaves.
 *
 * Editor only appears for a form you own: on someone else's, from the Team list,
 * there is nothing behind it. Results only appears once the form has been
 * published — a draft has collected nothing. The switch sits in the form header (FormHeader) so
 * all three views share one bar and the form's identity stays put while only the
 * body changes.
 */
export default function FormViewTabs({
  formId,
  active,
  canEdit = true,
  canSeeResults = true,
  previewQuery,
  beforeLeave,
}: {
  formId: string
  active: FormTab
  canEdit?: boolean
  /** False until the form has been published at least once — a draft has no
   *  responses to show, so the tab would lead to an empty page. */
  canSeeResults?: boolean
  /** Appended to the Preview tab — the editor passes the screen it's on. */
  previewQuery?: string
  /** Ran before navigating away; the editor flushes its pending save. */
  beforeLeave?: () => Promise<void> | void
}) {
  const router = useRouter()
  // The tab you clicked, held until the route it points at is on screen. The
  // Results and Preview views fetch before they render, so without this the pill
  // sits on the old tab for that beat and the click reads as ignored.
  const [target, setTarget] = useState<FormTab | null>(null)
  const [, startTransition] = useTransition()
  // Cleared the moment the route catches up — adjusted during render rather than
  // in an effect, so the pill never paints a frame pointing at the tab you just
  // left (and a browser Back, which changes `active` without a click, resets it).
  const [routed, setRouted] = useState(active)
  if (routed !== active) {
    setRouted(active)
    setTarget(null)
  }

  const tabs = [
    ...(canEdit ? [{ key: 'edit' as const, label: 'Editor', href: `/creator/${formId}/edit` }] : []),
    { key: 'preview' as const, label: 'Preview', href: `/creator/${formId}/preview${previewQuery ?? ''}` },
    ...(canSeeResults ? [{ key: 'results' as const, label: 'Results', href: `/creator/${formId}/results` }] : []),
  ]

  async function go(e: React.MouseEvent<HTMLAnchorElement>, tab: FormTab, href: string) {
    // Leave the modified clicks to the browser — cmd-click opens the view in a
    // new tab, and hijacking that would be worse than any transition.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    e.preventDefault()
    setTarget(tab)
    // The editor autosaves on a debounce, so leaving a keystroke after an edit
    // would race the write. Hold the navigation for the flush instead.
    if (beforeLeave) await beforeLeave()
    startTransition(() => router.push(href))
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-[14px] border border-line bg-black/[0.03] p-1">
      {tabs.map((t) => {
        const on = (target ?? active) === t.key
        return (
          <Link
            key={t.key}
            href={t.href}
            onClick={(e) => t.key !== active && go(e, t.key, t.href)}
            aria-current={on ? 'page' : undefined}
            className={`flex h-7 items-center rounded-[10px] px-3.5 text-[13px] font-medium transition ${
              on ? 'bg-card text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]' : 'text-muted hover:text-ink'
            }`}
          >
            {t.label}
          </Link>
        )
      })}
    </div>
  )
}

'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

export type FormTab = 'edit' | 'preview' | 'results'

/**
 * Editor / Preview / Results — the creator's three views of one form, as routes
 * rather than local state, so each is linkable and the browser's back button
 * behaves.
 *
 * Editor only appears for a form you own: on someone else's, from the Team list,
 * there is nothing behind it. The switch sits in the form header (FormHeader) so
 * all three views share one bar and the form's identity stays put while only the
 * body changes.
 */
export default function FormViewTabs({
  formId,
  active,
  canEdit = true,
  previewQuery,
  beforeLeave,
}: {
  formId: string
  active: FormTab
  canEdit?: boolean
  /** Appended to the Preview tab — the editor passes the screen it's on. */
  previewQuery?: string
  /** Ran before navigating away; the editor flushes its pending save. */
  beforeLeave?: () => Promise<void> | void
}) {
  const router = useRouter()
  const tabs = [
    ...(canEdit ? [{ key: 'edit' as const, label: 'Editor', href: `/creator/${formId}/edit` }] : []),
    { key: 'preview' as const, label: 'Preview', href: `/creator/${formId}/preview${previewQuery ?? ''}` },
    { key: 'results' as const, label: 'Results', href: `/creator/${formId}/results` },
  ]

  async function go(e: React.MouseEvent<HTMLAnchorElement>, href: string) {
    if (!beforeLeave) return
    // The editor autosaves on a debounce, so leaving a keystroke after an edit
    // would race the write. Hold the navigation for the flush instead.
    e.preventDefault()
    await beforeLeave()
    router.push(href)
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-[14px] border border-line bg-black/[0.03] p-1">
      {tabs.map((t) => {
        const on = active === t.key
        return (
          <Link
            key={t.key}
            href={t.href}
            onClick={(e) => !on && go(e, t.href)}
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

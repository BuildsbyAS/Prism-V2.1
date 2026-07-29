'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CaretRight } from '@phosphor-icons/react'
import Tooltip from '@/components/Tooltip'
import FormViewTabs, { type FormTab } from '@/components/FormViewTabs'

/**
 * The bar every form-scoped page wears: breadcrumb, the Editor · Preview ·
 * Results switch, and whatever actions the page brings.
 *
 * One header across the three views, because they are three views of one thing.
 * Preview used to be a full-screen overlay with its own chrome and a Back
 * button, and Results was a separate page under the dashboard header — so
 * moving between them meant learning three different sets of controls and
 * losing the form's identity on the way. As tabs the form stays put and only
 * the body changes.
 */
export default function FormHeader({
  formId,
  tab,
  name,
  onRename,
  canEdit = true,
  canSeeResults = true,
  /** Ran before a tab navigates away — the editor flushes its pending save. */
  beforeLeave,
  /** Query appended to the Preview tab, so it opens on the screen you're editing. */
  previewQuery,
  status,
  children,
}: {
  formId: string
  tab: FormTab
  /** Undefined renders the breadcrumb without a name (loading / not found). */
  name?: string | null
  onRename?: (v: string) => void
  canEdit?: boolean
  /** False for a form that has never been published — see hasResults. */
  canSeeResults?: boolean
  beforeLeave?: () => Promise<void> | void
  previewQuery?: string
  status?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/80 backdrop-blur">
      {/* `relative` so the tabs can be centred on the bar itself rather than on
          whatever space the side groups happen to leave. */}
      <div className="relative flex h-14 w-full items-center justify-between gap-3 px-[14px]">
        <div className="flex min-w-0 items-center gap-3">
          <Breadcrumb title={name} onRename={onRename} />
          {status}
        </div>

        {/* Hidden below md: the editor is desktop-only, and on a narrow bar the
            switch would crowd out the form's name. */}
        <nav aria-label="Form views" className="absolute left-1/2 hidden -translate-x-1/2 md:block">
          <FormViewTabs
            formId={formId}
            active={tab}
            canEdit={canEdit}
            canSeeResults={canSeeResults}
            previewQuery={previewQuery}
            beforeLeave={beforeLeave}
          />
        </nav>

        <div className="flex flex-none items-center gap-3 text-[14px]">{children}</div>
      </div>
    </header>
  )
}

/**
 * Where the form name stops growing. The field is sized to its content so a
 * short name doesn't sit in a wide empty box — but left uncapped a long one ran
 * under the switch centred on the bar. Past this it ellipsises and the whole
 * name is a hover away; the field still holds the full text, so typing past 20
 * characters is unaffected.
 */
const NAME_CHARS = 20

function Breadcrumb({ title, onRename }: { title?: string | null; onRename?: (v: string) => void }) {
  // While focused the field shows exactly what was typed, empty included. The
  // value it displays otherwise is the *effective* name, which falls back to the
  // welcome headline — without a draft, clearing the field would refill it with
  // that headline on the very next keystroke and it could never be emptied.
  const [draft, setDraft] = useState<string | null>(null)
  const shown = title || 'Untitled form'
  const clipped = shown.length > NAME_CHARS
  const nameField =
    onRename !== undefined ? (
      <input
        value={draft ?? title ?? ''}
        onChange={(e) => {
          setDraft(e.target.value)
          onRename(e.target.value)
        }}
        onBlur={() => setDraft(null)}
        placeholder="Untitled form"
        aria-label="Form name"
        size={Math.min(Math.max(shown.length, 6), NAME_CHARS)}
        className="min-w-0 max-w-[46vw] truncate rounded-md bg-transparent px-1.5 py-0.5 font-medium outline-none transition placeholder:text-muted hover:bg-black/[0.04] focus:bg-black/[0.05] focus:ring-2 focus:ring-black/[0.06]"
      />
    ) : (
      <span className="min-w-0 max-w-[20ch] truncate font-medium">{shown}</span>
    )

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
          <CaretRight size={12} aria-hidden="true" className="flex-none text-muted" />
          {/* Only worth a tooltip when something is actually hidden. */}
          {clipped ? (
            <Tooltip label={shown} side="bottom" className="min-w-0">
              {nameField}
            </Tooltip>
          ) : (
            nameField
          )}
        </>
      )}
    </div>
  )
}

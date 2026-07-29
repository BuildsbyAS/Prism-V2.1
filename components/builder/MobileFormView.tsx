'use client'

import { CaretLeft, Info } from '@phosphor-icons/react'

import Link from 'next/link'
import type { Form } from '@/lib/types'
import { formName } from '@/lib/builder'

/**
 * What the editor route shows on a phone.
 *
 * The builder is a three-column desktop tool — a rail, a canvas and a properties
 * panel — and shrinking it to a phone produced a stack nobody could work in. So
 * on mobile the route becomes read-only: the live form exactly as a voter sees
 * it, plus the read-only links that still make sense. Editing waits for a bigger
 * screen rather than being offered badly.
 *
 * The preview is the real voter page in an iframe, so it can't drift from what
 * ships, and `preview=1` keeps it out of the response counts.
 */
export default function MobileFormView({ form, published }: { form: Form; published: boolean }) {
  const name = formName(form) || 'Untitled form'

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 flex-none border-b border-line bg-bg/80 backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-4">
          <Link
            href="/creator"
            aria-label="Back to forms"
            className="grid h-8 w-8 flex-none place-items-center rounded-full text-muted transition hover:bg-black/[0.05] hover:text-ink"
          >
            <CaretLeft size={18} aria-hidden="true" />
          </Link>
          <p className="min-w-0 flex-1 truncate text-[15px] font-medium">{name}</p>
          {published && (
            <Link
              href={`/creator/${form.id}/results`}
              className="flex-none rounded-[14px] border border-line px-3 py-1.5 text-[13px] font-medium transition hover:bg-black/[0.03]"
            >
              Results
            </Link>
          )}
        </div>
      </header>

      <div className="flex items-start gap-2.5 border-b border-line bg-black/[0.02] px-4 py-3">
        <Info size={16} aria-hidden="true" className="mt-px flex-none text-muted" />
        <p className="text-[13px] leading-relaxed text-muted">
          You&rsquo;re viewing this form. Editing needs a larger screen — open Prism on a desktop to
          make changes.
        </p>
      </div>

      {/* The voter page itself, so the preview can't drift from what ships. */}
      <iframe
        src={`/f/${form.slug}?preview=1&start=welcome`}
        title={`Preview of ${name}`}
        className="min-h-0 w-full flex-1 border-0 bg-card"
      />
    </div>
  )
}

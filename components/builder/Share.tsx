'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import type { Form } from '@/lib/types'
import type { Readiness } from '@/lib/builder'
import { InlineTextArea } from './Inline'
import { Toggle } from './controls'

/* ------------------------------ End screen ------------------------------- */

export function EndScreenCenter({ form, onChange }: { form: Form; onChange: (p: Partial<Form>) => void }) {
  return (
    <div className="text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-ink text-white">✓</div>
      <div className="mx-auto mt-5 max-w-md">
        <InlineTextArea
          value={form.thank_you_message}
          onChange={(v) => onChange({ thank_you_message: v })}
          placeholder="Thanks — your feedback is in. We read every response."
          className="px-3 py-2 text-center text-xl font-medium leading-relaxed"
        />
      </div>
    </div>
  )
}

/* ------------------------------ Share dialog ----------------------------- */

export function ShareDialog({
  form,
  publicUrl,
  ready,
  published,
  dirty,
  onChange,
  onPublish,
  onUnpublish,
  onClose,
}: {
  form: Form
  publicUrl: string
  ready: Readiness
  published: boolean
  dirty: boolean
  onChange: (p: Partial<Form>) => void
  onPublish: () => void
  onUnpublish: () => void
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [qr, setQr] = useState<string | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Encode the voter link as a QR (PNG data URL) for scan-to-open + download.
  useEffect(() => {
    let active = true
    QRCode.toDataURL(publicUrl, { width: 320, margin: 1, color: { dark: '#18191d', light: '#ffffff' } })
      .then((url) => active && setQr(url))
      .catch(() => active && setQr(null))
    return () => {
      active = false
    }
  }, [publicUrl])

  function downloadQr() {
    if (!qr) return
    const a = document.createElement('a')
    a.href = qr
    a.download = `${form.slug || 'form'}-qr.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(publicUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <div className="u-overlay fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4 py-10 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        className="u-modal w-full max-w-[460px] rounded-[26px] border border-line bg-card p-6 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_24px_60px_-24px_rgba(0,0,0,0.35)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-[17px] font-semibold tracking-tight">
              {published ? 'Publish & share' : 'Publish form'}
            </h2>
            <p className="mt-0.5 text-[14px] text-muted">
              {published ? 'Live — send the link or QR.' : 'Publish to get a shareable voter link.'}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted transition hover:text-ink">✕</button>
        </div>

        {/* Readiness (before first publish) */}
        {!published && (
          <ul className="mt-5 space-y-2 rounded-2xl border border-line bg-black/[0.015] p-4">
            <Check ok={ready.welcome} label="Welcome screen" hint="Title, subtitle, project brief & metrics" />
            <Check ok={ready.middle} label="Content" hint="At least 2 options and 1 question" />
            <Check ok={ready.thankyou} label="End screen" hint="A closing message" soft />
          </ul>
        )}

        {/* Publish / Publish changes */}
        <button
          type="button"
          onClick={onPublish}
          disabled={published ? !dirty : !ready.publishable}
          className="mt-5 w-full rounded-[16px] bg-ink px-5 py-3 text-[14px] font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {!published ? 'Publish form' : dirty ? 'Publish changes' : 'Published — up to date'}
        </button>
        {!published && !ready.publishable && (
          <p className="mt-2 text-center text-[13px] text-muted">Complete the welcome screen and add 2 options and a question to publish.</p>
        )}
        {published && (
          <button type="button" onClick={onUnpublish} className="mt-2 w-full text-center text-[13px] font-medium text-muted transition hover:text-ink">
            Unpublish (back to draft)
          </button>
        )}

        {/* Link */}
        <div className="mt-5">
          <p className="mb-1.5 text-[14px] font-medium">Voter link</p>
          <div className="flex gap-2">
            <input readOnly value={publicUrl} className="w-full rounded-xl border border-line bg-black/[0.015] px-3.5 py-2.5 text-sm text-muted outline-none" />
            <button type="button" onClick={copy} className="flex-none rounded-[16px] border border-line-strong px-4 text-[14px] font-semibold transition hover:bg-black/[0.03]">
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
          </div>
        </div>

        {/* QR code */}
        <div className="mt-4 flex items-center gap-4 rounded-2xl border border-line p-4">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="QR code for the voter link" className="h-20 w-20 flex-none rounded-xl border border-line" />
          ) : (
            <div className="grid h-20 w-20 flex-none place-items-center rounded-xl border border-dashed border-line-strong bg-black/[0.015] text-2xl text-muted">⛶</div>
          )}
          <div className="min-w-0">
            <p className="text-[13px] leading-relaxed text-muted">Scan to open the voter link on a phone.</p>
            <button
              type="button"
              onClick={downloadQr}
              disabled={!qr}
              className="mt-2 rounded-[14px] border border-line-strong px-3 py-1.5 text-[13px] font-semibold transition hover:bg-black/[0.03] disabled:opacity-40"
            >
              Download PNG
            </button>
          </div>
        </div>

        {/* Settings */}
        <div className="mt-5 space-y-3">
          <Toggle
            checked={form.show_results_to_voters}
            onChange={(v) => onChange({ show_results_to_voters: v })}
            label="Let voters see results"
            hint="After submitting, voters see the aggregate results. Off = record the response and show the end screen."
          />
          <Toggle
            checked={form.require_voter_login}
            onChange={(v) => onChange({ require_voter_login: v })}
            label="Require @noon.com login to respond"
            hint="Only signed-in Noon users can respond — for sensitive internal forms."
          />
        </div>
      </div>
    </div>
  )
}

function Check({ ok, label, hint, soft }: { ok: boolean; label: string; hint: string; soft?: boolean }) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        className={`mt-0.5 grid h-4 w-4 flex-none place-items-center rounded-full text-[13px] ${
          ok ? 'bg-ink text-white' : soft ? 'bg-black/[0.06] text-muted' : 'border border-line-strong text-transparent'
        }`}
      >
        ✓
      </span>
      <span className="text-[14px]">
        <span className="font-medium">{label}</span>
        <span className="text-muted"> — {hint}</span>
      </span>
    </li>
  )
}

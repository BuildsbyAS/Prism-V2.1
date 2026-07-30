'use client'

import { useEffect, useMemo, useState } from 'react'
import { CaretDown, LinkSimple, Plus, X } from '@phosphor-icons/react'

import { personColor, personInitials, personName } from '@/lib/format'
import { getKnownPeople } from '@/lib/store'
import { ALLOWED_EMAIL_DOMAIN } from '@/lib/supabase'

export type CollaboratorRole = 'edit' | 'view'

interface AccessChange {
  collaborators: string[]
  viewers: string[]
}

export default function CollaboratorDialog({
  ownerEmail,
  viewerEmail,
  collaborators,
  viewers,
  publicUrl,
  onChange,
  onClose,
}: {
  ownerEmail: string | null
  viewerEmail: string | null
  collaborators: string[]
  viewers: string[]
  publicUrl: string
  onChange: (access: AccessChange) => Promise<void> | void
  onClose: () => void
}) {
  const [people, setPeople] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [role, setRole] = useState<CollaboratorRole>('view')
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    getKnownPeople().then((rows) => live && setPeople(rows))
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const current = useMemo(() => {
    const rows = new Map<string, CollaboratorRole>()
    for (const email of collaborators ?? []) rows.set(email.toLowerCase(), 'edit')
    for (const email of viewers ?? []) {
      if (!rows.has(email.toLowerCase())) rows.set(email.toLowerCase(), 'view')
    }
    return [...rows].map(([email, access]) => ({ email, access }))
  }, [collaborators, viewers])

  const taken = new Set([
    ...current.map((row) => row.email),
    ...(ownerEmail ? [ownerEmail.toLowerCase()] : []),
  ])
  const q = query.trim().toLowerCase()
  const matches = people
    .filter((email) => {
      const key = email.toLowerCase()
      return (
        !taken.has(key) &&
        (!q || key.includes(q) || personName(email).toLowerCase().includes(q))
      )
    })
    .slice(0, 5)
  const canInvite = q.endsWith(ALLOWED_EMAIL_DOMAIN) && !taken.has(q)

  async function commit(email: string, nextRole: CollaboratorRole | null) {
    const key = email.trim().toLowerCase()
    const nextEditors = (collaborators ?? []).filter((candidate) => candidate.toLowerCase() !== key)
    const nextViewers = (viewers ?? []).filter((candidate) => candidate.toLowerCase() !== key)
    if (nextRole === 'edit') nextEditors.push(key)
    if (nextRole === 'view') nextViewers.push(key)
    setError(null)
    setBusy(true)
    try {
      await onChange({ collaborators: nextEditors, viewers: nextViewers })
    } catch {
      setError('Couldn’t update access. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function invite() {
    const email = canInvite ? q : (matches[0]?.toLowerCase() ?? '')
    if (!email) {
      setError(`Enter a valid ${ALLOWED_EMAIL_DOMAIN} email.`)
      return
    }
    await commit(email, role)
    setQuery('')
    setSuggestionsOpen(false)
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(publicUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      setError('Couldn’t copy the form link.')
    }
  }

  return (
    <div
      className="u-overlay fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/30 p-4 py-10 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="collaborator-dialog-title"
        className="u-modal w-full max-w-[640px] rounded-[26px] border border-line bg-card shadow-[0_1px_2px_rgba(0,0,0,0.03),0_24px_60px_-24px_rgba(0,0,0,0.35)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 id="collaborator-dialog-title" className="text-[17px] font-semibold tracking-tight">
            Share this form
          </h2>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={copyLink}
              className="inline-flex items-center gap-1.5 text-[14px] font-medium text-muted transition hover:text-ink"
            >
              <LinkSimple size={16} aria-hidden="true" />
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-8 w-8 place-items-center rounded-full text-muted transition hover:bg-black/[0.04] hover:text-ink"
            >
              <X size={17} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="p-6">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setSuggestionsOpen(true)
                  setError(null)
                }}
                onFocus={() => setSuggestionsOpen(true)}
                onBlur={() => setTimeout(() => setSuggestionsOpen(false), 120)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return
                  event.preventDefault()
                  void invite()
                }}
                placeholder={`name${ALLOWED_EMAIL_DOMAIN}`}
                aria-label="Collaborator email"
                className="h-11 w-full rounded-xl border border-line bg-white px-3.5 text-sm outline-none placeholder:text-muted focus:border-ink"
              />
              {suggestionsOpen && matches.length > 0 && (
                <ul className="u-popover absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-line bg-card py-1 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.3)]">
                  {matches.map((email) => (
                    <li key={email}>
                      <button
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setQuery(email)
                          setSuggestionsOpen(false)
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-black/[0.04]"
                      >
                        <Avatar email={email} />
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-medium">{personName(email)}</span>
                          <span className="block truncate text-[13px] text-muted">{email}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <AccessSelect value={role} onChange={setRole} disabled={busy} label="New collaborator access" />
            <button
              type="button"
              onClick={() => void invite()}
              disabled={busy}
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-ink px-5 text-[14px] font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              <Plus size={15} aria-hidden="true" />
              Invite
            </button>
          </div>
          {error && <p role="alert" className="mt-2 text-[13px] text-red-600">{error}</p>}

          <p className="mt-7 text-[13px] font-medium text-muted">Who has access</p>
          <div className="mt-2 divide-y divide-line rounded-2xl border border-line">
            {ownerEmail && (
              <AccessRow email={ownerEmail} suffix={viewerEmail?.toLowerCase() === ownerEmail.toLowerCase() ? 'you' : undefined}>
                <span className="text-[13px] font-medium text-muted">Owner</span>
              </AccessRow>
            )}
            {current.map(({ email, access }) => (
              <AccessRow key={email} email={email}>
                <div className="flex items-center gap-1.5">
                  <AccessSelect
                    value={access}
                    onChange={(next) => void commit(email, next)}
                    disabled={busy}
                    label={`Access for ${email}`}
                    compact
                  />
                  <button
                    type="button"
                    onClick={() => void commit(email, null)}
                    disabled={busy}
                    aria-label={`Remove ${personName(email)}`}
                    className="grid h-8 w-8 place-items-center rounded-lg text-muted transition hover:bg-black/[0.04] hover:text-ink disabled:opacity-50"
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </div>
              </AccessRow>
            ))}
          </div>
          {current.length === 0 && (
            <p className="mt-2 text-[13px] text-muted">
              Only you have access. Invite someone to let them edit or view the form.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function Avatar({ email }: { email: string }) {
  return (
    <span
      className="u-circle grid h-7 w-7 flex-none place-items-center rounded-full text-[11px] font-semibold text-white"
      style={{ backgroundColor: personColor(email) }}
    >
      {personInitials(email)}
    </span>
  )
}

function AccessRow({
  email,
  suffix,
  children,
}: {
  email: string
  suffix?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 px-3.5 py-3">
      <Avatar email={email} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium">
          {personName(email)}
          {suffix && <span className="font-normal text-muted"> ({suffix})</span>}
        </span>
        <span className="block truncate text-[12px] text-muted">{email}</span>
      </span>
      {children}
    </div>
  )
}

function AccessSelect({
  value,
  onChange,
  disabled,
  label,
  compact = false,
}: {
  value: CollaboratorRole
  onChange: (role: CollaboratorRole) => void
  disabled: boolean
  label: string
  compact?: boolean
}) {
  return (
    <label className="relative flex-none">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as CollaboratorRole)}
        disabled={disabled}
        className={`appearance-none rounded-xl border border-line bg-white pr-9 text-[14px] font-medium outline-none focus:border-ink disabled:opacity-50 ${
          compact ? 'h-8 pl-3' : 'h-11 pl-3.5'
        }`}
      >
        <option value="edit">Can edit</option>
        <option value="view">Can view</option>
      </select>
      <CaretDown
        size={13}
        weight="bold"
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
      />
    </label>
  )
}

'use client'

// Small form controls shared between the center editors and the right-hand
// properties panel.

export function Field({
  label,
  hint,
  /**
   * Quieter label — 13px muted rather than 14px ink. For a dialog that is
   * nothing but fields, where a column of bold labels competes with the values
   * you're there to read; the properties rail keeps the louder default, since
   * its labels sit among headings and copy.
   */
  subtle = false,
  children,
}: {
  label: string
  hint?: string
  subtle?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className={`mb-1.5 block ${subtle ? 'text-[13px] font-medium text-muted' : 'text-[14px] font-medium'}`}>
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[13px] leading-relaxed text-muted">{hint}</span>}
    </label>
  )
}

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[14px] font-medium">{label}</span>
      {children}
    </div>
  )
}

export function MicroLabel({ children }: { children: React.ReactNode }) {
  // px-2 matches the inline fields' padding so labels and field text left-align.
  return <span className="mb-1 block px-2 text-[13px] font-semibold uppercase tracking-wide text-muted">{children}</span>
}

const inputCls =
  'w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm outline-none placeholder:text-muted focus:border-ink'

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={inputCls} />
}

export function NumberInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} className={inputCls} />
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-start justify-between gap-3 rounded-xl px-1 py-2 text-left transition hover:bg-black/[0.02]"
    >
      <span className="min-w-0">
        <span className="block text-[14px] font-medium">{label}</span>
        {hint && <span className="mt-0.5 block text-[13px] leading-relaxed text-muted">{hint}</span>}
      </span>
      <span className={`mt-0.5 flex h-5 w-9 flex-none items-center rounded-full p-0.5 transition ${checked ? 'bg-ink' : 'bg-black/[0.12]'}`}>
        <span className={`h-4 w-4 rounded-full bg-white transition ${checked ? 'translate-x-4' : ''}`} />
      </span>
    </button>
  )
}

/**
 * The hover control on a piece of media — used by option cards and the welcome
 * hero, so both read as the same object. Edit and delete are the whole
 * vocabulary; swapping the media is one click deeper, inside what Edit opens.
 * Lives here rather than in panes.tsx because ImageUpload needs it too and
 * panes.tsx already imports ImageUpload.
 */
export function MediaIconBtn({
  tip,
  onClick,
  children,
}: {
  tip: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <div className="group/btn relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onClick()
        }}
        aria-label={tip}
        className="grid h-9 w-9 place-items-center rounded-xl bg-ink/85 text-white transition hover:bg-ink"
      >
        {children}
      </button>
      <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink px-2 py-1 text-[13px] font-medium text-white opacity-0 transition group-hover/btn:opacity-100">
        {tip}
      </span>
    </div>
  )
}

export const EditGlyph = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M4 8h9M17 8h3M4 16h3M11 16h9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <circle cx="15" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.7" />
    <circle cx="9" cy="16" r="2.2" stroke="currentColor" strokeWidth="1.7" />
  </svg>
)

export const DeleteGlyph = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M4 7h16M9 7V5h6v2m-8 0 1 13h8l1-13"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

/** Four corners pushing out — "give this the whole window". */
export const ExpandGlyph = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  labels,
}: {
  options: readonly T[]
  value: T
  onChange: (v: T) => void
  labels: Record<T, string>
}) {
  return (
    <div className="inline-flex rounded-[14px] border border-line-strong p-0.5">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={`rounded-[11px] px-3 py-1.5 text-[13px] font-medium transition ${value === o ? 'bg-ink text-white' : 'text-muted hover:text-ink'}`}
        >
          {labels[o]}
        </button>
      ))}
    </div>
  )
}

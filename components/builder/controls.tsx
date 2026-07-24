'use client'

// Small form controls shared between the center editors and the right-hand
// properties panel.

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[14px] font-medium">{label}</span>
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

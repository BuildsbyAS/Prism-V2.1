'use client'

/**
 * Borderless, live-editable text fields for the builder canvas. They look like
 * the rendered page text and reveal a subtle focus affordance — the "edit right
 * on the page" feel, no separate form column.
 */

export function InlineInput({
  value,
  onChange,
  placeholder,
  className = '',
  ...rest
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <input
      {...rest}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full rounded-lg bg-transparent outline-none placeholder:text-muted/60 hover:bg-black/[0.02] focus:bg-black/[0.03] focus:ring-2 focus:ring-black/[0.06] ${className}`}
    />
  )
}

export function InlineTextArea({
  value,
  onChange,
  placeholder,
  className = '',
  rows = 1,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
  rows?: number
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className={`field-auto w-full resize-none rounded-lg bg-transparent outline-none placeholder:text-muted/60 hover:bg-black/[0.02] focus:bg-black/[0.03] focus:ring-2 focus:ring-black/[0.06] ${className}`}
    />
  )
}

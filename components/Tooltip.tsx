/** Small hover tooltip for icon-only controls. CSS-only, delayed, origin-aware. */
export default function Tooltip({
  label,
  side = 'top',
  className = '',
  children,
}: {
  label: string
  side?: 'top' | 'bottom'
  className?: string
  children: React.ReactNode
}) {
  return (
    <span className={`group/tt relative inline-flex ${className}`}>
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute left-1/2 z-40 -translate-x-1/2 scale-95 whitespace-nowrap rounded-lg bg-ink px-2 py-1 text-[13px] font-medium text-white opacity-0 shadow-[0_4px_12px_-4px_rgba(0,0,0,0.4)] transition delay-0 duration-150 ease-out group-hover/tt:scale-100 group-hover/tt:opacity-100 group-hover/tt:delay-300 ${
          side === 'top' ? 'bottom-full mb-2 origin-bottom' : 'top-full mt-2 origin-top'
        }`}
      >
        {label}
      </span>
    </span>
  )
}

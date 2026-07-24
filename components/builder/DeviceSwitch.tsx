'use client'

export type Device = 'desktop' | 'tablet' | 'mobile'

/** Max content width for each previewed device — drives the page card size. */
export const DEVICE_MAX_WIDTH: Record<Device, string> = {
  desktop: '1120px',
  tablet: '768px',
  mobile: '400px',
}

const ITEMS: { key: Device; label: string; icon: React.ReactNode }[] = [
  { key: 'desktop', label: 'Desktop', icon: <MonitorIcon /> },
  { key: 'tablet', label: 'Tablet', icon: <TabletIcon /> },
  { key: 'mobile', label: 'Mobile', icon: <PhoneIcon /> },
]

/** Device preview switch — a single white pill physically slides to the active
 *  segment (Luma-style), instead of each segment toggling its own background. */
export default function DeviceSwitch({ value, onChange }: { value: Device; onChange: (d: Device) => void }) {
  const index = ITEMS.findIndex((i) => i.key === value)
  return (
    <div className="relative inline-grid grid-cols-3 rounded-[14px] border border-line bg-black/[0.03] p-1">
      {/* The sliding white box. */}
      <span
        aria-hidden="true"
        className="absolute inset-y-1 left-1 rounded-[10px] bg-card shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
        style={{
          width: 'calc((100% - 0.5rem) / 3)',
          transform: `translateX(${index * 100}%)`,
          transition: 'transform 320ms var(--ease-out)',
        }}
      />
      {ITEMS.map((it) => {
        const active = value === it.key
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onChange(it.key)}
            aria-pressed={active}
            className={`relative z-10 flex items-center justify-center gap-1.5 rounded-[10px] px-3 py-1.5 text-[13px] font-medium transition-colors ${
              active ? 'text-ink' : 'text-muted hover:text-ink'
            }`}
          >
            {it.icon}
            <span className="hidden sm:inline">{it.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function MonitorIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 20h8M12 16v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}
function TabletIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="3" width="14" height="18" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M11 18h2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}
function PhoneIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="7" y="2.5" width="10" height="19" rx="2.2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M11 18.5h2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

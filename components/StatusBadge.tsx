import type { FormStatus } from '@/lib/types'

const STYLES: Record<FormStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'text-draft bg-draft-bg' },
  open: { label: 'Active', className: 'text-open bg-open-bg' },
  closed: { label: 'Closed', className: 'text-closed bg-closed-bg' },
}

export default function StatusBadge({ status }: { status: FormStatus }) {
  const s = STYLES[status]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-medium ${s.className}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {s.label}
    </span>
  )
}

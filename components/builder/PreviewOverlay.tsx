'use client'

import { useState } from 'react'
import DeviceSwitch, { type Device } from './DeviceSwitch'

// Preview device widths. An iframe gets its own viewport equal to its width, so
// resizing it makes the voter page's responsive layout reflow correctly.
const PREVIEW_WIDTH: Record<Device, string> = {
  desktop: '100%',
  tablet: '834px',
  mobile: '390px',
}

/** Full-screen preview of the live voter page, framed per device. */
export default function PreviewOverlay({ slug, start, onClose }: { slug: string; start: string; onClose: () => void }) {
  const [device, setDevice] = useState<Device>('desktop')
  const src = `/f/${slug}?preview=1&start=${encodeURIComponent(start)}`

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg">
      <header className="flex h-14 flex-none items-center justify-between border-b border-line px-4 sm:px-6">
        <div className="flex items-center gap-3 text-[14px]">
          <button type="button" onClick={onClose} className="rounded-[16px] bg-ink px-4 py-1.5 font-medium text-white transition hover:opacity-90">
            Back
          </button>
        </div>
        <span className="absolute left-1/2 -translate-x-1/2 text-[14px] font-medium">Preview</span>
        <DeviceSwitch value={device} onChange={setDevice} />
      </header>

      <div className="flex flex-1 justify-center overflow-hidden bg-black/[0.04] p-6">
        <div
          className={`h-full overflow-hidden bg-white transition-[width] duration-300 ease-out ${
            device === 'desktop' ? 'w-full' : 'rounded-[28px] border border-line shadow-[0_16px_44px_-24px_rgba(0,0,0,0.3)]'
          }`}
          style={{ width: PREVIEW_WIDTH[device], maxWidth: '100%' }}
        >
          <iframe src={src} title="Preview" className="h-full w-full border-0" />
        </div>
      </div>
    </div>
  )
}

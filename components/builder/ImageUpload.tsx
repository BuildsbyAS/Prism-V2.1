'use client'

import { useRef, useState } from 'react'
import { uploadAsset } from '@/lib/assets'

/**
 * Hero image/gif upload. Persists via uploadAsset — Supabase Storage URL when
 * configured, base64 data URL in demo mode (see lib/assets.ts).
 */
export default function ImageUpload({
  value,
  onChange,
  onClickUpload,
  label = 'Hero image / GIF',
}: {
  value: string
  onChange: (url: string) => void
  /** When set, clicking opens this (the media modal) instead of the file dialog. */
  onClickUpload?: () => void
  label?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const openUpload = onClickUpload ?? (() => inputRef.current?.click())

  async function pick(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image or GIF.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Keep it under 5 MB.')
      return
    }
    setError(null)
    setBusy(true)
    try {
      onChange(await uploadAsset(file, { prefix: 'hero' }))
    } catch {
      setError('Upload failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (value) {
    return (
      <div className="group relative w-full overflow-hidden rounded-2xl border border-line @3xl:h-full @3xl:min-h-[440px]">
        {/* Stacked (tablet/mobile): full width, natural proportions (page scrolls
            if tall). Desktop column: fills the card height, cropped to focal. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={value} alt="Hero" className="w-full @3xl:h-full @3xl:object-cover" />
        <div className="absolute inset-x-0 bottom-0 flex gap-2 bg-gradient-to-t from-black/40 to-transparent p-3 opacity-0 transition group-hover:opacity-100">
          <button
            type="button"
            onClick={openUpload}
            className="rounded-[16px] bg-white/90 px-3 py-1.5 text-[14px] font-medium text-ink"
          >
            Replace
          </button>
          <button
            type="button"
            onClick={() => onChange('')}
            className="rounded-[16px] bg-white/90 px-3 py-1.5 text-[14px] font-medium text-ink"
          >
            Remove
          </button>
        </div>
        <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
      </div>
    )
  }

  return (
    <div className="h-full">
      <button
        type="button"
        disabled={busy}
        onClick={openUpload}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          if (!busy) pick(e.dataTransfer.files?.[0])
        }}
        className="flex h-full min-h-[300px] w-full flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong bg-black/[0.015] px-6 text-center transition hover:bg-black/[0.03] disabled:cursor-wait disabled:opacity-70 @3xl:min-h-[440px]"
      >
        <span className="text-2xl text-muted">⤒</span>
        <span className="mt-2 text-[14px] font-medium">{busy ? 'Uploading…' : label}</span>
        <span className="mt-0.5 text-[13px] text-muted">Click or drop an image/GIF · optional</span>
      </button>
      {error && <p className="mt-2 text-[13px] text-red-600">{error}</p>}
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
    </div>
  )
}

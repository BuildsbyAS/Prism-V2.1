'use client'

import { useRef, useState } from 'react'
import { uploadAsset } from '@/lib/assets'
import MediaLightbox from '@/components/MediaLightbox'
import { MediaIconBtn, EditGlyph, DeleteGlyph, ExpandGlyph } from './controls'

/**
 * Hero image/gif upload. Persists via uploadAsset — Supabase Storage URL when
 * configured, base64 data URL in demo mode (see lib/assets.ts).
 */
export default function ImageUpload({
  value,
  onChange,
  onClickUpload,
  label = 'Hero image / GIF',
  bare = false,
}: {
  value: string
  onChange: (url: string) => void
  /** When set, clicking opens this (the media modal) instead of the file dialog. */
  onClickUpload?: () => void
  label?: string
  /** Drop the frame/crop so the media can float on a HeroPanel backdrop. */
  bare?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [zoom, setZoom] = useState(false)
  const openUpload = onClickUpload ?? (() => inputRef.current?.click())

  async function pick(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image or GIF.')
      return
    }
    // Same ceiling MediaModal enforces — the two are alternate doors onto one
    // upload, so a file the modal would take can't bounce off the drop zone.
    if (file.size > 15 * 1024 * 1024) {
      setError('Keep it under 15 MB.')
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
      <div
        className={
          bare
            ? 'group relative z-10 flex h-full w-full items-center justify-center'
            : 'group relative w-full overflow-hidden rounded-2xl border border-line @3xl:h-full @3xl:min-h-[440px]'
        }
      >
        {/* Bare (on a HeroPanel): fill the panel's padded box so the image's
            max-h/max-w percentages have a definite box to resolve against, then
            fit inside it with the aspect ratio intact.
            Framed: full width stacked, cropped to focal in the desktop column. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={value}
          alt="Hero"
          className={
            bare
              ? 'block max-h-full max-w-full rounded-[18px] object-contain'
              : 'w-full @3xl:h-full @3xl:object-cover'
          }
        />
        {/* Same hover vocabulary as an option's media on a feedback page — edit
            and delete as icon buttons over a scrim — so the two read as the same
            kind of object. Centred on the bare variant so the controls always
            land on the image, which object-contain letterboxes in the middle of
            the padded box. */}
        <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/25 opacity-0 transition group-hover:opacity-100">
          {/* The hero is letterboxed into whatever the canvas column leaves it,
              and on the framed variant it's cropped outright — so seeing the
              whole thing needs its own control. */}
          <MediaIconBtn tip="Expand" onClick={() => setZoom(true)}>
            {ExpandGlyph}
          </MediaIconBtn>
          <MediaIconBtn tip="Edit" onClick={openUpload}>
            {EditGlyph}
          </MediaIconBtn>
          <MediaIconBtn tip="Delete" onClick={() => onChange('')}>
            {DeleteGlyph}
          </MediaIconBtn>
        </div>
        <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
        {zoom && (
          <MediaLightbox media={{ type: 'image', src: value, title: label, alt: '' }} onClose={() => setZoom(false)} />
        )}
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
        {/* This zone owns half the welcome screen, so it's typed to that size —
            at the 13/14px of a properties-rail control the copy looked lost in
            the middle of the column. */}
        <span className="text-4xl leading-none text-muted">⤒</span>
        <span className="mt-4 text-[19px] font-semibold tracking-tight">{busy ? 'Uploading…' : label}</span>
        <span className="mt-1 text-[15px] text-muted">Click or drop an image/GIF · optional</span>
      </button>
      {error && <p className="mt-2 text-[13px] text-red-600">{error}</p>}
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
    </div>
  )
}

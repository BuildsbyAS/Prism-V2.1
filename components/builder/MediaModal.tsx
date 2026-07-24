'use client'

import { useEffect, useRef, useState } from 'react'
import type { EmbedType } from '@/lib/types'
import { inferEmbedType } from '@/lib/embed'
import { uploadAsset } from '@/lib/assets'
import MediaEmbed from '@/components/MediaEmbed'

/**
 * Media gallery — one screen, two ways to add media: upload a file, or paste a
 * URL. Works for an option's media (any type) or, in `imageOnly` mode, a simple
 * image (e.g. the welcome hero). The type is inferred from the file/URL.
 */
export default function MediaModal({
  embedType,
  embedUrl,
  onChange,
  onClose,
  imageOnly = false,
  alt,
  focalX,
  focalY,
  brightness,
}: {
  embedType: EmbedType
  embedUrl: string
  onChange: (patch: { embed_type?: EmbedType; embed_url: string }) => void
  onClose: () => void
  imageOnly?: boolean
  alt?: string
  focalX?: number
  focalY?: number
  brightness?: number
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const isData = embedUrl.startsWith('data:')

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function pickFile(file: File | undefined) {
    if (!file) return
    const isVideo = file.type.startsWith('video/')
    if (imageOnly ? !file.type.startsWith('image/') : !file.type.startsWith('image/') && !isVideo) {
      setError(imageOnly ? 'Choose an image file.' : 'Choose an image or video file.')
      return
    }
    if (file.size > 15 * 1024 * 1024) {
      setError('Keep it under 15 MB.')
      return
    }
    setError(null)
    setBusy(true)
    try {
      const url = await uploadAsset(file, { prefix: imageOnly ? 'hero' : 'media' })
      onChange({ embed_type: (imageOnly || !isVideo ? 'image' : 'video') as EmbedType, embed_url: url })
    } catch {
      setError('Upload failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="u-overlay fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4 py-10 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="u-modal w-full max-w-[520px] overflow-hidden rounded-[26px] border border-line bg-card shadow-[0_1px_2px_rgba(0,0,0,0.03),0_24px_60px_-24px_rgba(0,0,0,0.35)]" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-[17px] font-semibold tracking-tight">Media gallery</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted transition hover:text-ink">✕</button>
        </div>

        <div className="space-y-4 p-5">
          {/* 1 — Upload */}
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              if (!busy) pickFile(e.dataTransfer.files?.[0])
            }}
            className="flex min-h-[200px] w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-line-strong bg-black/[0.015] px-6 text-center transition hover:border-ink hover:bg-black/[0.03] disabled:cursor-wait disabled:opacity-70"
          >
            <span className="text-2xl text-muted">⤒</span>
            <span className="mt-2 text-[15px] font-medium">
              {busy ? 'Uploading…' : <><span className="underline">{isData ? 'Replace' : 'Upload'}</span> or drop a file</>}
            </span>
            <span className="mt-1 text-[13px] text-muted">{imageOnly ? 'JPG, PNG, WEBP, or GIF · up to 15 MB' : 'JPG, PNG, WEBP, GIF, or MP4 · up to 15 MB'}</span>
          </button>
          <input ref={inputRef} type="file" accept={imageOnly ? 'image/*' : 'image/*,video/*'} hidden onChange={(e) => pickFile(e.target.files?.[0])} />
          {error && <p className="text-[13px] text-red-600">{error}</p>}

          {/* divider */}
          <div className="flex items-center gap-3 text-[13px] text-muted">
            <span className="h-px flex-1 bg-line" />
            or paste a URL
            <span className="h-px flex-1 bg-line" />
          </div>

          {/* 2 — URL */}
          <div>
            <input
              value={isData ? '' : embedUrl}
              onChange={(e) => onChange({ embed_type: imageOnly ? 'image' : inferEmbedType(e.target.value), embed_url: e.target.value })}
              placeholder={isData ? 'Uploaded file in use' : 'https://…'}
              className="w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm outline-none placeholder:text-muted focus:border-ink"
            />
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
              {imageOnly ? 'Add an image or GIF URL' : 'Add a Vercel-hosted prototype, a Figma frame or a Loom/Youtube video'}
            </p>
          </div>

          {/* preview */}
          {embedUrl && (
            <div className="flex justify-center rounded-2xl border border-line bg-black/[0.015] py-5">
              <div className="w-full max-w-[240px]">
                <MediaEmbed type={embedType} src={embedUrl} title={alt ?? 'Preview'} alt={alt} focalX={focalX} focalY={focalY} brightness={brightness} />
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-line px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-[16px] bg-ink px-5 py-2 text-[14px] font-medium text-white transition hover:opacity-90">
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

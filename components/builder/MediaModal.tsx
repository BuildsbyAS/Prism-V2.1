'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { EmbedType } from '@/lib/types'
import { inferEmbedType, hostnameOf, isAllowedEmbedUrl, EMBED_TYPE_LABEL } from '@/lib/embed'
import { uploadAsset } from '@/lib/assets'
import MediaEmbed from '@/components/MediaEmbed'

const MAX_BYTES = 15 * 1024 * 1024

/**
 * Media picker — upload a file, drop one anywhere on the dialog, paste one, or
 * paste a URL. Works for an option's media (any type) or, in `imageOnly` mode, a
 * simple image (e.g. the welcome hero). The type is inferred from the file/URL.
 *
 * The layout follows the state: with nothing set the drop zone is the whole
 * screen, and once media exists that media leads and adding is demoted to a
 * quiet row beneath it.
 */
export default function MediaModal({
  embedType,
  embedUrl,
  onChange,
  onClose,
  imageOnly = false,
  alt,
  brightness,
}: {
  embedType: EmbedType
  embedUrl: string
  onChange: (patch: { embed_type?: EmbedType; embed_url: string }) => void
  onClose: () => void
  imageOnly?: boolean
  alt?: string
  brightness?: number
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const urlRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  // dragenter/leave fire per descendant, so depth-count them or the overlay
  // flickers as the pointer crosses child elements.
  const dragDepth = useRef(0)
  const titleId = useId()

  const isData = embedUrl.startsWith('data:')
  const host = isData ? null : hostnameOf(embedUrl)
  // Only the iframe-backed types are allowlisted; an image or an uploaded video
  // is rendered directly and can come from anywhere.
  const detectedType = !imageOnly && !isData && embedUrl.trim() ? inferEmbedType(embedUrl) : null
  const blockedDomain =
    (detectedType === 'react' || detectedType === 'figma' || detectedType === 'protopie') &&
    !isAllowedEmbedUrl(embedUrl)
  const accept = imageOnly ? 'image/*' : 'image/*,video/*'
  const formats = imageOnly
    ? 'JPG, PNG, WEBP, or GIF · up to 15 MB'
    : 'JPG, PNG, WEBP, GIF, or MP4 · up to 15 MB'

  const pickFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return
      const isVideo = file.type.startsWith('video/')
      const isImage = file.type.startsWith('image/')
      if (imageOnly ? !isImage : !isImage && !isVideo) {
        setError(imageOnly ? 'Choose an image file.' : 'Choose an image or video file.')
        return
      }
      if (file.size > MAX_BYTES) {
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
    },
    [imageOnly, onChange],
  )

  function applyUrl(value: string) {
    setError(null)
    onChange({ embed_type: imageOnly ? 'image' : inferEmbedType(value), embed_url: value })
  }

  // Escape to close, and Tab cycles within the dialog so focus can't wander to
  // the builder behind it. Focus starts inside and returns where it came from.
  useEffect(() => {
    const restoreTo = document.activeElement as HTMLElement | null
    dialogRef.current?.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab' || !dialogRef.current) return
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([hidden]), a[href], [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      restoreTo?.focus?.()
    }
  }, [onClose])

  // Paste an image file from anywhere in the dialog. A pasted *link* is only
  // adopted where there's a URL field to explain it, and never over media you
  // already have — a stray ⌘V of whatever was on the clipboard (a page URL, say)
  // must not silently replace your media. Inside the URL field the browser's own
  // paste is what you want, so leave it alone.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const file = e.clipboardData?.files?.[0]
      if (file) {
        e.preventDefault()
        pickFile(file)
        return
      }
      if (imageOnly || embedUrl || document.activeElement === urlRef.current) return
      const text = e.clipboardData?.getData('text')?.trim()
      if (text && /^https?:\/\//i.test(text)) {
        e.preventDefault()
        applyUrl(text)
      }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickFile, imageOnly, embedUrl, onChange])

  const hasMedia = Boolean(embedUrl)

  return (
    <div
      className="u-overlay fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4 py-10 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="u-modal relative w-full max-w-[520px] overflow-hidden rounded-[26px] border border-line bg-card shadow-[0_1px_2px_rgba(0,0,0,0.03),0_24px_60px_-24px_rgba(0,0,0,0.35)] outline-none"
        onMouseDown={(e) => e.stopPropagation()}
        // Dropping is accepted anywhere on the dialog, not just on the drop
        // zone — once media exists there is no drop zone left to aim at.
        onDragEnter={(e) => {
          e.preventDefault()
          if (e.dataTransfer.types.includes('Files')) {
            dragDepth.current += 1
            setDragging(true)
          }
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => {
          dragDepth.current = Math.max(0, dragDepth.current - 1)
          if (dragDepth.current === 0) setDragging(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          dragDepth.current = 0
          setDragging(false)
          if (!busy) pickFile(e.dataTransfer.files?.[0])
        }}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id={titleId} className="text-[17px] font-semibold tracking-tight">
            {imageOnly ? 'Hero image' : 'Media'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="u-circle grid h-8 w-8 place-items-center rounded-full text-muted transition hover:bg-black/[0.05] hover:text-ink"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 p-5">
          {hasMedia ? (
            <>
              {/* What you have leads. */}
              <div className="group relative flex h-[264px] items-center justify-center overflow-hidden rounded-2xl border border-line bg-black/[0.015] p-4">
                {imageOnly ? (
                  // The hero renders contained on a backdrop, so preview it
                  // contained too — MediaEmbed would crop it to 4:3 and misreport
                  // what a portrait image will actually look like.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={embedUrl}
                    alt={alt ?? 'Hero preview'}
                    className="max-h-full max-w-full rounded-xl object-contain"
                  />
                ) : embedType === 'image' || embedType === 'video' ? (
                  // The media caps itself at 70vh out in the form; in here the
                  // box is 264px tall, so cap it to that instead of letting it
                  // overflow and be clipped by the dialog.
                  <div className="flex w-full max-w-[340px] justify-center [&_img]:max-h-[232px] [&_video]:max-h-[232px]">
                    <MediaEmbed type={embedType} src={embedUrl} title={alt ?? 'Preview'} alt={alt} brightness={brightness} />
                  </div>
                ) : (
                  // A prototype frame is 300×650 — far taller than the dialog.
                  // Scale it down visually (the iframe keeps its real 375px
                  // viewport, so the shrink is a zoom, not a reflow) and make it
                  // inert, since clicking a 40% prototype is not useful. The
                  // definite width is what MediaEmbed measures to size the frame,
                  // so it renders at its full 300px and this transform — which
                  // doesn't touch layout — takes it down to fit.
                  <div className="pointer-events-none w-[300px] origin-center scale-[0.38]">
                    <MediaEmbed type={embedType} src={embedUrl} title={alt ?? 'Preview'} />
                  </div>
                )}

                {/* The actions live on the media itself rather than as a button
                    row beneath it, so the preview is the only thing competing
                    for attention until you reach for it. The wrapper stays
                    click-through so a video's own controls remain reachable, and
                    an upload in flight pins the overlay open so the progress
                    isn't hidden by the pointer wandering off. */}
                <div
                  className={`pointer-events-none absolute inset-0 grid place-items-center transition group-focus-within:opacity-100 group-hover:opacity-100 ${busy ? 'opacity-100' : 'opacity-0'}`}
                >
                  <div className="absolute inset-0 bg-black/25" />
                  <div className="pointer-events-auto relative flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => inputRef.current?.click()}
                      className="rounded-xl bg-ink/85 px-3.5 py-2 text-[13px] font-semibold text-white transition hover:bg-ink disabled:opacity-70"
                    >
                      {busy ? 'Uploading…' : 'Replace'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onChange({ embed_url: '' })}
                      className="rounded-xl bg-ink/85 px-3.5 py-2 text-[13px] font-semibold text-white transition hover:bg-red-600"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>

              <p className="min-w-0 text-[13px] text-muted">
                <span className="font-medium text-ink">{EMBED_TYPE_LABEL[embedType]}</span>
                {' · '}
                <span className="break-all">{isData ? 'Uploaded file' : (host ?? 'Linked')}</span>
              </p>
            </>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="flex min-h-[212px] w-full flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong bg-black/[0.015] px-6 text-center transition hover:border-ink hover:bg-black/[0.03] disabled:cursor-wait disabled:opacity-70"
            >
              {busy ? (
                <Spinner />
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-muted">
                  <path
                    d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
              <span className="mt-2.5 text-[15px] font-medium">
                {busy ? 'Uploading…' : 'Drop a file, or click to browse'}
              </span>
              <span className="mt-1 text-[13px] text-muted">{formats}</span>
            </button>
          )}

          <input
            ref={inputRef}
            type="file"
            accept={accept}
            hidden
            onChange={(e) => {
              pickFile(e.target.files?.[0])
              // Let the same file be picked again after a remove.
              e.target.value = ''
            }}
          />

          {error && (
            <p role="alert" className="text-[13px] text-red-600">
              {error}
            </p>
          )}

          {/* The hero is upload-only. A link here buys nothing — there is no
              prototype/video to embed, only an image — and it invites pasting
              some arbitrary page URL that renders as a broken image. */}
          {!imageOnly && (
            <>
              <div className="flex items-center gap-3 text-[13px] text-muted">
                <span className="h-px flex-1 bg-line" />
                or paste a URL
                <span className="h-px flex-1 bg-line" />
              </div>

              <div>
                <input
                  ref={urlRef}
                  type="url"
                  value={isData ? '' : embedUrl}
                  onChange={(e) => applyUrl(e.target.value)}
                  placeholder="https://…"
                  aria-label="Media URL"
                  className="w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm outline-none placeholder:text-muted focus:border-ink"
                />
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
                  Figma prototype, ProtoPie link, Vercel-hosted prototype, or a Loom/YouTube video.
                  Voters can click through prototypes.
                </p>
                {/* The type is inferred rather than chosen, so say what was inferred.
                    Without this an unsupported domain looks fine here and only fails
                    later, as a "Blocked embed" in the voter's view. */}
                {detectedType && (
                  <p className="mt-1.5 text-[13px]">
                    <span className="text-muted">Detected: </span>
                    <span className="font-medium text-ink">{EMBED_TYPE_LABEL[detectedType]}</span>
                    {blockedDomain && (
                      <span className="text-red-600"> · {host ?? 'that domain'} can&rsquo;t be embedded</span>
                    )}
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end border-t border-line px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[16px] bg-ink px-5 py-2 text-[14px] font-medium text-white transition hover:opacity-90"
          >
            Done
          </button>
        </div>

        {/* Drag affordance over the whole dialog. */}
        {dragging && (
          <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-[26px] bg-card/85 backdrop-blur-[2px]">
            <div className="flex flex-col items-center rounded-2xl border-2 border-dashed border-ink px-8 py-6">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <p className="mt-2 text-[15px] font-medium">Drop to upload</p>
              <p className="mt-0.5 text-[13px] text-muted">{formats}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="animate-spin text-muted">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

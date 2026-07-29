'use client'

import { useEffect, useRef, useState } from 'react'
import type { EmbedType } from '@/lib/types'
import { EMBED_ALLOWLIST, embedSrc, isAllowedEmbedUrl, toVideoEmbedUrl, hostnameOf } from '@/lib/embed'
import { brightnessStyle } from '@/lib/image'

interface Props {
  type: EmbedType
  src: string
  title?: string
  /** Alt text for images (empty string = decorative). Falls back to title. */
  alt?: string
  /** Brightness delta (−100…100). */
  brightness?: number
  /** Override the default 375×812 phone frame for react/figma embeds. */
  width?: number
  height?: number
}

/**
 * One embed primitive for every option's media. Generalizes the original
 * .device/.screen iframe pattern (375×812 scaled phone) to any creator-supplied
 * source. react/figma render in a sandboxed iframe; video uses a provider embed
 * or the native player; image is a plain <img>.
 *
 * Nothing here crops. This is a tool for judging a design, so any pixel hidden
 * to make the media fit a tidy box is a pixel the voter can't give feedback on:
 * every type is bounded (by the column's width and a max height) and then left
 * to keep its own aspect ratio inside those bounds.
 */
export default function MediaEmbed({ type, src, title = 'Prototype', alt, brightness, width = 375, height = 812 }: Props) {
  if (!src) return <EmbedPlaceholder label="No media yet" />

  if (type === 'image') {
    return (
      // A screenshot is whatever shape it was captured at — portrait phone, wide
      // desktop, a tall scrolling flow. `w-auto` + `max-w-full` bounds it to the
      // column and the max height keeps a very tall one from running off the
      // screen; the aspect ratio does the rest.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt ?? title}
        loading="lazy"
        style={brightnessStyle(brightness)}
        className="max-h-[70vh] w-auto max-w-full rounded-2xl border border-line object-contain"
      />
    )
  }

  if (type === 'video') {
    const embed = toVideoEmbedUrl(src)
    if (embed) {
      return (
        <div className="aspect-video w-full overflow-hidden rounded-2xl border border-line bg-black">
          <iframe
            src={embed}
            title={title}
            loading="lazy"
            allow="fullscreen; picture-in-picture"
            className="h-full w-full"
          />
        </div>
      )
    }
    return (
      <video
        src={src}
        controls
        preload="metadata"
        className="max-h-[520px] w-full rounded-2xl border border-line bg-black"
      />
    )
  }

  // react / figma / protopie → sandboxed phone-frame iframe the voter can click
  // through. Figma share links are rewritten to Embed Kit URLs first; ProtoPie
  // Cloud and Vercel links are already embeddable as-is.
  if (!isAllowedEmbedUrl(src)) {
    return (
      <EmbedPlaceholder
        label={`Blocked embed${hostnameOf(src) ? ` · ${hostnameOf(src)}` : ''}`}
        detail={`This domain isn't on the allowlist. Allowed: ${EMBED_ALLOWLIST.join(', ')}.`}
      />
    )
  }

  return <PrototypeFrame src={embedSrc(type, src)} title={title} width={width} height={height} />
}

/** Roomiest the phone frame ever gets, when the column has width to spare. */
const MAX_PROTO_SCALE = 0.8

/**
 * Sandboxed prototype in a phone frame, scaled down to whatever width it's given.
 *
 * The scale was a fixed 0.8, which is fine in one wide column and clips in a
 * narrow one — a three-up comparison at 900px leaves each option ~250px, so a
 * 300px frame lost its right edge to the card's `overflow-hidden`. Measuring the
 * column instead means the frame shrinks to fit rather than getting cut off. The
 * iframe keeps its real 375px viewport throughout, so this stays a zoom and the
 * prototype never reflows to a layout the creator didn't design for.
 */
function PrototypeFrame({ src, title, width, height }: { src: string; title: string; width: number; height: number }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(MAX_PROTO_SCALE)

  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    // ResizeObserver fires once on observe, so the first measurement lands
    // without a separate read — and every reflow after (device preview, window
    // resize, rail drag) re-fits on its own.
    const ro = new ResizeObserver(([entry]) => {
      const avail = entry.contentRect.width
      if (avail > 0) setScale(Math.min(MAX_PROTO_SCALE, avail / width))
    })
    ro.observe(box)
    return () => ro.disconnect()
  }, [width])

  return (
    // The outer box measures the column; the inner one is the frame's painted
    // size, so the surrounding layout reserves exactly the space the scaled
    // iframe occupies (a transform alone doesn't affect layout).
    <div ref={boxRef} className="w-full">
      <div className="relative mx-auto" style={{ width: width * scale, height: height * scale }}>
        <iframe
          src={src}
          title={title}
          loading="lazy"
          // Untrusted, creator-supplied content: sandbox tightly, allow only what a
          // prototype needs to run and be clicked through.
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          allow="fullscreen; clipboard-write"
          referrerPolicy="no-referrer"
          style={{
            width,
            height,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            borderRadius: 38,
            overflow: 'hidden',
            background: '#fff',
            border: 0,
            display: 'block',
            position: 'absolute',
            top: 0,
            left: 0,
          }}
        />
      </div>
    </div>
  )
}

function EmbedPlaceholder({ label, detail }: { label: string; detail?: string }) {
  return (
    <div className="flex h-[400px] w-[300px] max-w-full flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong bg-black/[0.015] px-6 text-center">
      <span className="text-[14px] font-medium text-muted">{label}</span>
      {detail && <span className="mt-1.5 text-[13px] leading-relaxed text-muted">{detail}</span>}
    </div>
  )
}

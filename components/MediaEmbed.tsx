'use client'

import type { EmbedType } from '@/lib/types'
import { isAllowedEmbedUrl, toVideoEmbedUrl, hostnameOf } from '@/lib/embed'
import { imageAdjustStyle } from '@/lib/image'

interface Props {
  type: EmbedType
  src: string
  title?: string
  /** Alt text for images (empty string = decorative). Falls back to title. */
  alt?: string
  /** Image adjustments — focal-point crop (0–100) + brightness delta (−100…100). */
  focalX?: number
  focalY?: number
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
 */
export default function MediaEmbed({ type, src, title = 'Prototype', alt, focalX, focalY, brightness, width = 375, height = 812 }: Props) {
  if (!src) return <EmbedPlaceholder label="No media yet" />

  if (type === 'image') {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt ?? title}
        loading="lazy"
        style={imageAdjustStyle(focalX, focalY, brightness)}
        className="aspect-[4/3] w-full rounded-2xl border border-line object-cover"
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

  // react / figma → sandboxed phone-frame iframe.
  if (!isAllowedEmbedUrl(src)) {
    return (
      <EmbedPlaceholder
        label={`Blocked embed${hostnameOf(src) ? ` · ${hostnameOf(src)}` : ''}`}
        detail="This domain isn't on the allowlist. Allowed: figma.com, vercel.app, youtube.com, loom.com."
      />
    )
  }

  const scale = 0.8
  return (
    <div
      className="relative flex-none"
      style={{ width: width * scale, height: height * scale }}
    >
      <iframe
        src={src}
        title={title}
        loading="lazy"
        // Untrusted, creator-supplied content: sandbox tightly, allow only what a
        // prototype needs to run and be clicked through.
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
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

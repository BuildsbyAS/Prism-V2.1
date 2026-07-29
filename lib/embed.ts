import type { EmbedType } from './types'

// Domains we allow to be iframed for prototype embeds (and provider video).
// Creator-supplied URLs are untrusted, so we start narrow — easier to widen on
// request than to lock down after the fact.
export const EMBED_ALLOWLIST = [
  'figma.com',
  'protopie.io',
  'vercel.app',
  'youtube.com',
  'youtu.be',
  'loom.com',
]

/** Identifies us to Figma's Embed Kit; required on every embed URL. */
const FIGMA_EMBED_HOST = 'prism'

export function hostnameOf(raw: string): string | null {
  try {
    return new URL(raw).hostname.toLowerCase()
  } catch {
    return null
  }
}

export function isAllowedEmbedUrl(raw: string): boolean {
  const host = hostnameOf(raw)
  if (!host) return false
  return EMBED_ALLOWLIST.some((d) => host === d || host.endsWith('.' + d))
}

/** Turn a YouTube/Loom watch URL into its embeddable form. */
export function toVideoEmbedUrl(raw: string): string | null {
  const host = hostnameOf(raw)
  if (!host) return null
  try {
    const u = new URL(raw)
    if (host.endsWith('youtube.com')) {
      const id = u.searchParams.get('v')
      return id ? `https://www.youtube.com/embed/${id}` : null
    }
    if (host === 'youtu.be') {
      const id = u.pathname.slice(1)
      return id ? `https://www.youtube.com/embed/${id}` : null
    }
    if (host.endsWith('loom.com')) {
      return raw.replace('/share/', '/embed/')
    }
  } catch {
    return null
  }
  return null
}

/**
 * A share link pasted from Figma (`figma.com/proto/…`, `/design/…`, `/board/…`)
 * won't render in an iframe as-is — Embed Kit 2.0 serves embeds from
 * `embed.figma.com` and requires an `embed-host`. The path and query are carried
 * over untouched, which matters for prototypes: `node-id` and
 * `starting-point-node-id` are what pick the starting frame.
 *
 * Returns null for anything that isn't a Figma URL.
 */
export function toFigmaEmbedUrl(raw: string): string | null {
  const host = hostnameOf(raw)
  if (!host || !(host === 'figma.com' || host.endsWith('.figma.com'))) return null
  try {
    const u = new URL(raw)
    u.protocol = 'https:'
    u.hostname = 'embed.figma.com'
    // Already-embeddable links keep whatever host they declared.
    if (!u.searchParams.has('embed-host')) u.searchParams.set('embed-host', FIGMA_EMBED_HOST)
    return u.toString()
  } catch {
    return null
  }
}

/**
 * The iframe `src` for a given embed. Most sources are used verbatim — a
 * ProtoPie Cloud share link and a Vercel deployment are both directly
 * embeddable — but Figma needs rewriting and video providers need their embed
 * path. Falls back to the raw URL so a slightly odd link still gets a chance.
 */
export function embedSrc(type: EmbedType, raw: string): string {
  if (type === 'figma') return toFigmaEmbedUrl(raw) ?? raw
  if (type === 'video') return toVideoEmbedUrl(raw) ?? raw
  return raw
}

export const EMBED_TYPE_LABEL: Record<EmbedType, string> = {
  image: 'Image / GIF',
  video: 'Video',
  react: 'Web prototype',
  figma: 'Figma prototype',
  protopie: 'ProtoPie prototype',
}

/** Infer the embed type from a pasted URL so the creator never picks a type. */
export function inferEmbedType(url: string): EmbedType {
  const host = hostnameOf(url) ?? ''
  const path = (url.split(/[?#]/)[0] ?? '').toLowerCase()
  if (host.endsWith('figma.com')) return 'figma'
  if (host.endsWith('protopie.io')) return 'protopie'
  if (host.endsWith('youtube.com') || host === 'youtu.be' || host.endsWith('loom.com')) return 'video'
  if (host.endsWith('vercel.app')) return 'react'
  // Extension wins over host for direct file links (a .gif on any CDN is still
  // an image), so these are checked after the known providers.
  if (/\.(png|jpe?g|gif|webp|svg|avif)$/.test(path)) return 'image'
  if (/\.(mp4|webm|mov|m4v)$/.test(path)) return 'video'
  return 'react' // a hosted prototype on some other domain (allowlist guards it)
}

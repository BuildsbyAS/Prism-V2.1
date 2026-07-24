import type { EmbedType } from './types'

// Domains we allow to be iframed for `react` / `figma` embeds (and provider
// video). Creator-supplied URLs are untrusted, so we start narrow — easier to
// widen on request than to lock down after the fact.
export const EMBED_ALLOWLIST = ['figma.com', 'vercel.app', 'youtube.com', 'youtu.be', 'loom.com']

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

export const EMBED_TYPE_LABEL: Record<EmbedType, string> = {
  image: 'Image',
  video: 'Video',
  react: 'React prototype',
  figma: 'Figma frame',
}

/** Infer the embed type from a pasted URL so the creator never picks a type. */
export function inferEmbedType(url: string): EmbedType {
  const host = hostnameOf(url) ?? ''
  const path = (url.split(/[?#]/)[0] ?? '').toLowerCase()
  if (host.endsWith('figma.com')) return 'figma'
  if (host.endsWith('youtube.com') || host === 'youtu.be' || host.endsWith('loom.com')) return 'video'
  if (host.endsWith('vercel.app')) return 'react'
  if (/\.(png|jpe?g|gif|webp|svg|avif)$/.test(path)) return 'image'
  if (/\.(mp4|webm|mov|m4v)$/.test(path)) return 'video'
  return 'react' // a hosted prototype on some other domain (allowlist guards it)
}

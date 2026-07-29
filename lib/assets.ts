'use client'

// Asset persistence for uploaded media (hero images, option prototypes/images,
// and voter voice notes). One API, two backends — mirroring lib/store.ts:
//
//   • Supabase configured → upload to the public `assets` Storage bucket and
//     return its public URL. Durable across sessions AND devices, and keeps the
//     heavy bytes out of the row (embed_url / response value stores just a URL).
//   • Not configured (demo) → fall back to an inline base64 data URL, which only
//     lives in the browser that created it. Fine for a local click-through, but
//     it does NOT persist for other sessions/devices — configure Supabase to fix.

import { supabase, isSupabaseConfigured } from './supabase'

const BUCKET = 'assets'

function rid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function extFor(mime: string): string {
  const m = mime.toLowerCase()
  if (m.includes('webm')) return 'webm'
  if (m.includes('quicktime') || m.includes('mov')) return 'mov'
  if (m.includes('m4a')) return 'm4a'
  if (m.includes('mp4')) return 'mp4'
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3'
  if (m.includes('ogg')) return 'ogg'
  if (m.includes('wav')) return 'wav'
  if (m.includes('png')) return 'png'
  if (m.includes('gif')) return 'gif'
  if (m.includes('webp')) return 'webp'
  if (m.includes('svg')) return 'svg'
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg'
  return 'bin'
}

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsDataURL(blob)
  })
}

/** Longest edge for a demo-mode image, and the quality it re-encodes at. */
const DEMO_MAX_EDGE = 1600
const DEMO_QUALITY = 0.82

/** Formats that can carry an alpha channel — the only ones worth scanning. */
const ALPHA_CAPABLE = /png|webp|avif/

/**
 * Does anything in the canvas show through?
 *
 * Scans every pixel's alpha rather than sampling: transparency is often just a
 * logo's rounded corners or a cut-out edge, so a strided sample would miss it on
 * exactly the images that most need catching. One pass over a ≤1600px canvas
 * costs a few milliseconds, once, at upload.
 */
function hasTransparency(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  try {
    const { data } = ctx.getImageData(0, 0, w, h)
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 255) return true
    }
    return false
  } catch {
    // Reading back can throw (a tainted canvas, or memory pressure on a big
    // one). Assume alpha: the worst case is a slightly larger file, where the
    // other branch's worst case is a black box where the transparency was.
    return true
  }
}

/**
 * Shrink an image before it becomes a base64 data URL.
 *
 * Only demo mode needs this, and it needs it badly: localStorage holds about
 * 5MB *in total*, base64 inflates bytes by ~37%, and a phone photo is 3–8MB to
 * begin with. One upload could exceed the budget on its own — and since the
 * whole demo database is written as a single key, the failure isn't "the image
 * didn't save", it's "nothing saves any more".
 *
 * Skips anything that isn't a raster photo: GIFs would lose their animation and
 * SVGs are text (already small, and rasterising them is a downgrade). Falls back
 * to the original blob if the browser can't decode it.
 */
async function shrinkForDemo(file: Blob): Promise<Blob> {
  const type = (file.type || '').toLowerCase()
  if (!type.startsWith('image/') || type.includes('gif') || type.includes('svg')) return file

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, DEMO_MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    // Already small enough, and re-encoding would only lose quality.
    if (scale === 1 && file.size <= 600_000) {
      bitmap.close()
      return file
    }
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return file
    }
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()

    // JPEG has no alpha channel. A transparent PNG drawn onto a fresh canvas
    // sits on rgba(0,0,0,0), so encoding it as JPEG discards the alpha and
    // leaves the RGB behind it — pure black. That's the "my logo came back on a
    // black background" bug. WebP keeps the alpha; JPEG stays the default for
    // opaque photos, where it's the smaller of the two.
    const transparent = ALPHA_CAPABLE.test(type) && hasTransparency(ctx, w, h)
    const out = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, transparent ? 'image/webp' : 'image/jpeg', DEMO_QUALITY),
    )
    // Keep whichever is actually smaller — a small PNG can beat its own JPEG.
    // A browser with no WebP encoder falls back to PNG per spec, which is bigger
    // than the source more often than not; this check quietly keeps the original
    // in that case, and the alpha survives either way.
    return out && out.size < file.size ? out : file
  } catch {
    return file
  }
}

/**
 * Persist an uploaded asset and return a URL to it. `prefix` groups objects into
 * a folder inside the bucket (e.g. 'media', 'hero', 'voice'). Throws on a failed
 * Supabase upload so callers can surface an error.
 *
 * With Supabase the original bytes go up untouched — Storage has room, and the
 * row only holds a URL. Only the demo path, which inlines the bytes into
 * localStorage, has to shrink them.
 */
export async function uploadAsset(file: Blob, opts?: { prefix?: string }): Promise<string> {
  const type = file.type || 'application/octet-stream'
  if (isSupabaseConfigured && supabase) {
    const path = `${opts?.prefix ?? 'misc'}/${rid()}.${extFor(type)}`
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: type, upsert: false })
    if (error) throw error
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
  }
  return toDataUrl(await shrinkForDemo(file))
}

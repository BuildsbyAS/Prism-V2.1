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

/**
 * Persist an uploaded asset and return a URL to it. `prefix` groups objects into
 * a folder inside the bucket (e.g. 'media', 'hero', 'voice'). Throws on a failed
 * Supabase upload so callers can surface an error; the demo path never throws.
 */
export async function uploadAsset(file: Blob, opts?: { prefix?: string }): Promise<string> {
  const type = file.type || 'application/octet-stream'
  if (isSupabaseConfigured && supabase) {
    const path = `${opts?.prefix ?? 'misc'}/${rid()}.${extFor(type)}`
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: type, upsert: false })
    if (error) throw error
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
  }
  return toDataUrl(file)
}

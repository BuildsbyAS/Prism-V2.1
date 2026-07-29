/** "3m ago" style relative time from an ISO string. */
export function timeAgo(iso: string | null): string {
  if (!iso) return 'never'
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(iso).toLocaleDateString()
}

/**
 * A form's closing date, for the dashboard: "Expires 12 Aug", "Expires today",
 * or "Expired 3 Aug" once it's past. Null when no expiry is set — callers then
 * render nothing, rather than "no expiry", which is noise on a list.
 *
 * `expires_at` is stored as the end of the chosen day in local time, so both the
 * comparison and the formatting read in the viewer's own zone.
 */
export function expiryLabel(iso: string | null): string | null {
  if (!iso) return null
  const when = new Date(iso)
  const time = when.getTime()
  if (Number.isNaN(time)) return null

  const day = when.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  if (time < Date.now()) return `Expired ${day}`

  // Same calendar day = today is the last day it takes responses.
  const now = new Date()
  const isToday =
    when.getDate() === now.getDate() &&
    when.getMonth() === now.getMonth() &&
    when.getFullYear() === now.getFullYear()
  return isToday ? 'Expires today' : `Expires ${day}`
}

/**
 * A creator's display name, derived from their work address:
 * "sara.k@noon.com" → "Sara K". There is no profile table — the account's email
 * is the only identity the app has — so the Team list reads names from it.
 */
export function personName(email: string): string {
  const local = email.split('@')[0] ?? ''
  const words = local
    .split(/[._+-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
  return words.join(' ') || 'Someone'
}

/**
 * Avatar fills, saturated enough to carry white initials.
 *
 * Solid rather than tinted: the card's stack sits half over the form's own
 * thumbnail, and a pale chip vanishes against a bright one.
 */
const AVATAR_COLORS = [
  '#4F46E5', // indigo
  '#E11D48', // rose
  '#0891B2', // cyan
  '#B45309', // amber
  '#7C3AED', // violet
  '#059669', // emerald
  '#DB2777', // pink
  '#0D9488', // teal
]

/**
 * A person's avatar colour, derived from their address.
 *
 * Hashed rather than actually random: the point of colouring these is that you
 * come to recognise a teammate by their circle, which only works if the colour
 * is the same on every card and every render. `Math.random()` would also
 * reshuffle on each paint and break hydration.
 */
export function personColor(email: string): string {
  let h = 0
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

/** Up to two letters for a creator's avatar circle. */
export function personInitials(email: string): string {
  const words = personName(email).split(' ')
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase()
}

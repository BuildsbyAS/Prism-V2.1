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

/** Up to two letters for a creator's avatar circle. */
export function personInitials(email: string): string {
  const words = personName(email).split(' ')
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase()
}

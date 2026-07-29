/**
 * Stand-in artwork for a form with no hero image yet, so the dashboard reads as
 * a wall of distinct objects rather than a column of empty grey boxes.
 */
const PLACEHOLDERS = [
  '/form-thumbnails/ascii-1.webp',
  '/form-thumbnails/ascii-2.webp',
  '/form-thumbnails/ascii-3.webp',
  '/form-thumbnails/ascii-4.webp',
  '/form-thumbnails/ascii-5.webp',
]

/**
 * Which of the five a form gets.
 *
 * Derived from the form's id rather than drawn at random per render. Random
 * would reshuffle every time the list repainted — a rename, a filter, a tab
 * switch — so a form would have no recognisable face; and it would differ
 * between the server and client renders, which is a hydration mismatch. Hashing
 * the id gives each form one stable, arbitrary-looking pick.
 */
export function placeholderThumbnail(formId: string): string {
  let hash = 0
  for (let i = 0; i < formId.length; i++) {
    hash = (hash * 31 + formId.charCodeAt(i)) >>> 0
  }
  return PLACEHOLDERS[hash % PLACEHOLDERS.length]
}

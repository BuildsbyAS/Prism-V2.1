/** Email domain every account is restricted to. */
export const ALLOWED_EMAIL_DOMAIN = '@noon.com'

/** Individual addresses allowed alongside the domain (e.g. the project owner
 *  signing in with a personal account for testing). */
const ALLOWED_EMAILS = ['anuragshastri98@gmail.com']

/**
 * Keep this helper free of browser-only dependencies so the login UI and the
 * server-side route guard enforce exactly the same access policy.
 */
export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const normalizedEmail = email.toLowerCase()
  return (
    normalizedEmail.endsWith(ALLOWED_EMAIL_DOMAIN) ||
    ALLOWED_EMAILS.includes(normalizedEmail)
  )
}

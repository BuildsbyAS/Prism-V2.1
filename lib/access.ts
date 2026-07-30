import type { Form } from './types'

/** Email domain every account is restricted to. */
export const ALLOWED_EMAIL_DOMAIN = '@noon.com'

/** Individual addresses allowed alongside the domain for product testing. */
const ALLOWED_EMAILS = ['anuragshastri98@gmail.com']

/** Shared by the login UI and server-side route guard. */
export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const normalizedEmail = email.toLowerCase()
  return (
    normalizedEmail.endsWith(ALLOWED_EMAIL_DOMAIN) ||
    ALLOWED_EMAILS.includes(normalizedEmail)
  )
}

export type FormAccess = 'owner' | 'edit' | 'view' | null

interface ViewerIdentity {
  id: string
  email: string
}

/** The client-side mirror of the form access rules enforced by Supabase RLS. */
export function formAccess(
  form: Pick<Form, 'creator_id' | 'collaborators' | 'viewers'>,
  user: ViewerIdentity | null,
): FormAccess {
  if (!user) return null
  if (form.creator_id === user.id) return 'owner'
  const email = user.email.toLowerCase()
  if ((form.collaborators ?? []).some((candidate) => candidate.toLowerCase() === email)) {
    return 'edit'
  }
  if ((form.viewers ?? []).some((candidate) => candidate.toLowerCase() === email)) {
    return 'view'
  }
  return null
}

export function canEditForm(access: FormAccess): boolean {
  return access === 'owner' || access === 'edit'
}

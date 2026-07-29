import Dashboard from '@/components/Dashboard'

/** Every form the team has published. A static segment, so it takes precedence
 *  over /creator/[formId] and never collides with a form id. */
export default function TeamPage() {
  return <Dashboard tab="team" />
}

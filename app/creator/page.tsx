import Dashboard from '@/components/Dashboard'

/** Your own workspace. The Team half lives at /creator/team — two
 *  routes rather than one stateful page, so the header can link between them. */
export default function CreatorPage() {
  return <Dashboard tab="mine" />
}

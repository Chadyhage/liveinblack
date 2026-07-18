import BoostActiveClient from '@/app/components/BoostActiveClient'

export const dynamic = 'force-dynamic'

// Cible de app/api/checkout/boost/route.ts (success_url : ?session_id=&boost_id=).
// Port de src/pages/BoostActivePage.jsx.
export default async function BoostActivePage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string; boost_id?: string }>
}) {
  const params = await searchParams
  return <BoostActiveClient sessionId={params.session_id || null} boostId={params.boost_id || null} />
}

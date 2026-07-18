import ConfirmEmailChangeClient from '@/app/components/ConfirmEmailChangeClient'

export const dynamic = 'force-dynamic'

// Cible du verifyLink construit par lib/server/profile.ts:requestEmailChange
// (?email=&token=), consommé par POST /api/profil/confirmer-email.
export default async function ConfirmEmailChangePage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; token?: string }>
}) {
  const params = await searchParams
  return <ConfirmEmailChangeClient email={params.email || null} token={params.token || null} />
}

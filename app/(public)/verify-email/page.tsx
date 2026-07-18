import VerifyEmailClient from '@/app/components/VerifyEmailClient'

export const dynamic = 'force-dynamic'

// Cible du verifyLink construit par app/api/auth/register/route.ts
// (?email=&token=), consommé par POST /api/auth/verify-email.
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; token?: string }>
}) {
  const params = await searchParams
  return <VerifyEmailClient email={params.email || null} token={params.token || null} />
}

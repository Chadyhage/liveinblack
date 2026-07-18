import ResetPasswordClient from '@/app/components/ResetPasswordClient'

export const dynamic = 'force-dynamic'

// Cible du resetLink construit par app/api/auth/request-password-reset/route.ts
// (?email=&token=), consommé par POST /api/auth/reset-password.
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; token?: string }>
}) {
  const params = await searchParams
  return <ResetPasswordClient email={params.email || null} token={params.token || null} />
}

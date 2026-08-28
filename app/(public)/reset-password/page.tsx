import AuthSplitLayout from '../_components/AuthSplitLayout'
import ResetPasswordClient from '@/app/components/features/auth/ResetPasswordClient'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Réinitialiser mon mot de passe — LIVEINBLACK', robots: { index: false, follow: false } }

export const dynamic = 'force-dynamic'

// Cible du resetLink construit par app/api/auth/request-password-reset/route.ts
// (?email=&token=), consommé par POST /api/auth/reset-password.
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; token?: string }>
}) {
  const params = await searchParams
  return (
    <AuthSplitLayout heroImage="/images/live-in-black/auth/auth-reset-secure-email.png">
      <ResetPasswordClient email={params.email || null} token={params.token || null} />
    </AuthSplitLayout>
  )
}

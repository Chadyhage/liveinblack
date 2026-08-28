import AuthSplitLayout from '../_components/AuthSplitLayout'
import VerifyEmailClient from '@/app/components/features/auth/VerifyEmailClient'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Vérifier mon e-mail — LIVEINBLACK', robots: { index: false, follow: false } }

export const dynamic = 'force-dynamic'

// Cible du verifyLink construit par app/api/auth/register/route.ts
// (?email=&token=), consommé par POST /api/auth/verify-email.
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; token?: string }>
}) {
  const params = await searchParams
  return (
    <AuthSplitLayout heroImage="/images/live-in-black/auth/auth-verify-email-lounge.png">
      <VerifyEmailClient email={params.email || null} token={params.token || null} />
    </AuthSplitLayout>
  )
}

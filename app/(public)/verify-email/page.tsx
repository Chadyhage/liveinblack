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
    <AuthSplitLayout heroImage="https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1200&q=80">
      <VerifyEmailClient email={params.email || null} token={params.token || null} />
    </AuthSplitLayout>
  )
}

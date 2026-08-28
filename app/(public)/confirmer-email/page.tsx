import AuthSplitLayout from '../_components/AuthSplitLayout'
import ConfirmEmailChangeClient from '@/app/components/features/auth/ConfirmEmailChangeClient'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Confirmer ma nouvelle adresse e-mail — LIVEINBLACK', robots: { index: false, follow: false } }

export const dynamic = 'force-dynamic'

// Cible du verifyLink construit par lib/server/profile.ts:requestEmailChange
// (?email=&token=), consommé par POST /api/profil/confirmer-email.
export default async function ConfirmEmailChangePage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; token?: string }>
}) {
  const params = await searchParams
  return (
    <AuthSplitLayout heroImage="/images/live-in-black/auth/auth-confirm-email-devices.png">
      <ConfirmEmailChangeClient email={params.email || null} token={params.token || null} />
    </AuthSplitLayout>
  )
}

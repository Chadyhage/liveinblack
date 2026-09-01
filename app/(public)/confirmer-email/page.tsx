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
    <AuthSplitLayout heroImage="https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?auto=format&fit=crop&w=1200&q=80">
      <ConfirmEmailChangeClient email={params.email || null} token={params.token || null} />
    </AuthSplitLayout>
  )
}

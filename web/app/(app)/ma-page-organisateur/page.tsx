import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { getOrCreateMyOrganizerProfile } from '@/lib/server/organizerProfile'
import { getPayoutStatus } from '@/lib/server/organizerPayouts'
import { listPayoutMomos } from '@/lib/server/organizerPayoutMomos'
import StudioClient from './StudioClient'

// Port de OrganizerPublicStudio.jsx (#7 phase organisateur, tâche #81) — page
// publique de l'organisateur ("Ma page publique") + panneaux d'encaissement
// (Stripe Connect, numéros Mobile Money — legacy: PayoutPanel.jsx +
// MomoPayoutManager.jsx, ici regroupés sur CETTE page plutôt que sur
// /profil, qui n'a délibérément aucune section "Encaissement", cf.
// lib/server/profile.ts).
export const metadata: Metadata = {
  title: 'Ma page publique — LIVEINBLACK',
  robots: { index: false, follow: false },
}

export default async function MaPageOrganisateurPage() {
  const session = await auth()
  if (!session?.user) redirect('/connexion')
  if (session.user.activeRole !== 'organisateur' && session.user.activeRole !== 'agent') redirect('/mes-evenements')

  const caller = { id: session.user.id }
  const [profileResult, payoutStatusResult, momosResult] = await Promise.all([
    getOrCreateMyOrganizerProfile(caller),
    getPayoutStatus(caller),
    listPayoutMomos(caller),
  ])

  if (!profileResult.ok) redirect('/mes-evenements')

  return (
    <StudioClient
      initialProfile={profileResult.profile}
      initialPayoutStatus={payoutStatusResult.ok ? payoutStatusResult.view : { mode: 'none', connected: false, chargesEnabled: false, country: null, amountDueCents: 0, amountDueXOF: 0 }}
      initialMomos={momosResult.ok ? momosResult.momos : {}}
    />
  )
}

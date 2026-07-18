import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { getOrCreateMyProviderProfile } from '@/lib/server/providerProfile'
import { getMySubscriptionOverview } from '@/lib/server/providerSubscriptions'
import { getMyProviderReviews } from '@/lib/server/providerReviews'
import ProposerServicesClient from './ProposerServicesClient'

// Port de ProposerServicesPage.jsx (#8 phase prestataire, tâche #91) — "Mon
// espace prestataire" : page publique (profil + catalogue) + bannière
// d'abonnement (rail EUR/Stripe ou XOF/FedaPay selon le pays de facturation).
// Contrairement au legacy (fetch client-side de la facturation après montage,
// avec un état "chargement..."), tout est résolu côté serveur avant le
// premier rendu — aucun flash de chargement.
export const metadata: Metadata = {
  title: 'Mon espace prestataire — LIVEINBLACK',
  robots: { index: false, follow: false },
}

function requireProviderRole(roles: string[] | undefined) {
  return Boolean(roles?.includes('prestataire'))
}

export default async function ProposerServicesPage() {
  const session = await auth()
  if (!session?.user) redirect('/connexion')
  if (!requireProviderRole(session.user.roles)) redirect('/prestataires')

  const caller = { id: session.user.id }
  const [profileResult, subscription, reviews] = await Promise.all([
    getOrCreateMyProviderProfile(caller),
    getMySubscriptionOverview(caller),
    getMyProviderReviews(caller),
  ])

  if (!profileResult.ok) redirect('/prestataires')

  return <ProposerServicesClient initialProfile={profileResult.profile} initialSubscription={subscription} initialReviews={reviews} />
}

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { canProposeServices } from '@/lib/server/permissions'
import { getOrCreateMyProviderProfile } from '@/lib/server/provider/providerProfile'
import { getMySubscriptionOverview } from '@/lib/server/provider/providerSubscriptions'
import { getMyProviderReviews } from '@/lib/server/provider/providerReviews'
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

export default async function ProposerServicesPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  // canProposeServices bloque uniquement prestStatus==='rejected' — un
  // dossier encore 'pending' garde l'accès à son espace pendant la review
  // (décision produit confirmée, voir lib/server/__tests__/permissions.test.ts
  // "autorise prestataire non rejeté (y compris en attente)").
  if (!canProposeServices(session.user)) redirect('/providers')

  const caller = { id: session.user.id }
  const [profileResult, subscription, reviews] = await Promise.all([
    getOrCreateMyProviderProfile(caller),
    getMySubscriptionOverview(caller),
    getMyProviderReviews(caller),
  ])

  if (!profileResult.ok) redirect('/providers')

  return <ProposerServicesClient initialProfile={profileResult.profile} initialSubscription={subscription} initialReviews={reviews} />
}

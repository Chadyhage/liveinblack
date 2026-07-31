import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { getOrCreateMyProviderProfile } from '@/lib/server/providerProfile'
import { getMySubscriptionOverview } from '@/lib/server/providerSubscriptions'
import { canProposeServices } from '@/lib/server/permissions'
import MonAbonnementClient from './MonAbonnementClient'

// Port de MonAbonnementPage.jsx (#8 phase prestataire, tâche #113). Le
// legacy expose cette vue de détail (statut, jours restants, historique des
// paiements) sur sa propre route, atteinte depuis un bouton « Gérer mon
// abonnement » de ProposerServicesPage.jsx. /proposer-services (#91) a porté
// une bannière condensée de ce même statut mais pas cette vue détaillée
// séparée — on la construit ici en réutilisant les MÊMES fonctions serveur
// et la même logique pure (lib/shared/providerSubscription.ts) que le
// dashboard, sans dupliquer aucun calcul.
//
// L'historique est alimenté exclusivement par les webhooks confirmés Stripe
// et FedaPay, puis filtré par l'identité de la session côté serveur.
export const metadata: Metadata = {
  title: 'Mon abonnement — LIVEINBLACK',
  robots: { index: false, follow: false },
}

export default async function MonAbonnementPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  // Même garde que /offer-services (canProposeServices) — vérifie
  // activeRole+prestStatus, jamais roles[] brut (CLAUDE.md : un compte
  // multi-rôles peut porter 'prestataire' dans roles[] sans que ce soit son
  // rôle actif, et un dossier rejeté doit rester bloqué même si le rôle est
  // toujours listé).
  if (!canProposeServices(session.user)) redirect('/providers')

  const caller = { id: session.user.id }
  const [profileResult, subscription] = await Promise.all([getOrCreateMyProviderProfile(caller), getMySubscriptionOverview(caller)])

  if (!profileResult.ok) redirect('/providers')

  return <MonAbonnementClient profile={profileResult.profile} subscription={subscription} />
}

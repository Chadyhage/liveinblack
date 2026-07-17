import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { listMyFollowedOrganizers } from '@/lib/server/organizerFollows'
import { listPublicOrganizers } from '@/lib/server/organizers'
import FollowedOrganizersClient from './FollowedOrganizersClient'

// Port de src/pages/FollowedOrganizersPage.jsx (#6 phase profil). Server
// Component : charge la liste des abonnements + jusqu'à 3 suggestions
// (organisateurs publics non suivis, triés par nombre d'abonnés — même
// requête que la page annuaire) via un accès base direct.
export const metadata: Metadata = {
  title: 'Organisateurs suivis — LIVEINBLACK',
  robots: { index: false, follow: false },
}

const MAX_SUGGESTIONS = 3

export default async function FollowedOrganizersPage() {
  const session = await auth()
  if (!session?.user) redirect('/connexion')

  const [followResult, allPublic] = await Promise.all([listMyFollowedOrganizers({ id: session.user.id }), listPublicOrganizers()])

  const follows = followResult.ok ? followResult.follows : []
  const followedIds = new Set(follows.map((f) => f.organizerId))
  const suggestions = allPublic
    .filter((o) => o.userId !== session.user.id && !followedIds.has(o.userId))
    .slice(0, MAX_SUGGESTIONS)
    .map((o) => ({ organizerId: o.userId, name: o.publicName, slug: o.slug, city: o.city || null, country: o.country || null }))

  return <FollowedOrganizersClient initialFollows={follows} suggestions={suggestions} />
}

import type { Metadata } from 'next'
import { redirect, notFound } from 'next/navigation'
import { auth } from '@/auth'
import { getEventStats } from '@/lib/server/eventStats'
import StatistiquesClient from './StatistiquesClient'

// Port de StatsPanel (MesEvenementsPage.jsx lignes 3886-4003) — devenu une
// vraie route Next.js plutôt qu'un panneau plein écran monté depuis le
// tableau de bord (le bouton "Statistiques" y fait un `<Link>` classique
// vers cette page). Contrairement au StatsPanel legacy (lecture
// localStorage `lib_bookings`, désynchronisée des achats cross-device —
// signalé par le research comme une incohérence avec BookingsPanel), cette
// page réutilise directement lib/server/eventStats.ts (#7 tâche #72), déjà
// branché sur le registre `Ticket` canonique.
export const metadata: Metadata = {
  title: 'Statistiques — LIVEINBLACK',
  robots: { index: false, follow: false },
}

export default async function EventStatisticsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) redirect('/connexion')

  const { id } = await params
  const result = await getEventStats({ id: session.user.id, roles: session.user.roles }, id)
  if (!result.ok) {
    if (result.error === 'event_not_found') notFound()
    redirect('/mes-evenements')
  }

  return <StatistiquesClient eventId={id} initialView={result.view} />
}

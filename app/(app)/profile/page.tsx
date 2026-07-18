import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { getMyProfile } from '@/lib/server/profile'
import { listMyTickets } from '@/lib/server/tickets'
import ProfilClient from './ProfilClient'

// Server Component : charge le profil complet + le portefeuille de billets
// via un accès base direct — même convention que app/(app)/messages/page.tsx.
// Le composant client, lui, ne parle qu'aux routes /api/profil/* pour toute
// mutation ultérieure.
export const metadata: Metadata = {
  title: 'Profil — LIVEINBLACK',
  robots: { index: false, follow: false },
}

export default async function ProfilPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const caller = { id: session.user.id }
  const [profile, ticketsResult] = await Promise.all([getMyProfile(caller), listMyTickets(caller.id)])

  if (!profile) redirect('/login')

  return <ProfilClient initialUser={profile} initialTicketGroups={ticketsResult.ok ? ticketsResult.groups : []} />
}

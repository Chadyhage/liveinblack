import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { listMyTickets } from '@/lib/server/events/tickets'
import { listParticipantRefundCases } from '@/lib/server/refunds/refundCases'
import BilletsClient from './BilletsClient'

// Ancien panneau interne "Mes billets" de ProfilClient.tsx (état local
// `panel==='billets'`, #6 phase profil) — maintenant une vraie route,
// accessible via le sous-menu "Mon profil" de la sidebar (dashboardNav.ts).
export const metadata: Metadata = {
  title: 'Mes billets — LIVEINBLACK',
  robots: { index: false, follow: false },
}

export default async function BilletsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const caller = { id: session.user.id }
  const ticketsResult = await listMyTickets(caller.id)
  const refunds = await listParticipantRefundCases(caller.id)

  return <BilletsClient groups={ticketsResult.ok ? ticketsResult.groups : []} currentUserId={caller.id} initialRefunds={refunds} />
}

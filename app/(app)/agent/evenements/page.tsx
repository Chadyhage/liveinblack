import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { requireAgent } from '@/lib/server/agentGuard'
import AgentEventsClient from '@/app/components/AgentEventsClient'

// Voir app/(app)/agent/page.tsx pour le contexte du découpage en routes réelles.
export const metadata: Metadata = {
  title: 'Événements — Agent — LIVEINBLACK',
  robots: { index: false, follow: false },
}

export default async function AgentEvenementsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!requireAgent(session.user)) redirect('/')

  return <AgentEventsClient />
}

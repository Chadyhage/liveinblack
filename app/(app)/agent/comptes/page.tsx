import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { requireAgent } from '@/lib/server/agent/agentGuard'
import AgentUsersClient from '@/app/components/features/agent/AgentUsersClient'

// Voir app/(app)/agent/page.tsx pour le contexte du découpage en routes réelles.
export const metadata: Metadata = {
  title: 'Comptes — Agent — LIVEINBLACK',
  robots: { index: false, follow: false },
}

export default async function AgentComptesPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!requireAgent(session.user)) redirect('/')

  return <AgentUsersClient />
}

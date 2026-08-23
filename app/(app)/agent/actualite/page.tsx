import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { requireAgent } from '@/lib/server/agent/agentGuard'
import AgentHomepageConfigClient from '@/app/components/features/agent/AgentHomepageConfigClient'

// Voir app/(app)/agent/page.tsx pour le contexte du découpage en routes réelles.
export const metadata: Metadata = {
  title: 'Actualité — Agent — LIVEINBLACK',
  robots: { index: false, follow: false },
}

export default async function AgentActualitePage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!requireAgent(session.user)) redirect('/')

  return <AgentHomepageConfigClient />
}

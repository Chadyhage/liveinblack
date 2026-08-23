import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { requireAgent } from '@/lib/server/agent/agentGuard'
import AgentBlogClient from '@/app/components/features/agent/AgentBlogClient'

// Voir app/(app)/agent/page.tsx pour le contexte du découpage en routes réelles.
// Nouvelle section (pas de port legacy) : lib/models/BlogPost.ts + les pages
// publiques app/(public)/blog/ existaient déjà mais aucune UI ne permettait
// de créer/modifier/supprimer un article — comblement de lacune identifié
// lors de l'audit "gérer l'intégralité de la plateforme" (#admin).
export const metadata: Metadata = {
  title: 'Blog — Agent — LIVEINBLACK',
  robots: { index: false, follow: false },
}

export default async function AgentBlogPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!requireAgent(session.user)) redirect('/')

  return <AgentBlogClient />
}

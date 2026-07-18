import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { requireAgent } from '@/lib/server/agentGuard'
import AgentDossiersClient from '@/app/components/AgentDossiersClient'

// Port de la partie « Dossiers » de src/pages/AgentPage.jsx (#9 phase
// agent/admin). `proxy.ts` bloque déjà /agent/:path* aux non-agents côté
// middleware — cette page revérifie côté serveur (même défense en profondeur
// que partout ailleurs dans ce port, voir lib/server/agentGuard.ts).
//
// Le reste du panneau agent (dashboard, users, events, reversements…, #98-107)
// n'existe pas encore : cette page affiche directement le panneau Dossiers en
// pleine page plutôt que la coquille à onglets legacy, qui arrivera avec la
// tâche #107 une fois tous les panneaux construits.
export const metadata: Metadata = {
  title: 'Agent — LIVEINBLACK',
  robots: { index: false, follow: false },
}

export default async function AgentPage() {
  const session = await auth()
  if (!session?.user) redirect('/connexion')
  if (!requireAgent(session.user)) redirect('/')

  return <AgentDossiersClient />
}

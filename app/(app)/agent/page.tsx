import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { requireAgent } from '@/lib/server/agentGuard'
import AgentShell from '@/app/components/AgentShell'

// Port de src/pages/AgentPage.jsx (#9 phase agent/admin). `proxy.ts` bloque
// déjà /agent/:path* aux non-agents côté middleware — cette page revérifie
// côté serveur (même défense en profondeur que partout ailleurs dans ce
// port, voir lib/server/agentGuard.ts).
//
// Coquille à onglets (#107) assemblant tous les panneaux agent construits
// séparément (#97-106) — voir app/components/AgentShell.tsx pour le mapping
// des onglets et les écarts volontaires avec la nav legacy.
export const metadata: Metadata = {
  title: 'Agent — LIVEINBLACK',
  robots: { index: false, follow: false },
}

export default async function AgentPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!requireAgent(session.user)) redirect('/')

  return <AgentShell />
}

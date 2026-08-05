import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { requireAgent } from '@/lib/server/agentGuard'
import AgentDashboardClient from '@/app/components/AgentDashboardClient'

// Port de src/pages/AgentPage.jsx (#9 phase agent/admin). `proxy.ts` bloque
// déjà /agent/:path* aux non-agents côté middleware — cette page revérifie
// côté serveur (même défense en profondeur que partout ailleurs dans ce
// port, voir lib/server/agentGuard.ts).
//
// Route "Tableau de bord" (index) — les 9 autres sections agent vivent
// maintenant chacune sous sa propre route réelle (app/(app)/agent/<section>/
// page.tsx), plus de coquille à onglets partagée par query param (voir
// dashboardNav.ts, ROLE_NAV.agent).
export const metadata: Metadata = {
  title: 'Agent — LIVEINBLACK',
  robots: { index: false, follow: false },
}

export default async function AgentPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!requireAgent(session.user)) redirect('/')

  return <AgentDashboardClient />
}

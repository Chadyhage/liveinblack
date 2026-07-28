'use client'

import { useSearchParams } from 'next/navigation'
import AgentDossiersClient from '@/app/components/AgentDossiersClient'
import AgentDashboardClient from '@/app/components/AgentDashboardClient'
import AgentUsersClient from '@/app/components/AgentUsersClient'
import AgentEventsClient from '@/app/components/AgentEventsClient'
import AgentBoostsClient from '@/app/components/AgentBoostsClient'
import AgentPaymentsClient from '@/app/components/AgentPaymentsClient'
import AgentDeletionClient from '@/app/components/AgentDeletionClient'
import AgentReportsClient from '@/app/components/AgentReportsClient'
import AgentReviewsClient from '@/app/components/AgentReviewsClient'
import AgentHomepageConfigClient from '@/app/components/AgentHomepageConfigClient'

// Coquille de src/pages/AgentPage.jsx (#9 phase agent/admin, tâche #107) —
// assemble tous les panneaux construits séparément (#97-106). La navigation
// entre panneaux vit désormais dans la sidebar partagée (voir
// app/(app)/_components/dashboardNav.ts, ROLE_NAV.agent) plutôt que dans une
// barre d'onglets dupliquée ici : chaque lien de sidebar pointe vers
// /agent?tab=X, ce composant lit juste `tab` depuis l'URL. Legacy avait trois
// onglets financiers distincts (reversements/remboursements/paiements) ; la
// tâche #102 les a délibérément regroupés en un seul panneau « Paiements » à
// sous-sections — on suit ce regroupement plutôt que de le défaire ici.

type TabKey = 'dashboard' | 'users' | 'events' | 'dossiers' | 'boosts' | 'payments' | 'deletions' | 'reports' | 'reviews' | 'homepage'

const VALID_TABS = new Set<TabKey>(['dashboard', 'users', 'events', 'dossiers', 'boosts', 'payments', 'deletions', 'reports', 'reviews', 'homepage'])

export default function AgentShell() {
  const searchParams = useSearchParams()
  const requestedTab = searchParams.get('tab') as TabKey | null
  const tab: TabKey = requestedTab && VALID_TABS.has(requestedTab) ? requestedTab : 'dashboard'

  return (
    <div style={{ minHeight: '100vh' }}>
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 40,
          background: 'rgba(4,4,14,0.92)',
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid var(--border)',
          padding: '12px 16px',
        }}
      >
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <h1 className="font-display" style={{ fontSize: 18, fontWeight: 800, color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: 9 }}>
            Administration
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--gold)',
                background: 'rgba(200,169,110,0.12)',
                border: '1px solid rgba(200,169,110,0.35)',
                borderRadius: 999,
                padding: '2px 9px',
              }}
            >
              Agent
            </span>
          </h1>
        </div>
      </div>

      <div key={tab} style={{ paddingTop: 16 }}>
        {tab === 'dashboard' && <AgentDashboardClient />}
        {tab === 'users' && <AgentUsersClient />}
        {tab === 'events' && <AgentEventsClient />}
        {tab === 'dossiers' && <AgentDossiersClient />}
        {tab === 'boosts' && <AgentBoostsClient />}
        {tab === 'payments' && <AgentPaymentsClient />}
        {tab === 'deletions' && <AgentDeletionClient />}
        {tab === 'reports' && <AgentReportsClient />}
        {tab === 'reviews' && <AgentReviewsClient />}
        {tab === 'homepage' && <AgentHomepageConfigClient />}
      </div>
    </div>
  )
}

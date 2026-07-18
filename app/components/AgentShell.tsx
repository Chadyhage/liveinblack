'use client'

import { useEffect, useState } from 'react'
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

// Coquille à onglets de src/pages/AgentPage.jsx (#9 phase agent/admin, tâche
// #107) — assemble tous les panneaux construits séparément (#97-106) derrière
// une nav segmentée client-side, sans rechargement de page. Ordre des onglets
// et libellés copiés du tableau `[{ key, label, count }]` de AgentPage.jsx
// (nav segmentée juste sous la top bar). Legacy avait trois onglets financiers
// distincts (reversements/remboursements/paiements) ; la tâche #102 les a
// délibérément regroupés en un seul panneau « Paiements » à sous-sections —
// on suit ce regroupement plutôt que de le défaire ici.
//
// Les badges de compteur ne sont portés que là où legacy ET le panneau
// correspondant exposent déjà un compte bon marché à récupérer sans dupliquer
// la logique métier d'un panneau tiers : Dossiers (en attente) et
// Signalements (ouverts), comme cité en exemple dans le brief de la tâche.

type TabKey = 'dashboard' | 'users' | 'events' | 'dossiers' | 'boosts' | 'payments' | 'deletions' | 'reports' | 'reviews' | 'homepage'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'dashboard', label: 'Tableau de bord' },
  { key: 'users', label: 'Comptes' },
  { key: 'events', label: 'Événements' },
  { key: 'dossiers', label: 'Dossiers' },
  { key: 'boosts', label: 'Boosts' },
  { key: 'payments', label: 'Paiements' },
  { key: 'deletions', label: 'Suppressions' },
  { key: 'reports', label: 'Signalements' },
  { key: 'reviews', label: 'Avis' },
  { key: 'homepage', label: 'Actualité' },
]

const PENDING_APPLICATION_STATUSES = new Set(['submitted', 'under_review', 'resubmitted'])

export default function AgentShell() {
  const [tab, setTab] = useState<TabKey>('dashboard')
  const [pendingDossiers, setPendingDossiers] = useState(0)
  const [openReports, setOpenReports] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function run() {
      try {
        const res = await fetch('/api/agent/applications')
        const data = await res.json()
        if (!cancelled && res.ok && data.ok) {
          const count = (data.applications as { status: string }[]).filter((a) => PENDING_APPLICATION_STATUSES.has(a.status)).length
          setPendingDossiers(count)
        }
      } catch {
        // Nav badges are a non-critical convenience — un échec silencieux
        // laisse juste le compteur à 0, le panneau Dossiers lui-même
        // affichera son propre bandeau d'erreur de lecture.
      }
    }
    run()
    // Rafraîchi périodiquement (même intervalle que le heartbeat de présence
    // de MessagesClient.tsx) — sans ça, une action de modération faite dans
    // l'onglet Dossiers ne se reflète jamais sur ce badge de nav tant que le
    // shell reste monté.
    const interval = setInterval(run, 15000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function run() {
      try {
        const res = await fetch('/api/agent/reports?status=open')
        const data = await res.json()
        if (!cancelled && res.ok && data.ok) {
          setOpenReports((data.reports as unknown[]).length)
        }
      } catch {
        // idem
      }
    }
    run()
    const interval = setInterval(run, 15000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  const badges: Partial<Record<TabKey, number>> = { dossiers: pendingDossiers, reports: openReports }

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
          <h1 style={{ fontSize: 18, fontWeight: 800, color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: 9 }}>
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

      <div style={{ padding: '12px 16px 0', maxWidth: 760, margin: '0 auto' }}>
        <div
          style={{
            display: 'flex',
            gap: 6,
            padding: 4,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            overflowX: 'auto',
          }}
        >
          {TABS.map((t) => {
            const active = t.key === tab
            const count = badges[t.key] ?? 0
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  flexShrink: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 14px',
                  fontSize: 12.5,
                  fontWeight: 700,
                  letterSpacing: '0.01em',
                  cursor: 'pointer',
                  background: active ? 'rgba(200,169,110,0.16)' : 'transparent',
                  border: active ? '1px solid rgba(200,169,110,0.45)' : '1px solid transparent',
                  borderRadius: 9,
                  color: active ? 'var(--gold)' : 'var(--text-faint)',
                }}
              >
                {t.label}
                {count > 0 && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      lineHeight: 1.4,
                      color: '#fff',
                      background: 'rgba(224,90,170,0.85)',
                      borderRadius: 999,
                      padding: '1px 7px',
                    }}
                  >
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div key={tab}>
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

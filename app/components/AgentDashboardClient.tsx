'use client'

import { useEffect, useState } from 'react'
import { fmtMoney } from '@/lib/shared/money'
import { Button, SkeletonCard } from '@/app/components/ui'
import { DonutChart } from '@/app/components/ui/charts/DonutChart'
import { LineChartCard } from '@/app/components/ui/charts/LineChartCard'

// Port de la section « Métriques business » + « Communauté » de l'onglet
// Tableau de bord de src/pages/AgentPage.jsx (tab === 'dashboard', #101 phase
// agent/admin). Voir lib/server/agentDashboard.ts pour le détail des sources
// et des différences volontaires avec le legacy (billets/GMV recalculés
// depuis Order+Ticket plutôt que depuis des `bookings/{id}` Firestore déjà
// agrégés, fenêtre « en ligne » alignée sur le heartbeat de présence de cette
// migration).
//
// Volontairement absent ici (appartient à d'autres panneaux, #99) :
// « Emails non vérifiés », « Doublons », « Inscriptions récentes » — ces
// sections legacy listent et modifient des comptes individuels, ce qui est
// le terrain de la gestion de comptes agent, pas d'un panneau de stats en
// lecture seule.

interface DashboardStats {
  revenue: {
    platformRevenueEUR: number
    ticketFeeRevenueEUR: number
    ticketFeeRevenueXOF: number
    gmvBoosts: number
    gmvTicketsEUR: number
    gmvTicketsXOF: number
  }
  tickets: { totalSold: number; recentSold30d: number }
  events: { totalPublished: number; upcoming: number }
  community: {
    totalUsers: number
    totalOnline: number
    totalPrestataires: number
    totalOrganisateurs: number
    pendingDossiers: number
    newAccountsThisMonth: number
  }
  signupsLast30Days: { date: string; count: number }[]
  roleBreakdown: { role: 'client' | 'organisateur' | 'prestataire'; count: number }[]
  updatedAt: string
}

const cardStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }
const sectionTitleStyle: React.CSSProperties = { fontSize: 14, fontWeight: 400, textTransform: 'uppercase', letterSpacing: '3.2px', color: 'var(--teal)', fontFamily: 'var(--font-display), sans-serif', margin: '0 0 10px' }

const ROLE_LABEL: Record<DashboardStats['roleBreakdown'][number]['role'], string> = {
  client: 'Client',
  organisateur: 'Organisateur',
  prestataire: 'Prestataire',
}
const ROLE_COLOR: Record<DashboardStats['roleBreakdown'][number]['role'], string> = {
  client: 'var(--teal)',
  organisateur: 'var(--gold)',
  prestataire: '#e05aaa',
}

function fmtDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}

export default function AgentDashboardClient() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  async function load() {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch('/api/agent/dashboard')
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error('load_failed')
      setStats(data.stats)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    async function run() {
      setLoading(true)
      setError(false)
      try {
        const res = await fetch('/api/agent/dashboard')
        const data = await res.json()
        if (!res.ok || !data.ok) throw new Error('load_failed')
        if (!cancelled) setStats(data.stats)
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="lb-dashboard-page">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <h1 className="font-display lb-dashboard-title">Tableau de bord</h1>

        {error && (
          <div style={{ ...cardStyle, border: '1px solid rgba(224,90,170,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Lecture impossible. Recharge la page ; si ça persiste, reconnecte-toi (droits agent).</p>
            <Button variant="secondary" onClick={load} style={{ fontSize: 12.5 }}>
              Recharger
            </Button>
          </div>
        )}

        {loading || !stats ? (
          <div aria-label="Chargement du tableau de bord" className="lb-dashboard-card-grid">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : (
          <>
            <section>
              <p style={sectionTitleStyle}>Métriques business</p>

              <div style={{ ...cardStyle, borderColor: 'rgba(184, 243, 74,0.30)', borderLeft: '3px solid rgba(184, 243, 74,0.6)', marginBottom: 10 }}>
                <p style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(184, 243, 74,0.7)', margin: 0 }}>Revenus plateforme</p>
                <p style={{ fontSize: 42, fontWeight: 300, color: 'var(--gold)', margin: '6px 0 0', lineHeight: 1 }}>{fmtMoney(stats.revenue.platformRevenueEUR, 'EUR')}</p>
                {stats.revenue.ticketFeeRevenueXOF > 0 && (
                  <p style={{ fontSize: 24, fontWeight: 300, color: 'var(--teal)', margin: '6px 0 0', lineHeight: 1 }}>+ {fmtMoney(stats.revenue.ticketFeeRevenueXOF, 'XOF')}</p>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
                  <div>
                    <p style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-faint)', margin: 0 }}>Frais billets</p>
                    <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.78)', margin: '2px 0 0' }}>
                      {fmtMoney(stats.revenue.ticketFeeRevenueEUR, 'EUR')}
                      {stats.revenue.ticketFeeRevenueXOF > 0 ? ` · ${fmtMoney(stats.revenue.ticketFeeRevenueXOF, 'XOF')}` : ''}
                    </p>
                  </div>
                  <div>
                    <p style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-faint)', margin: 0 }}>Boosts (100%)</p>
                    <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.78)', margin: '2px 0 0' }}>{fmtMoney(stats.revenue.gmvBoosts, 'EUR')}</p>
                  </div>
                </div>
              </div>

              <div className="lb-responsive-metrics" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <div style={{ ...cardStyle, padding: 12 }}>
                  <p style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-faint)', margin: 0 }}>Volume encaissé</p>
                  <p style={{ fontSize: 22, fontWeight: 300, color: '#fff', margin: '3px 0 0', lineHeight: 1 }}>{fmtMoney(stats.revenue.gmvTicketsEUR + stats.revenue.gmvBoosts, 'EUR')}</p>
                  {stats.revenue.gmvTicketsXOF > 0 && (
                    <p style={{ fontSize: 15, fontWeight: 300, color: 'var(--teal)', margin: '3px 0 0', lineHeight: 1 }}>+ {fmtMoney(stats.revenue.gmvTicketsXOF, 'XOF')}</p>
                  )}
                  <p style={{ fontSize: 10, color: 'var(--text-faint)', margin: '3px 0 0' }}>Ventes en ligne (webhooks)</p>
                </div>
                <div style={{ ...cardStyle, padding: 12 }}>
                  <p style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-faint)', margin: 0 }}>Billets payés</p>
                  <p style={{ fontSize: 22, fontWeight: 300, color: 'var(--teal)', margin: '3px 0 0', lineHeight: 1 }}>{stats.tickets.totalSold}</p>
                  <p style={{ fontSize: 10, color: 'var(--text-faint)', margin: '3px 0 0' }}>
                    {stats.tickets.recentSold30d} vente{stats.tickets.recentSold30d !== 1 ? 's' : ''} ces 30j
                  </p>
                </div>
                <div style={{ ...cardStyle, padding: 12 }}>
                  <p style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-faint)', margin: 0 }}>Events publiés</p>
                  <p style={{ fontSize: 22, fontWeight: 300, color: '#fff', margin: '3px 0 0', lineHeight: 1 }}>{stats.events.totalPublished}</p>
                  <p style={{ fontSize: 10, color: 'var(--text-faint)', margin: '3px 0 0' }}>{stats.events.upcoming} à venir</p>
                </div>
              </div>
            </section>

            <section>
              <p style={sectionTitleStyle}>Communauté</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { label: `Comptes total${stats.community.newAccountsThisMonth > 0 ? ` · +${stats.community.newAccountsThisMonth} ce mois` : ''}`, value: stats.community.totalUsers, color: 'var(--teal)' },
                  { label: 'Connectés', value: stats.community.totalOnline, color: 'var(--teal)' },
                  { label: 'Prestataires', value: stats.community.totalPrestataires, color: 'var(--gold)' },
                  {
                    label: 'En attente',
                    value: stats.community.pendingDossiers,
                    color: stats.community.pendingDossiers > 0 ? '#e05aaa' : 'var(--text-muted)',
                    alert: stats.community.pendingDossiers > 0,
                  },
                ].map((s) => (
                  <div key={s.label} style={{ ...cardStyle, padding: 16, borderColor: s.alert ? '#e05aaa55' : 'var(--border)' }}>
                    <p style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>{s.label}</p>
                    <p style={{ fontSize: 38, fontWeight: 300, color: s.color, margin: 0, lineHeight: 1 }}>{s.value}</p>
                  </div>
                ))}
              </div>
            </section>

            <section style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
                <p style={{ ...sectionTitleStyle, margin: 0 }}>Nouveaux comptes — 30 derniers jours</p>
                <p style={{ fontSize: 10, color: 'var(--teal)', margin: 0 }}>+{stats.community.newAccountsThisMonth}</p>
              </div>
              <LineChartCard data={stats.signupsLast30Days.map((d) => ({ date: d.date, value: d.count }))} formatDate={fmtDay} />
            </section>

            <section style={cardStyle}>
              <p style={{ ...sectionTitleStyle, marginBottom: 14 }}>Répartition par rôle</p>
              <DonutChart
                data={stats.roleBreakdown.map((r) => ({ label: ROLE_LABEL[r.role], value: r.count, color: ROLE_COLOR[r.role] }))}
              />
            </section>
          </>
        )}
      </div>
    </main>
  )
}

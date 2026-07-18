'use client'

import { useEffect, useState } from 'react'
import { fmtMoney } from '@/lib/shared/money'

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
const sectionTitleStyle: React.CSSProperties = { fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-faint)', margin: '0 0 10px' }

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
    <main style={{ minHeight: '100vh', padding: '32px 16px 80px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <h1 style={{ font: '800 24px Inter, sans-serif', color: '#fff', margin: 0 }}>Tableau de bord</h1>

        {error && (
          <div style={{ ...cardStyle, border: '1px solid rgba(224,90,170,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Lecture impossible. Recharge la page ; si ça persiste, reconnecte-toi (droits agent).</p>
            <button onClick={load} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'transparent', color: '#fff', cursor: 'pointer', fontSize: 12.5 }}>
              Recharger
            </button>
          </div>
        )}

        {loading || !stats ? (
          <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Chargement…</p>
        ) : (
          <>
            <section>
              <p style={sectionTitleStyle}>Métriques business</p>

              <div style={{ ...cardStyle, borderColor: 'rgba(200,169,110,0.30)', borderLeft: '3px solid rgba(200,169,110,0.6)', marginBottom: 10 }}>
                <p style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(200,169,110,0.7)', margin: 0 }}>Revenus plateforme</p>
                <p style={{ font: '300 42px Inter, sans-serif', color: 'var(--gold)', margin: '6px 0 0', lineHeight: 1 }}>{fmtMoney(stats.revenue.platformRevenueEUR, 'EUR')}</p>
                {stats.revenue.ticketFeeRevenueXOF > 0 && (
                  <p style={{ font: '300 24px Inter, sans-serif', color: 'var(--teal)', margin: '6px 0 0', lineHeight: 1 }}>+ {fmtMoney(stats.revenue.ticketFeeRevenueXOF, 'XOF')}</p>
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <div style={{ ...cardStyle, padding: 12 }}>
                  <p style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-faint)', margin: 0 }}>Volume encaissé</p>
                  <p style={{ font: '300 22px Inter, sans-serif', color: '#fff', margin: '3px 0 0', lineHeight: 1 }}>{fmtMoney(stats.revenue.gmvTicketsEUR + stats.revenue.gmvBoosts, 'EUR')}</p>
                  {stats.revenue.gmvTicketsXOF > 0 && (
                    <p style={{ font: '300 15px Inter, sans-serif', color: 'var(--teal)', margin: '3px 0 0', lineHeight: 1 }}>+ {fmtMoney(stats.revenue.gmvTicketsXOF, 'XOF')}</p>
                  )}
                  <p style={{ fontSize: 10, color: 'var(--text-faint)', margin: '3px 0 0' }}>Ventes en ligne (webhooks)</p>
                </div>
                <div style={{ ...cardStyle, padding: 12 }}>
                  <p style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-faint)', margin: 0 }}>Billets payés</p>
                  <p style={{ font: '300 22px Inter, sans-serif', color: 'var(--teal)', margin: '3px 0 0', lineHeight: 1 }}>{stats.tickets.totalSold}</p>
                  <p style={{ fontSize: 10, color: 'var(--text-faint)', margin: '3px 0 0' }}>
                    {stats.tickets.recentSold30d} vente{stats.tickets.recentSold30d !== 1 ? 's' : ''} ces 30j
                  </p>
                </div>
                <div style={{ ...cardStyle, padding: 12 }}>
                  <p style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-faint)', margin: 0 }}>Events publiés</p>
                  <p style={{ font: '300 22px Inter, sans-serif', color: '#fff', margin: '3px 0 0', lineHeight: 1 }}>{stats.events.totalPublished}</p>
                  <p style={{ fontSize: 10, color: 'var(--text-faint)', margin: '3px 0 0' }}>{stats.events.upcoming} à venir</p>
                </div>
              </div>
            </section>

            <section>
              <p style={sectionTitleStyle}>Communauté</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { label: `Comptes total${stats.community.newAccountsThisMonth > 0 ? ` · +${stats.community.newAccountsThisMonth} ce mois` : ''}`, value: stats.community.totalUsers, color: 'var(--teal)' },
                  { label: 'Connectés', value: stats.community.totalOnline, color: '#22c55e' },
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
                    <p style={{ font: '300 38px Inter, sans-serif', color: s.color, margin: 0, lineHeight: 1 }}>{s.value}</p>
                  </div>
                ))}
              </div>
            </section>

            <section style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
                <p style={{ ...sectionTitleStyle, margin: 0 }}>Nouveaux comptes — 30 derniers jours</p>
                <p style={{ fontSize: 10, color: 'var(--teal)', margin: 0 }}>+{stats.community.newAccountsThisMonth}</p>
              </div>
              <SignupBars days={stats.signupsLast30Days} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <span style={{ fontSize: 10, color: 'var(--text-faint)', letterSpacing: '0.06em' }}>J-30</span>
                <span style={{ fontSize: 10, color: 'var(--text-faint)', letterSpacing: '0.06em' }}>AUJOURD&apos;HUI</span>
              </div>
            </section>

            <section>
              <p style={sectionTitleStyle}>Répartition par rôle</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {stats.roleBreakdown.map((r) => (
                  <div key={r.role} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 80, flexShrink: 0 }}>{ROLE_LABEL[r.role]}</span>
                    <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 99, height: 4, overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          borderRadius: 99,
                          width: stats.community.totalUsers ? `${(r.count / stats.community.totalUsers) * 100}%` : '0%',
                          background: ROLE_COLOR[r.role],
                        }}
                      />
                    </div>
                    <span style={{ fontSize: 10, color: '#fff', width: 16, textAlign: 'right' }}>{r.count}</span>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  )
}

function SignupBars({ days }: { days: { date: string; count: number }[] }) {
  const max = Math.max(...days.map((d) => d.count), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 60, marginBottom: 6 }}>
      {days.map((d) => {
        const h = (d.count / max) * 100
        return (
          <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            <div
              title={`${d.count} compte${d.count > 1 ? 's' : ''} le ${fmtDay(d.date)}`}
              style={{
                width: '100%',
                minHeight: 2,
                height: `${Math.max(h, 4)}%`,
                background: d.count > 0 ? 'linear-gradient(180deg, rgba(78,232,200,0.85) 0%, rgba(78,232,200,0.30) 100%)' : 'rgba(255,255,255,0.04)',
                borderRadius: 1,
                transition: 'height 0.4s',
              }}
            />
          </div>
        )
      })}
    </div>
  )
}

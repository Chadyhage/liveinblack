'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Activity, ArrowUpRight, CalendarCheck2, FileCheck2, ShieldAlert, TicketCheck, TrendingUp, UsersRound, WalletCards } from 'lucide-react'
import { fmtMoney } from '@/lib/shared/money'
import { Button, Card, SkeletonCard } from '@/app/components/ui'
import { DonutChart } from '@/app/components/ui/charts/DonutChart'
import { LineChartCard } from '@/app/components/ui/charts/LineChartCard'
import styles from './AgentDashboardClient.module.css'

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
    <main className="lb-dashboard-page lb-agent-screen lb-agent-screen--overview">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {error && (
          <Card accent="rgba(224,90,170,0.35)" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Lecture impossible. Recharge la page ; si ça persiste, reconnecte-toi (droits agent).</p>
            <Button variant="secondary" onClick={load} style={{ fontSize: 12.5 }}>
              Recharger
            </Button>
          </Card>
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
            <section className={styles.prioritySection} aria-labelledby="priority-title">
              <div className={styles.sectionHeading}>
                <div><span className={styles.sectionIndex}>01</span><h2 id="priority-title">À traiter maintenant</h2></div>
                <p>Les accès les plus utiles pour votre prochain geste.</p>
              </div>
              <div className={styles.actionGrid}>
                <Link href="/agent/dossiers" className={`${styles.action} ${styles.actionPrimary}`}>
                  <span className={styles.actionIcon}><FileCheck2 size={22} aria-hidden="true" /></span>
                  <span className={styles.actionBody}><strong>{stats.community.pendingDossiers}</strong><span>Dossiers en attente</span><small>Vérifier les profils et statuer</small></span>
                  <ArrowUpRight size={19} aria-hidden="true" />
                </Link>
                <Link href="/agent/signalements" className={styles.action}>
                  <span className={styles.actionIcon}><ShieldAlert size={22} aria-hidden="true" /></span>
                  <span className={styles.actionBody}><strong>Confiance</strong><span>File de modération</span><small>Qualifier les alertes ouvertes</small></span>
                  <ArrowUpRight size={19} aria-hidden="true" />
                </Link>
                <Link href="/agent/paiements" className={styles.action}>
                  <span className={styles.actionIcon}><WalletCards size={22} aria-hidden="true" /></span>
                  <span className={styles.actionBody}><strong>{fmtMoney(stats.revenue.platformRevenueEUR, 'EUR')}</strong><span>Contrôle financier</span><small>Suivre les flux et les commissions</small></span>
                  <ArrowUpRight size={19} aria-hidden="true" />
                </Link>
                <Link href="/agent/evenements" className={styles.action}>
                  <span className={styles.actionIcon}><CalendarCheck2 size={22} aria-hidden="true" /></span>
                  <span className={styles.actionBody}><strong>{stats.events.upcoming}</strong><span>Événements à venir</span><small>Superviser le catalogue publié</small></span>
                  <ArrowUpRight size={19} aria-hidden="true" />
                </Link>
              </div>
            </section>

            <section className={styles.pulseSection} aria-labelledby="pulse-title">
              <div className={styles.sectionHeading}>
                <div><span className={styles.sectionIndex}>02</span><h2 id="pulse-title">Pouls du jour</h2></div>
                <p>Les signaux essentiels, sans bruit.</p>
              </div>
              <div className={styles.pulseRail}>
                <div className={styles.pulseItem}><span className={styles.pulseIcon}><Activity size={19} /></span><div><strong>{stats.community.totalOnline}</strong><span>en ligne maintenant</span></div></div>
                <div className={styles.pulseItem}><span className={styles.pulseIcon}><TicketCheck size={19} /></span><div><strong>{stats.tickets.recentSold30d}</strong><span>billets sur 30 jours</span></div></div>
                <div className={styles.pulseItem}><span className={styles.pulseIcon}><CalendarCheck2 size={19} /></span><div><strong>{stats.events.upcoming}</strong><span>événements à venir</span></div></div>
                <div className={styles.pulseItem}><span className={styles.pulseIcon}><UsersRound size={19} /></span><div><strong>+{stats.community.newAccountsThisMonth}</strong><span>nouveaux comptes</span></div></div>
              </div>
            </section>

            <section className={styles.overviewSection} aria-labelledby="overview-title">
              <div className={styles.sectionHeading}>
                <div><span className={styles.sectionIndex}>03</span><h2 id="overview-title">Vue stratégique</h2></div>
                <p>Revenus, activité et composition de l’écosystème.</p>
              </div>
              <div className={styles.bentoGrid}>
                <Card className={styles.revenueCard}>
                  <div className={styles.cardTop}><span>Revenu plateforme</span><TrendingUp size={20} /></div>
                  <strong className={styles.heroValue}>{fmtMoney(stats.revenue.platformRevenueEUR, 'EUR')}</strong>
                  {stats.revenue.ticketFeeRevenueXOF > 0 ? <span className={styles.secondaryValue}>+ {fmtMoney(stats.revenue.ticketFeeRevenueXOF, 'XOF')}</span> : null}
                  <div className={styles.revenueBreakdown}>
                    <div><span>Frais de billetterie</span><strong>{fmtMoney(stats.revenue.ticketFeeRevenueEUR, 'EUR')}</strong></div>
                    <div><span>Boosts</span><strong>{fmtMoney(stats.revenue.gmvBoosts, 'EUR')}</strong></div>
                  </div>
                </Card>

                <Card className={styles.volumeCard}>
                  <div className={styles.cardTop}><span>Volume commercial</span><WalletCards size={20} /></div>
                  <strong className={styles.largeValue}>{fmtMoney(stats.revenue.gmvTicketsEUR + stats.revenue.gmvBoosts, 'EUR')}</strong>
                  {stats.revenue.gmvTicketsXOF > 0 ? <span className={styles.secondaryValue}>+ {fmtMoney(stats.revenue.gmvTicketsXOF, 'XOF')}</span> : null}
                  <div className={styles.compactStat}><span>Billets payés</span><strong>{stats.tickets.totalSold}</strong></div>
                </Card>

                <Card className={styles.ecosystemCard}>
                  <div className={styles.cardTop}><span>Écosystème</span><UsersRound size={20} /></div>
                  <div className={styles.ecosystemTotal}><strong>{stats.community.totalUsers}</strong><span>comptes actifs dans la plateforme</span></div>
                  <div className={styles.roleRows}>
                    <div><span>Prestataires</span><strong>{stats.community.totalPrestataires}</strong></div>
                    <div><span>Organisateurs</span><strong>{stats.community.totalOrganisateurs}</strong></div>
                    <div><span>Événements publiés</span><strong>{stats.events.totalPublished}</strong></div>
                  </div>
                </Card>
              </div>
            </section>

            <section className={styles.insightsSection} aria-labelledby="insights-title">
              <div className={styles.sectionHeading}>
                <div><span className={styles.sectionIndex}>04</span><h2 id="insights-title">Tendances</h2></div>
                <p>Comprendre la progression et l’équilibre de la communauté.</p>
              </div>
              <div className={styles.insightsGrid}>
                <Card className={styles.chartCard}>
                  <div className={styles.chartHeading}><div><span>Acquisition</span><strong>Nouveaux comptes</strong></div><span className={styles.delta}>+{stats.community.newAccountsThisMonth} ce mois</span></div>
                  <LineChartCard data={stats.signupsLast30Days.map((d) => ({ date: d.date, value: d.count }))} formatDate={fmtDay} height={180} />
                </Card>
                <Card className={styles.chartCard}>
                  <div className={styles.chartHeading}><div><span>Répartition</span><strong>Profils de la communauté</strong></div><span className={styles.totalPill}>{stats.community.totalUsers} total</span></div>
                  <DonutChart data={stats.roleBreakdown.map((r) => ({ label: ROLE_LABEL[r.role], value: r.count, color: ROLE_COLOR[r.role] }))} size={160} />
                </Card>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  )
}

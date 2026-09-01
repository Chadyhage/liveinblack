import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { listMyStaffedEvents } from '@/lib/server/organizer/staffEvents'
import { Card, Mascot } from '@/app/components/ui'

// Port de src/pages/MesSoireesPage.jsx — point d'entrée du MEMBRE STAFF
// (serveur / contrôle entrée / DJ) invité sur la soirée d'un autre
// organisateur, sans avoir lui-même le rôle organisateur. Pure lecture,
// donc Server Component seul, sans sous-composant client (contrairement à
// /scanner/[eventId] ou /commander/[eventId]/[ticketCode] qui ont besoin
// d'interactivité).
//
// Fusionné avec l'ancien /scanner (index) : les deux pages répondaient à la
// même question ("quel événement dois-je ouvrir ce soir ?"), l'une listant
// les affectations roster (staff invité), l'autre les événements possédés
// (organisateur) — voir lib/server/staffEvents.ts::listMyStaffedEvents, qui
// fusionne maintenant les deux ensembles.
export const metadata: Metadata = {
  title: 'Mes soirées — LIVEINBLACK',
  robots: { index: false, follow: false },
}

// `soft`/`border` sont des rgba() FIXES, jamais dérivées de `color` par
// concaténation de chaîne (ex. `${meta.color}55`) — quand color vaut
// `var(--primary)`, ça produirait littéralement `var(--primary)55`, une valeur CSS
// invalide (on ne peut pas suffixer un canal alpha à une custom property).
// Un rgba() précalculé par rôle est la seule façon correcte de garder un
// fond/bordure translucides cohérents avec `color`.
const ROLE_META: Record<string, { label: string; color: string; soft: string; border: string; desc: string }> = {
  serveur: { label: 'Serveur', color: 'var(--primary)', soft: 'var(--primary-a12)', border: 'var(--primary-a35)', desc: 'Prends et sers les commandes au bar' },
  scan: { label: 'Contrôle entrée', color: 'var(--violet-text)', soft: 'rgba(var(--violet-rgb), .12)', border: 'var(--violet-border)', desc: "Scanne les billets à l'entrée" },
  manager: { label: 'Manager', color: 'var(--gold)', soft: 'var(--primary-a12)', border: 'var(--primary-a35)', desc: 'Gestion complète de la soirée' },
  dj: { label: 'DJ', color: 'var(--danger)', soft: 'var(--danger-fill)', border: 'var(--danger-border)', desc: 'Gère la playlist interactive de la soirée' },
  // 'vendeur' (#C, lib/server/agentSales.ts) ajouté après le reste de cette
  // page — manquait ici, ce qui faisait tomber sur le fallback générique
  // (couleur grise, description vide) ET, pire, redirigeait vers le scanner
  // au lieu de /on-site-sales/[eventId] (voir roleHref ci-dessous).
  vendeur: { label: 'Vente sur place', color: 'var(--gold)', soft: 'var(--primary-a12)', border: 'var(--primary-a35)', desc: 'Vends des billets cash ou Mobile Money' },
  // Rôle synthétique (pas une valeur EventStaff.roster[].role) — événement
  // que l'utilisateur organise lui-même, fusionné ici depuis l'ancien
  // /scanner (index), voir lib/server/staffEvents.ts.
  owner: { label: 'Organisateur', color: 'var(--primary)', soft: 'var(--primary-a12)', border: 'var(--primary-a35)', desc: "Ton événement — ouvre le scan pour contrôler l'entrée" },
}
const FALLBACK_ROLE_META = { label: '', color: 'var(--text-faint)', soft: 'var(--fill-secondary)', border: 'var(--border)', desc: '' }

// DJ → gestion de la playlist (#75/#47) ; vendeur → l'espace de vente sur
// place (#C) ; tout autre rôle staff (scan, serveur, manager) → le scanner,
// qui démarre en mode « contrôle entrée » et bascule lui-même en mode
// « service » dès qu'un billet est scanné (voir ScannerClient.tsx) — pas de
// state de navigation à transmettre, contrairement au legacy qui passait
// `{ mode, eventId }` en state de route.
function roleHref(eventId: string, role: string): string {
  if (role === 'dj') return `/playlist/${eventId}`
  if (role === 'vendeur') return `/on-site-sales/${eventId}`
  return `/scanner/${eventId}`
}

function roleCta(role: string): string {
  if (role === 'dj') return 'Gérer la playlist'
  if (role === 'scan' || role === 'owner') return 'Ouvrir le scan des entrées'
  if (role === 'vendeur') return 'Ouvrir la vente sur place'
  return 'Ouvrir le POS bar'
}

export default async function MesSoireesPage() {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }

  const events = await listMyStaffedEvents({ id: session.user.id })

  return (
    <main className="lb-dashboard-page lb-dashboard-page--medium">
      <div>
        <header style={{ marginBottom: 18 }}>
          <h1 style={{ margin: 0, color: 'var(--text)', fontSize: 'clamp(26px,3.2vw,34px)', fontWeight: 720, letterSpacing: '-.045em' }}>Mes soirées</h1>
          <p style={{ maxWidth: 650, margin: '7px 0 0', color: 'var(--text-faint)', fontSize: 'var(--font-size-callout)', lineHeight: 1.42 }}>Accède aux événements pour lesquels tu fais partie de l’équipe.</p>
        </header>
        {events.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 18px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <Mascot mood="sleeping" size={250} />
            <p style={{ fontWeight: 700, fontSize: 'var(--font-size-headline-lg)', color: 'var(--text)', margin: 0 }}>Aucune soirée pour l&apos;instant</p>
            <p style={{ fontSize: 'var(--font-size-footnote-lg)', color: 'var(--text-muted)', margin: 0, maxWidth: 340, lineHeight: 1.45 }}>
              Quand un organisateur t&apos;ajoute à l&apos;équipe d&apos;une soirée (serveur, contrôle entrée ou DJ), ou dès que tu crées toi-même un événement, elle apparaît ici.
            </p>
          </div>
        ) : (
          <div className="lb-dashboard-card-grid">
            {events.map((ev) => {
              const meta = ROLE_META[ev.role] ? ROLE_META[ev.role] : { ...FALLBACK_ROLE_META, label: ev.role }
              const dateLine = [ev.dateDisplay, ev.city].filter(Boolean).join(' · ')

              return (
                <Card
                  key={ev.eventId}
                  accent={ev.live ? meta.border : undefined}
                  style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, boxShadow: '0 8px 24px var(--scrim-mid)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <p
                        style={{
                          fontSize: 'var(--font-size-headline-lg)',
                          fontWeight: 800,
                          letterSpacing: '-0.4px',
                          color: 'var(--text)',
                          margin: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {ev.eventName || 'Événement'}
                      </p>
                      {dateLine && <p style={{ fontSize: 'var(--font-size-footnote-lg)', color: 'var(--text-muted)', margin: '4px 0 0' }}>{dateLine}</p>}
                    </div>
                    <span
                      style={{
                        flexShrink: 0,
                        fontSize: 'var(--font-size-caption)',
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        color: meta.color,
                        background: meta.soft,
                        border: `1px solid ${meta.border}`,
                        borderRadius: 'var(--radius-control)',
                        padding: '4px 10px',
                      }}
                    >
                      {meta.label}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {ev.live ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--font-size-caption-lg)', fontWeight: 700, color: meta.color }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: meta.color }} /> En cours
                      </span>
                    ) : ev.started ? (
                      <span style={{ fontSize: 'var(--font-size-caption-lg)', color: 'var(--text-faint)' }}>Soirée terminée</span>
                    ) : (
                      <span style={{ fontSize: 'var(--font-size-caption-lg)', color: 'var(--text-faint)' }}>À venir</span>
                    )}
                    <span style={{ fontSize: 'var(--font-size-caption-lg)', color: 'var(--text-faint)' }}>· {meta.desc}</span>
                  </div>

                  <Link
                    href={roleHref(ev.eventId, ev.role)}
                    style={{
                      width: '100%',
                      padding: '14px',
                      minHeight: 'var(--density-action-min)',
                      borderRadius: 'var(--radius-control)',
                      border: '1px solid var(--border-strong)',
                      fontSize: 'var(--font-size-body-sm)',
                      fontWeight: 700,
                      textTransform: 'none',
                      letterSpacing: 'normal',
                      color: 'var(--primary-ink)',
                      background: meta.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      textDecoration: 'none',
                    }}
                  >
                    {roleCta(ev.role)}
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </Link>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}

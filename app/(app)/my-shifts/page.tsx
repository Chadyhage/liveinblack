import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { listMyStaffedEvents } from '@/lib/server/staffEvents'

// Port de src/pages/MesSoireesPage.jsx — point d'entrée du MEMBRE STAFF
// (serveur / contrôle entrée / DJ) invité sur la soirée d'un autre
// organisateur, sans avoir lui-même le rôle organisateur. Pure lecture,
// donc Server Component seul, sans sous-composant client (contrairement à
// /scanner/[eventId] ou /commander/[eventId]/[ticketCode] qui ont besoin
// d'interactivité) — même convention que app/(app)/scanner/page.tsx (index
// des events scannables), qui est le plus proche voisin architectural.
export const metadata: Metadata = {
  title: 'Mes soirées — LIVEINBLACK',
  robots: { index: false, follow: false },
}

const ROLE_META: Record<string, { label: string; color: string; desc: string }> = {
  serveur: { label: 'Serveur', color: 'var(--teal)', desc: 'Prends et sers les commandes au bar' },
  scan: { label: 'Contrôle entrée', color: '#8b5cf6', desc: "Scanne les billets à l'entrée" },
  manager: { label: 'Manager', color: 'var(--gold)', desc: 'Gestion complète de la soirée' },
  dj: { label: 'DJ', color: '#e05aaa', desc: 'Gère la playlist interactive de la soirée' },
}

// DJ → gestion de la playlist (#75/#47) ; tout autre rôle staff (scan,
// serveur, manager) → le scanner, qui démarre en mode « contrôle entrée » et
// bascule lui-même en mode « service » dès qu'un billet est scanné (voir
// ScannerClient.tsx) — pas de state de navigation à transmettre, contrairement
// au legacy qui passait `{ mode, eventId }` en state de route.
function roleHref(eventId: string, role: string): string {
  return role === 'dj' ? `/playlist/${eventId}` : `/scanner/${eventId}`
}

function roleCta(role: string): string {
  if (role === 'dj') return 'Gérer la playlist'
  if (role === 'scan') return 'Ouvrir le scan des entrées'
  return 'Ouvrir le POS bar'
}

export default async function MesSoireesPage() {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }

  const events = await listMyStaffedEvents({ id: session.user.id })

  return (
    <main style={{ minHeight: '100vh', padding: '24px 16px 40px' }}>
      <div style={{ maxWidth: 620, margin: '0 auto' }}>
        <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gold)', margin: 0 }}>
          Équipe
        </p>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text)', margin: '6px 0 4px' }}>Mes soirées</h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 24px', lineHeight: 1.5 }}>
          Les événements où tu fais partie de l&apos;équipe. Ouvre le POS le jour J pour servir ou scanner.
        </p>

        {events.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
              }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="1.6">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <p style={{ fontWeight: 700, fontSize: 18, color: 'var(--text)', margin: 0 }}>Aucune soirée pour l&apos;instant</p>
            <p style={{ fontSize: 13.5, color: 'var(--text-muted)', margin: 0, maxWidth: 340, lineHeight: 1.55 }}>
              Quand un organisateur t&apos;ajoute à l&apos;équipe d&apos;une soirée (serveur, contrôle entrée ou DJ), elle apparaît ici.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {events.map((ev) => {
              const meta = ROLE_META[ev.role] ?? { label: ev.role, color: 'var(--text-faint)', desc: '' }
              const dateLine = [ev.dateDisplay, ev.city].filter(Boolean).join(' · ')

              return (
                <div
                  key={ev.eventId}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14,
                    padding: 18,
                    borderRadius: 16,
                    background: 'var(--surface)',
                    border: `1px solid ${ev.live ? `${meta.color}55` : 'var(--border)'}`,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <p
                        style={{
                          fontSize: 18,
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
                      {dateLine && <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '4px 0 0' }}>{dateLine}</p>}
                    </div>
                    <span
                      style={{
                        flexShrink: 0,
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        color: meta.color,
                        background: `${meta.color}1f`,
                        border: `1px solid ${meta.color}59`,
                        borderRadius: 8,
                        padding: '4px 10px',
                      }}
                    >
                      {meta.label}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {ev.live ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: meta.color }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: meta.color }} /> En cours
                      </span>
                    ) : ev.started ? (
                      <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>Soirée terminée</span>
                    ) : (
                      <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>À venir</span>
                    )}
                    <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>· {meta.desc}</span>
                  </div>

                  <Link
                    href={roleHref(ev.eventId, ev.role)}
                    style={{
                      width: '100%',
                      padding: '14px',
                      minHeight: 48,
                      borderRadius: 12,
                      border: '1px solid var(--border-strong)',
                      fontSize: 15,
                      fontWeight: 800,
                      color: 'var(--obsidian)',
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
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}

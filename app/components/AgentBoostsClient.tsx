'use client'

import { useEffect, useState } from 'react'
import { fmtMoney } from '@/lib/shared/money'

// Port en LECTURE SEULE de la section « Boosts » de src/pages/AgentPage.jsx
// (tab === 'boosts', #106 phase agent/admin) — voir lib/server/agentBoosts.ts
// pour la lecture serveur. Le legacy n'a AUCUN bouton d'action ici (les
// remboursements de conflit sont automatiques côté webhook, voir
// lib/server/finalizeBoost.ts) : ce panneau reste donc strictement une vue,
// pas de mutation, pas de filtres — le legacy n'en a pas non plus.

interface AgentBoostView {
  id: string
  eventId: string
  eventName: string
  organizerName: string
  position: number
  region: string
  price: number
  days: number
  purchasedAt: string
  expiresAt: string
  status: string
  conflict: boolean
  active: boolean
}

interface BoostsResponse {
  active: AgentBoostView[]
  conflicts: AgentBoostView[]
  expired: AgentBoostView[]
  totalRevenue: number
}

const cardStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 14 }

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  } catch {
    return '—'
  }
}

export default function AgentBoostsClient() {
  const [data, setData] = useState<BoostsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function run() {
      setLoading(true)
      setError(false)
      try {
        const res = await fetch('/api/agent/boosts')
        const body = await res.json()
        if (!res.ok || !body.ok) throw new Error('load_failed')
        if (!cancelled) setData({ active: body.active, conflicts: body.conflicts, expired: body.expired, totalRevenue: body.totalRevenue })
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
    <div style={{ padding: '8px 0 40px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {error && (
        <div style={{ ...cardStyle, border: '1px solid rgba(224,90,170,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Lecture impossible. Recharge la page.</p>
        </div>
      )}

      {loading ? (
        <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Chargement…</p>
      ) : !data ? null : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {[
              { label: 'Boosts actifs', value: String(data.active.length), color: 'var(--teal)' },
              { label: 'Conflits à traiter', value: String(data.conflicts.length), color: data.conflicts.length > 0 ? '#dc3232' : 'var(--text-muted)' },
              { label: 'Revenus boosts', value: fmtMoney(data.totalRevenue, 'EUR'), color: 'var(--gold)' },
            ].map((k) => (
              <div key={k.label} style={{ ...cardStyle, textAlign: 'center' }}>
                <p style={{ fontSize: 22, fontWeight: 800, color: k.color, margin: 0 }}>{k.value}</p>
                <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '3px 0 0' }}>{k.label}</p>
              </div>
            ))}
          </div>

          {data.conflicts.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#ff8c8c', margin: 0 }}>Conflits — action requise</p>
              {data.conflicts.map((b) => (
                <BoostCard key={b.id} b={b} />
              ))}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: 0 }}>Actifs ({data.active.length})</p>
            {data.active.length === 0 ? (
              <div style={{ ...cardStyle, padding: 26, textAlign: 'center' }}>
                <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>Aucun boost actif</p>
              </div>
            ) : (
              data.active.filter((b) => !b.conflict).map((b) => <BoostCard key={b.id} b={b} />)
            )}
          </div>

          {data.expired.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-faint)', margin: 0 }}>Expirés ({data.expired.length})</p>
              {data.expired.slice(0, 10).map((b) => (
                <div key={b.id} style={{ opacity: 0.55 }}>
                  <BoostCard b={b} />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function BoostCard({ b }: { b: AgentBoostView }) {
  return (
    <div
      style={{
        ...cardStyle,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        ...(b.conflict && b.active ? { borderColor: 'rgba(220,50,50,0.5)' } : {}),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--obsidian)', background: 'var(--gold)', borderRadius: 999, padding: '2px 9px' }}>Top {b.position}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', background: 'var(--surface-2)', borderRadius: 999, padding: '2px 9px' }}>
          {b.region || 'Toutes régions'}
        </span>
        {b.conflict && b.active && (
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: '#fff', background: 'rgba(220,50,50,0.85)', borderRadius: 999, padding: '2px 9px' }}>
            CONFLIT DE CRÉNEAU
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontWeight: 800, fontSize: 15, color: 'var(--gold)' }}>{fmtMoney(b.price, 'EUR')}</span>
      </div>
      <p style={{ fontSize: 14.5, fontWeight: 700, color: '#fff', margin: 0 }}>
        {b.eventName}
        {b.organizerName ? ` · ${b.organizerName}` : ''}
      </p>
      <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: 0 }}>
        Acheté le {fmtDate(b.purchasedAt)} · expire le {fmtDate(b.expiresAt)} · {b.days} jour{b.days > 1 ? 's' : ''}
      </p>
      {b.conflict && (
        <p style={{ fontSize: 11.5, color: 'rgba(255,140,140,0.9)', margin: 0, lineHeight: 1.5 }}>
          {b.status === 'refunded_conflict'
            ? 'Conflit de créneau : ce boost a été remboursé AUTOMATIQUEMENT par le webhook. Rien à faire — ne pas re-rembourser dans Stripe.'
            : 'Deux organisateurs ont payé ce créneau. Vérifie dans Stripe si le remboursement automatique est passé avant toute action manuelle.'}
        </p>
      )}
    </div>
  )
}

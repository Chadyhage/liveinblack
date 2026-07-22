'use client'

import { useMemo, useState } from 'react'
import { formatMoney, type OrganizerEventView } from './types'

// Port de OrganizerAnalytics (MesEvenementsPage.jsx lignes
// 3544-3725) — calculé ici depuis la liste d'événements déjà chargée par le
// tableau de bord (ticketCount/revenue par événement, cf.
// lib/server/organizerEvents.ts:listMyOrganizerEvents), sans appel réseau
// supplémentaire. La capacité et le stock consommé sont inclus dans la vue
// liste afin de restituer le taux de remplissage sans requête par événement.
export default function OrganizerAnalytics({ events }: { events: OrganizerEventView[] }) {
  const [showFees, setShowFees] = useState(false)

  const byCurrency = useMemo(() => {
    const totals = new Map<'EUR' | 'XOF', { revenue: number; ticketCount: number }>()
    for (const e of events) {
      const cur = totals.get(e.currency) ?? { revenue: 0, ticketCount: 0 }
      cur.revenue += e.revenue
      cur.ticketCount += e.ticketCount
      totals.set(e.currency, cur)
    }
    return totals
  }, [events])

  const totalTickets = events.reduce((sum, e) => sum + e.ticketCount, 0)
  const topEvents = [...events].filter((e) => e.totalCapacity > 0).sort((a, b) => b.soldCount / b.totalCapacity - a.soldCount / a.totalCapacity)

  if (totalTickets === 0) {
    return (
      <div style={{ border: '1px solid var(--border)', borderRadius: 16, background: 'var(--surface)', padding: 20, marginBottom: 16 }}>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>Aucune vente pour l&rsquo;instant.</p>
        <p style={{ color: 'var(--text-faint)', fontSize: 12, margin: '4px 0 0' }}>Tes ventes apparaîtront ici dès le premier billet.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
      <button
        type="button"
        aria-expanded={showFees}
        onClick={() => setShowFees((v) => !v)}
        style={{
          border: '1px solid var(--border)',
          borderRadius: 16,
          background: 'var(--surface)',
          padding: '16px 18px',
          cursor: 'pointer',
          textAlign: 'left',
          font: 'inherit',
          color: 'inherit',
          width: '100%',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, margin: '0 0 8px' }}>
          <span style={{ font: '600 11px Inter, sans-serif', letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            Revenus billetterie + précommandes
          </span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-muted)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0, transform: showFees ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[...byCurrency.entries()].map(([currency, totals]) => (
            <span key={currency} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ font: '600 26px Inter, sans-serif', color: '#fff' }}>{formatMoney(totals.revenue, currency)}</span>
              {byCurrency.size > 1 && <span style={{ font: '600 11px Inter, sans-serif', color: 'var(--text-faint)' }}>{currency}</span>}
            </span>
          ))}
        </span>
        {showFees && (
          <span style={{ display: 'block', font: '500 11.5px Inter, sans-serif', color: 'var(--text-faint)', lineHeight: 1.6, margin: '8px 0 0' }}>
            Frais de service (5 % + 0,49 € par billet, plafonné à 2,50 € — ou 5 % + 300 FCFA, plafonné à 1 500 FCFA) payés par l&rsquo;acheteur. Tu conserves 100 % du prix affiché.
          </span>
        )}
      </button>
      <div style={{ border: '1px solid var(--border)', borderRadius: 16, background: 'var(--surface)', padding: '16px 18px' }}>
        <p style={{ font: '600 11px Inter, sans-serif', letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 8px' }}>Billets émis</p>
        <p style={{ font: '600 26px Inter, sans-serif', color: '#fff', margin: 0 }}>{totalTickets}</p>
      </div>

      {topEvents.length > 0 && (
        <div style={{ gridColumn: '1 / -1', border: '1px solid var(--border)', borderRadius: 16, background: 'var(--surface)', padding: '16px 18px' }}>
          <p style={{ font: '600 11px Inter, sans-serif', letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 10px' }}>Par événement</p>
          <div style={{ display: 'grid', gap: 8 }}>
            {topEvents.map((e) => {
              const fill = Math.min(100, Math.round((e.soldCount / e.totalCapacity) * 100))
              return <div key={e.id} style={{ display: 'grid', gap: 5 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5 }}><span style={{ color: '#fff' }}>{e.name}</span><span style={{ color: 'var(--gold)', fontWeight: 600 }}>{e.soldCount}/{e.totalCapacity} · {fill}% · {formatMoney(e.revenue, e.currency)}</span></div><div aria-label={`Remplissage ${fill} %`} style={{ height: 5, borderRadius: 999, background: 'rgba(255,255,255,.08)', overflow: 'hidden' }}><div style={{ width: `${fill}%`, height: '100%', borderRadius: 999, background: fill >= 90 ? 'var(--teal)' : 'var(--gold)' }} /></div></div>
            })}
          </div>
        </div>
      )}
    </div>
  )
}

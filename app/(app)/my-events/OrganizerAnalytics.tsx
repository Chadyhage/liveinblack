'use client'

import { useMemo, useState } from 'react'
import { formatMoney, type OrganizerEventView } from './types'

// Port simplifié de OrganizerAnalytics (MesEvenementsPage.jsx lignes
// 3544-3725) — calculé ici depuis la liste d'événements déjà chargée par le
// tableau de bord (ticketCount/revenue par événement, cf.
// lib/server/organizerEvents.ts:listMyOrganizerEvents), sans appel réseau
// supplémentaire. Le détail "par événement" du legacy incluait une barre de
// taux de remplissage (nécessite la capacité totale des places, absente de
// cette vue liste) — délibérément omis ici ; la page /statistiques (#80)
// reste la source de vérité pour ce niveau de détail par événement.
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
  const topEvents = [...events].filter((e) => e.revenue > 0).sort((a, b) => b.revenue - a.revenue)

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
      <div style={{ border: '1px solid var(--border)', borderRadius: 16, background: 'var(--surface)', padding: '16px 18px', cursor: 'pointer' }} onClick={() => setShowFees((v) => !v)}>
        <p style={{ font: '600 11px Inter, sans-serif', letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 8px' }}>
          Revenus billetterie + précommandes
        </p>
        {[...byCurrency.entries()].map(([currency, totals]) => (
          <p key={currency} style={{ font: '600 26px Inter, sans-serif', color: '#fff', margin: '0 0 2px' }}>
            {formatMoney(totals.revenue, currency)}
          </p>
        ))}
        {showFees && (
          <p style={{ font: '500 11.5px Inter, sans-serif', color: 'var(--text-faint)', lineHeight: 1.6, margin: '8px 0 0' }}>
            Frais de service (5 % + 0,49 € par billet, plafonné à 2,50 € — ou 5 % + 300 FCFA, plafonné à 1 500 FCFA) payés par l&rsquo;acheteur. Tu conserves 100 % du prix affiché.
          </p>
        )}
      </div>
      <div style={{ border: '1px solid var(--border)', borderRadius: 16, background: 'var(--surface)', padding: '16px 18px' }}>
        <p style={{ font: '600 11px Inter, sans-serif', letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 8px' }}>Billets émis</p>
        <p style={{ font: '600 26px Inter, sans-serif', color: '#fff', margin: 0 }}>{totalTickets}</p>
      </div>

      {topEvents.length > 1 && (
        <div style={{ gridColumn: '1 / -1', border: '1px solid var(--border)', borderRadius: 16, background: 'var(--surface)', padding: '16px 18px' }}>
          <p style={{ font: '600 11px Inter, sans-serif', letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 10px' }}>Par événement</p>
          <div style={{ display: 'grid', gap: 8 }}>
            {topEvents.map((e) => (
              <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5 }}>
                <span style={{ color: '#fff' }}>{e.name}</span>
                <span style={{ color: 'var(--gold)', fontWeight: 600 }}>{formatMoney(e.revenue, e.currency)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

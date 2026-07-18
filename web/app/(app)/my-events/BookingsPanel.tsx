'use client'

import { useEffect, useState } from 'react'
import { formatMoney } from './types'

// Port de BookingsPanel (MesEvenementsPage.jsx lignes 3727-3884) — panneau
// plein écran (pas une petite modale) de détail des réservations d'un
// événement.
interface BookingTicket {
  ticketCode: string
  place: string
  placePrice: number
  totalPrice: number
  buyerName: string | null
  preorders: { name: string; price: number; qty: number }[]
}

interface BookingsResponse {
  ok: true
  tickets: BookingTicket[]
  ticketCount: number
  summaryByPlace: { place: string; count: number }[]
  preorderSummary: { name: string; qty: number }[]
}

export default function BookingsPanel({ event, onClose }: { event: { id: string; name: string; currency: 'EUR' | 'XOF' }; onClose: () => void }) {
  const [data, setData] = useState<BookingsResponse | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch(`/api/organizer-events/${event.id}/bookings`)
      .then(async (res) => {
        const body = await res.json()
        if (cancelled) return
        if (!res.ok || !body.ok) {
          setError('Impossible de charger les réservations.')
          return
        }
        setData(body)
      })
      .catch(() => {
        if (!cancelled) setError('Impossible de charger les réservations — vérifie ta connexion.')
      })
    return () => {
      cancelled = true
    }
  }, [event.id])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'var(--obsidian)', overflowY: 'auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '20px 22px', borderBottom: '1px solid var(--border)' }}>
        <button
          onClick={onClose}
          aria-label="Retour"
          style={{ background: 'none', border: 0, color: '#fff', fontSize: 20, cursor: 'pointer' }}
        >
          ←
        </button>
        <div>
          <h1 style={{ font: '600 20px Inter, sans-serif', color: '#fff', margin: 0 }}>{event.name}</h1>
          <p style={{ font: '500 12px Inter, sans-serif', color: 'var(--text-muted)', margin: '2px 0 0' }}>
            Réservations · {data?.ticketCount ?? 0} billet(s)
          </p>
        </div>
      </header>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 22px 60px' }}>
        {error && <p style={{ color: 'var(--pink)', fontSize: 13 }}>{error}</p>}
        {!data && !error && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Chargement…</p>}

        {data && data.ticketCount === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
            <p style={{ fontSize: 13, margin: 0 }}>Aucune réservation pour l&rsquo;instant.</p>
          </div>
        )}

        {data && data.ticketCount > 0 && (
          <>
            <section style={{ marginBottom: 20 }}>
              <h2 style={{ font: '600 11px Inter, sans-serif', letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 10px' }}>
                Résumé par type de place
              </h2>
              <div style={{ display: 'grid', gap: 8 }}>
                {data.summaryByPlace.map((row) => (
                  <div key={row.place} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)' }}>
                    <span style={{ color: '#fff', fontSize: 13 }}>{row.place}</span>
                    <span style={{ color: 'var(--gold)', fontSize: 13, fontWeight: 700 }}>{row.count}</span>
                  </div>
                ))}
              </div>
            </section>

            {data.preorderSummary.length > 0 && (
              <section style={{ marginBottom: 20 }}>
                <h2 style={{ font: '600 11px Inter, sans-serif', letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 10px' }}>
                  Précommandes (stock à prévoir)
                </h2>
                <div style={{ display: 'grid', gap: 8 }}>
                  {data.preorderSummary.map((row) => (
                    <div key={row.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)' }}>
                      <span style={{ color: '#fff', fontSize: 13 }}>{row.name}</span>
                      <span style={{ color: 'var(--gold)', fontSize: 13, fontWeight: 700 }}>× {row.qty}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section>
              <h2 style={{ font: '600 11px Inter, sans-serif', letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 10px' }}>
                Détail par billet
              </h2>
              <div style={{ display: 'grid', gap: 8 }}>
                {data.tickets.map((t) => (
                  <div key={t.ticketCode} style={{ padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>
                        {t.place} · {t.ticketCode}
                      </span>
                      <span style={{ color: 'var(--gold)', fontSize: 13, fontWeight: 700 }}>{formatMoney(t.totalPrice, event.currency)}</span>
                    </div>
                    {t.buyerName && <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '4px 0 0' }}>{t.buyerName}</p>}
                    {t.preorders.length > 0 && (
                      <ul style={{ margin: '8px 0 0', padding: '0 0 0 16px', color: 'var(--text-faint)', fontSize: 11.5 }}>
                        {t.preorders.map((p, i) => (
                          <li key={i}>
                            {p.qty}× {p.name} — {formatMoney(p.price * p.qty, event.currency)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}

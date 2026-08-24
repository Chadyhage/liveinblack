'use client'

import { useEffect, useState } from 'react'
import { formatMoney } from './types'
import { Card, EmptyState, ImmersiveDialog, SkeletonList } from '@/app/components/ui'
import styles from './BookingsPanel.module.css'

// Port de BookingsPanel (MesEvenementsPage.jsx lignes 3727-3884) — panneau
// centré de détail des réservations d'un événement. Le contenu interne scrolle
// pour rester utilisable même avec des listes de billets longues.
interface BookingTicket {
  ticketCode: string
  place: string
  placePrice: number
  totalPrice: number
  buyerName: string | null
  preorders: { name: string; price: number; qty: number; showLabel: string | null; showInfo: string | null }[]
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
    <ImmersiveDialog
      title={event.name}
      subtitle={`Réservations · ${data?.ticketCount ?? 0} billet${data?.ticketCount === 1 ? '' : 's'}`}
      onClose={onClose}
      maxWidth={920}
    >
        {error && <p className={styles.error}>{error}</p>}
        {!data && !error && <SkeletonList rows={3} columns={2} />}

        {data && data.ticketCount === 0 && (
          <div className={styles.empty}><EmptyState title="Aucune réservation" description="Les billets apparaîtront ici dès la première commande." /></div>
        )}

        {data && data.ticketCount > 0 && (
          <>
            <div className={styles.overview}>
              <Card className={styles.metric}><span>Billets vendus</span><strong>{data.ticketCount}</strong></Card>
              <Card className={styles.metric}><span>Types de place</span><strong>{data.summaryByPlace.length}</strong></Card>
              <Card className={styles.metric}><span>Précommandes</span><strong>{data.preorderSummary.reduce((sum, row) => sum + row.qty, 0)}</strong></Card>
            </div>

            <section className={styles.section}>
              <div className={styles.sectionHeader}><div><h2>Répartition des places</h2><p>Volume de billets par catégorie</p></div></div>
              <div className={styles.summaryGrid}>
                {data.summaryByPlace.map((row) => (
                  <Card key={row.place} className={styles.summaryRow}>
                    <span>{row.place}</span><strong>{row.count}</strong>
                  </Card>
                ))}
              </div>
            </section>

            {data.preorderSummary.length > 0 && (
              <section className={styles.section}>
                <div className={styles.sectionHeader}><div><h2>Stock à prévoir</h2><p>Précommandes confirmées pour l’événement</p></div></div>
                <div className={styles.summaryGrid}>
                  {data.preorderSummary.map((row) => (
                    <Card key={row.name} className={styles.summaryRow}>
                      <span>{row.name}</span><strong>× {row.qty}</strong>
                    </Card>
                  ))}
                </div>
              </section>
            )}

            <section className={styles.section}>
              <div className={styles.sectionHeader}><div><h2>Détail des billets</h2><p>Acheteurs, places et options associées</p></div></div>
              <div className={styles.ticketList}>
                {data.tickets.map((t) => (
                  <Card key={t.ticketCode} className={styles.ticket}>
                    <div className={styles.ticketTop}>
                      <div><p className={styles.ticketName}>{t.place}</p><p className={styles.ticketMeta}>{t.buyerName || 'Acheteur non renseigné'} · {t.ticketCode}</p></div>
                      <span className={styles.price}>{formatMoney(t.totalPrice, event.currency)}</span>
                    </div>
                    {t.preorders.length > 0 && (
                      <ul className={styles.preorders}>
                        {t.preorders.map((p, i) => (
                          <li key={i}>
                            {p.qty}× {p.name} — {formatMoney(p.price * p.qty, event.currency)}
                            {p.showLabel && <span className={styles.show}>Show : {p.showLabel}{p.showInfo ? ` · ${p.showInfo}` : ''}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                ))}
              </div>
            </section>
          </>
        )}
    </ImmersiveDialog>
  )
}

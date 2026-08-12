'use client'

import Image from 'next/image'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { isEventEnded } from '@/lib/shared/event-time'
import { fmtMoney } from '@/lib/shared/money'
import EventInterestButtonClient from '@/app/components/EventInterestButtonClient'
import { EmptyState, Pagination, pagedSlice } from '@/app/components/ui'
import { placeholderPhotoUrl } from '@/lib/shared/placeholderImage'

const PAGE_SIZE = 20

// Port de src/pages/InterestedEventsPage.jsx (#6 phase profil).

interface InterestedEventView {
  id: string
  name: string
  subtitle: string
  date: string
  dateDisplay: string
  time: string
  endTime: string
  city: string
  category: string
  imageUrl: string | null
  color: string
  cancelled: boolean
  currency: 'EUR' | 'XOF'
  minPrice: number | null
}

export interface EventInterestItemView {
  eventId: string
  createdAt: string
  event: InterestedEventView | null
}

const cardStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }

export default function InterestedEventsClient({ initialItems }: { initialItems: EventInterestItemView[] }) {
  const [items, setItems] = useState(initialItems)
  const [upcomingPage, setUpcomingPage] = useState(1)
  const [inactivePage, setInactivePage] = useState(1)

  function remove(eventId: string) {
    setItems((list) => list.filter((i) => i.eventId !== eventId))
  }

  const { upcoming, inactive } = useMemo(() => {
    const upcoming: EventInterestItemView[] = []
    const inactive: EventInterestItemView[] = []
    for (const item of items) {
      if (!item.event) {
        inactive.push(item)
      } else if (!isEventEnded(item.event)) {
        upcoming.push(item)
      } else {
        inactive.push(item)
      }
    }
    return { upcoming, inactive }
  }, [items])

  const { pageItems: pagedUpcoming, pageCount: upcomingPageCount } = pagedSlice(upcoming, upcomingPage, PAGE_SIZE)
  const { pageItems: pagedInactive, pageCount: inactivePageCount } = pagedSlice(inactive, inactivePage, PAGE_SIZE)

  return (
    <main className="lb-dashboard-page">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Link href="/profile" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', fontSize: 13, color: 'rgba(255,255,255,0.55)', textDecoration: 'none' }}>
          ← Profil
        </Link>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 850, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>Ma liste</p>
            <h1 className="font-display lb-dashboard-title">Événements intéressés</h1>
          </div>
          <Link
            href="/events"
            style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', padding: '10px 20px', borderRadius: 999, border: '1px solid var(--gold)', color: 'var(--gold)', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}
          >
            Explorer
          </Link>
        </div>

        {items.length === 0 ? (
          <EmptyState
            title="Aucun événement sauvegardé"
            description="Sur une fiche événement, clique sur Intéressé pour le retrouver ici."
          />
        ) : (
          <>
            <Section label={`À venir ${upcoming.length}`}>
              {upcoming.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Aucun événement à venir dans ta liste pour l&apos;instant.</p>
              ) : (
                <>
                  <Grid>
                    {pagedUpcoming.map((item) => (
                      <InterestCard key={item.eventId} item={item} inactive={false} onRemoved={() => remove(item.eventId)} />
                    ))}
                  </Grid>
                  <Pagination page={upcomingPage} pageCount={upcomingPageCount} onPageChange={setUpcomingPage} totalItems={upcoming.length} pageSize={PAGE_SIZE} />
                </>
              )}
            </Section>

            {inactive.length > 0 && (
              <Section label={`Passés ou indisponibles ${inactive.length}`}>
                <Grid>
                  {pagedInactive.map((item) => (
                    <InterestCard key={item.eventId} item={item} inactive onRemoved={() => remove(item.eventId)} />
                  ))}
                </Grid>
                <Pagination page={inactivePage} pageCount={inactivePageCount} onPageChange={setInactivePage} totalItems={inactive.length} pageSize={PAGE_SIZE} />
              </Section>
            )}
          </>
        )}
      </div>
    </main>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>{label}</p>
      {children}
    </div>
  )
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="lb-card-grid">{children}</div>
}

function InterestCard({ item, inactive, onRemoved }: { item: EventInterestItemView; inactive: boolean; onRemoved: () => void }) {
  const ev = item.event
  const addedDate = new Date(item.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })

  const priceLabel = !ev
    ? null
    : ev.minPrice === null
      ? 'Voir les places'
      : ev.minPrice === 0
        ? 'Gratuit'
        : `dès ${fmtMoney(ev.minPrice, ev.currency)}`

  const card = (
    <div className={ev ? 'lb-card' : undefined} style={{ ...cardStyle, opacity: inactive ? 0.72 : 1, cursor: ev ? 'pointer' : 'default', position: 'relative' }}>
      <div style={{ height: 158, position: 'relative', background: `linear-gradient(135deg, ${ev?.color || 'rgba(184, 243, 74, 0.2)'}, var(--obsidian))` }}>
        {ev && (
          <Image src={ev.imageUrl || placeholderPhotoUrl(ev.id, 400, 158)} alt="" fill style={{ objectFit: 'cover' }} sizes="(max-width: 768px) 100vw, 400px" />
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(4,4,11,.85), transparent 60%)' }} />
        <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', gap: 6 }}>
          {ev?.category && <Badge color="var(--text)" bg="rgba(255,255,255,0.12)">{ev.category}</Badge>}
          {inactive && <Badge color="#fff" bg="var(--pink)">Indisponible</Badge>}
        </div>
        <div style={{ position: 'absolute', top: 10, right: 10 }} onClick={(e) => e.stopPropagation()}>
          <EventInterestButtonClient eventId={item.eventId} initialInterested onChange={(interested) => !interested && onRemoved()} isAuthenticated floating compact />
        </div>
        {ev && (
          <div style={{ position: 'absolute', left: 12, right: 12, bottom: 10 }}>
            <p style={{ fontSize: 19, fontWeight: 850, margin: 0, color: ev.color || '#fff' }}>{ev.name}</p>
            <p style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.65)', margin: '2px 0 0' }}>
              {[ev.dateDisplay || ev.date, ev.time, ev.city].filter(Boolean).join(' · ') || 'Date à confirmer'}
            </p>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderTop: '1px solid var(--border)' }}>
        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>Ajouté le {addedDate}</span>
        {priceLabel && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold)' }}>{priceLabel}</span>}
      </div>
    </div>
  )

  return ev ? (
    <Link href={`/events/${ev.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      {card}
    </Link>
  ) : (
    card
  )
}

function Badge({ children, color, bg }: { children: React.ReactNode; color: string; bg: string }) {
  return <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999, color, background: bg }}>{children}</span>
}

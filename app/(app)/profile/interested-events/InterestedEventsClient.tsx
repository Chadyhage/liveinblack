'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { isEventEnded } from '@/lib/shared/event-time'
import { fmtMoney } from '@/lib/shared/money'
import EventInterestButtonClient from '@/app/components/EventInterestButtonClient'

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

  return (
    <main style={{ minHeight: '100vh', padding: '18px 16px 92px' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Link href="/profile" style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', textDecoration: 'none' }}>
          ← Profil
        </Link>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 850, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>Ma liste</p>
            <h1 style={{ fontSize: 'clamp(40px,10vw,68px)', fontWeight: 800, margin: 0 }}>Événements intéressés</h1>
          </div>
          <Link
            href="/events"
            style={{ padding: '10px 20px', borderRadius: 999, border: '1px solid var(--gold)', color: 'var(--gold)', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}
          >
            Explorer
          </Link>
        </div>

        {items.length === 0 ? (
          <div style={{ ...cardStyle, textAlign: 'center', padding: '56px 24px' }}>
            <div style={{ width: 60, height: 60, borderRadius: '50%', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(78,232,200,0.08)' }}>
              <HeartOutline />
            </div>
            <p style={{ fontWeight: 700, fontSize: 17, color: '#fff', margin: '0 0 6px' }}>Aucun événement sauvegardé</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Sur une fiche événement, touche Intéressé pour le retrouver ici.</p>
          </div>
        ) : (
          <>
            <Section label={`À venir ${upcoming.length}`}>
              {upcoming.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Aucun événement à venir dans ta liste pour l&apos;instant.</p>
              ) : (
                <Grid>
                  {upcoming.map((item) => (
                    <InterestCard key={item.eventId} item={item} inactive={false} onRemoved={() => remove(item.eventId)} />
                  ))}
                </Grid>
              )}
            </Section>

            {inactive.length > 0 && (
              <Section label={`Passés ou indisponibles ${inactive.length}`}>
                <Grid>
                  {inactive.map((item) => (
                    <InterestCard key={item.eventId} item={item} inactive onRemoved={() => remove(item.eventId)} />
                  ))}
                </Grid>
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
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px,1fr))', gap: 14 }}>{children}</div>
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
    <div style={{ ...cardStyle, opacity: inactive ? 0.72 : 1, cursor: ev ? 'pointer' : 'default', position: 'relative' }}>
      <div style={{ height: 158, position: 'relative', background: `linear-gradient(135deg, ${ev?.color || '#c8a96e'}33, var(--obsidian))` }}>
        {ev?.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ev.imageUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
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

function HeartOutline() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth={1.8}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 20.727c-.372 0-.729-.14-1.006-.395C7.717 17.634 3 12.855 3 8.967 3 6.224 5.101 4 7.72 4c1.62 0 3.05.868 3.905 2.19a.44.44 0 00.75 0C13.23 4.868 14.66 4 16.28 4 18.9 4 21 6.224 21 8.967c0 3.888-4.717 8.667-7.994 11.365-.277.255-.634.395-1.006.395z"
      />
    </svg>
  )
}

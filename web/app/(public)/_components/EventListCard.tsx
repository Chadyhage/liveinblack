import Link from 'next/link'
import type { PublicEvent } from '@/lib/server/events'
import { fmtMoney, eventCurrency } from '@/lib/shared/money'
import { getEventCountdown, isCountdownUrgent, getStockBadge } from '@/lib/shared/eventUrgency'

// Carte utilisée dans les rangées catégorie d'/evenements (équivalent
// EventCard/EventPoster du legacy, fusionnés en un seul composant).
export default function EventListCard({ event }: { event: PublicEvent }) {
  const prices = (event.places || []).map((p) => Number(p.price) || 0).filter(Boolean)
  const min = prices.length ? Math.min(...prices) : null
  const countdown = getEventCountdown(event)
  const urgent = isCountdownUrgent(event)
  const stock = getStockBadge(event)

  return (
    <Link
      href={`/events/${event.id}`}
      style={{
        display: 'block',
        flex: '0 0 auto',
        width: 220,
        textDecoration: 'none',
        color: 'inherit',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'relative', aspectRatio: '4/3', background: `linear-gradient(135deg, ${event.color || '#c8a96e'}33, var(--obsidian))` }}>
        {event.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.imageUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        )}
        {countdown && (
          <span
            style={{
              position: 'absolute',
              top: 8,
              left: 8,
              fontSize: 10.5,
              fontWeight: 800,
              color: urgent ? '#fff' : 'var(--text)',
              background: urgent ? 'var(--pink)' : 'rgba(5,6,10,.85)',
              padding: '3px 8px',
              borderRadius: 999,
            }}
          >
            {countdown}
          </span>
        )}
        {stock && (
          <span style={{ position: 'absolute', bottom: 8, left: 8, fontSize: 10, fontWeight: 800, color: '#fff', background: stock.color, padding: '3px 8px', borderRadius: 999 }}>
            {stock.label}
          </span>
        )}
        {min != null && (
          <span style={{ position: 'absolute', top: 8, right: 8, fontSize: 10.5, fontWeight: 800, color: 'var(--gold)', background: 'rgba(5,6,10,.92)', padding: '3px 8px', borderRadius: 999, border: '1px solid rgba(200,169,110,.4)' }}>
            dès {fmtMoney(min, eventCurrency(event))}
          </span>
        )}
      </div>
      <div style={{ padding: '10px 12px 12px' }}>
        <p style={{ fontSize: 14, fontWeight: 800, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{event.name}</p>
        <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '3px 0 0' }}>{[event.dateDisplay, event.city].filter(Boolean).join(' · ')}</p>
      </div>
    </Link>
  )
}

import Link from 'next/link'
import type { PublicEvent } from '@/lib/server/events'
import { fmtMoney, eventCurrency } from '@/lib/shared/money'
import { getEventCountdown, isCountdownUrgent, getStockBadge } from '@/lib/shared/eventUrgency'

// Carte utilisée dans les rangées catégorie d'/evenements (équivalent
// EventCard/EventPoster du legacy, fusionnés en un seul composant).
//
// `reason` (optionnel) : badge "pourquoi cette recommandation" — port du
// badge violet discret de la section "Nos recommandations pour toi" de
// HomePage.jsx (voir lib/shared/recommendations.ts). Absent pour tout usage
// non personnalisé (visiteur anonyme, rangées catégorie normales) : aucun
// changement visuel pour ces cas.
export default function EventListCard({ event, reason }: { event: PublicEvent; reason?: string }) {
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
      <div style={{ position: 'relative', aspectRatio: '4/3', background: `linear-gradient(135deg, ${event.color || '#c8a96e'}99, var(--surface))` }}>
        {event.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.imageUrl} alt={event.name} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
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
        {(stock || reason) && (
          <div style={{ position: 'absolute', left: 8, right: 8, bottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
            {stock ? (
              <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 800, color: '#fff', background: stock.color, padding: '3px 8px', borderRadius: 999 }}>
                {stock.label}
              </span>
            ) : (
              <span />
            )}
            {reason && (
              <span
                style={{
                  minWidth: 0,
                  flexShrink: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: 9.5,
                  fontWeight: 700,
                  color: '#e5d8ff',
                  background: 'rgba(5,6,10,0.88)',
                  padding: '4px 9px',
                  borderRadius: 999,
                  border: '1px solid rgba(139,92,246,0.5)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                <span aria-hidden="true" style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--violet)', flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{reason}</span>
              </span>
            )}
          </div>
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

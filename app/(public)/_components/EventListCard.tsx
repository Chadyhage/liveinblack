import Image from 'next/image'
import Link from 'next/link'
import type { PublicEvent } from '@/lib/server/events'
import { fmtMoney, eventCurrency } from '@/lib/shared/money'
import { getEventCountdown, isCountdownUrgent, getStockBadge } from '@/lib/shared/eventUrgency'
import { placeholderPhotoUrl } from '@/lib/shared/placeholderImage'

// Carte utilisée dans les rangées catégorie d'/evenements (équivalent
// EventCard/EventPoster du legacy, fusionnés en un seul composant).
//
// `reason` (optionnel) : badge "pourquoi cette recommandation" — port du
// badge violet discret de la section "Nos recommandations pour toi" de
// HomePage.jsx (voir lib/shared/recommendations.ts). Absent pour tout usage
// non personnalisé (visiteur anonyme, rangées catégorie normales) : aucun
// changement visuel pour ces cas.
export default function EventListCard({ event, reason, eager = false }: { event: PublicEvent; reason?: string; eager?: boolean }) {
  const prices = (event.places || []).map((p) => Number(p.price) || 0).filter(Boolean)
  const min = prices.length ? Math.min(...prices) : null
  const countdown = getEventCountdown(event)
  const urgent = isCountdownUrgent(event)
  const stock = getStockBadge(event)

  return (
    <Link
      href={`/events/${event.id}`}
      className="lb-card"
      style={{
        display: 'block',
        flex: '0 0 auto',
        width: 'clamp(320px, 29vw, 390px)',
        textDecoration: 'none',
        color: 'inherit',
        background: 'linear-gradient(180deg, var(--surface-2), var(--surface))',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-xl)',
        overflow: 'hidden',
        boxShadow: '0 18px 48px rgba(0,0,0,.24)',
      }}
    >
      <div style={{ position: 'relative', aspectRatio: '16/9', background: `linear-gradient(135deg, ${event.color || '#c8a96e'}99, var(--surface))` }}>
        <Image
          src={event.imageUrl || placeholderPhotoUrl(event.id, 600, 340)}
          alt={event.name}
          fill
          loading={eager ? 'eager' : undefined}
          style={{ objectFit: 'cover' }}
          sizes="(max-width: 700px) 86vw, 300px"
        />
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
                  color: 'var(--primary)',
                  background: 'rgba(5,6,10,0.88)',
                  padding: '4px 9px',
                  borderRadius: 999,
                  border: '1px solid rgba(184, 243, 74,0.5)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                <span aria-hidden="true" style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--primary)', flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{reason}</span>
              </span>
            )}
          </div>
        )}
        {min != null && (
          <span style={{ position: 'absolute', top: 8, right: 8, fontSize: 10.5, fontWeight: 800, color: 'var(--primary)', background: 'rgba(5,6,10,.92)', padding: '3px 8px', borderRadius: 999, border: '1px solid rgba(184, 243, 74,.4)' }}>
            dès {fmtMoney(min, eventCurrency(event))}
          </span>
        )}
      </div>
      <div style={{ minHeight: 126, padding: '20px 20px 22px', display: 'flex', flexDirection: 'column' }}>
        <p style={{ fontSize: 19, lineHeight: 1.22, fontWeight: 800, margin: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{event.name}</p>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '9px 0 0' }}>{[event.dateDisplay, event.city].filter(Boolean).join(' · ')}</p>
        {(event.category || event.organizer) && (
          <p style={{ fontSize: 12.5, color: 'var(--text-faint)', margin: 'auto 0 0', paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            {[event.category, event.organizer].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
    </Link>
  )
}

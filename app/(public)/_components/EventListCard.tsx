import Image from 'next/image'
import Link from 'next/link'
import { ArrowUpRight, CalendarDays, MapPin } from 'lucide-react'
import type { PublicEvent } from '@/lib/server/events'
import { fmtMoney, eventCurrency } from '@/lib/shared/money'
import { getEventCountdown, isCountdownUrgent, getStockBadge } from '@/lib/shared/eventUrgency'
import { placeholderPhotoUrl } from '@/lib/shared/placeholderImage'
import styles from './EventListCard.module.css'

export default function EventListCard({ event, reason, eager = false, priority = false }: { event: PublicEvent; reason?: string; eager?: boolean; priority?: boolean }) {
  const prices = (event.places || []).map((place) => Number(place.price) || 0).filter(Boolean)
  const minimumPrice = prices.length ? Math.min(...prices) : null
  const countdown = getEventCountdown(event)
  const urgent = isCountdownUrgent(event)
  const stock = getStockBadge(event)

  return (
    <Link href={`/events/${event.id}`} className={styles.card}>
      <div className={styles.visual} style={{ background: `linear-gradient(135deg, ${event.color || '#b8f34a'}99, #161619)` }}>
        <Image
          src={event.imageUrl || placeholderPhotoUrl(event.id, 900, 560)}
          alt=""
          fill
          loading={eager ? 'eager' : undefined}
          // Seule la toute première carte reçoit `priority` (préchargement
          // réel via <link rel="preload">) — les 2 suivantes restent en
          // simple `eager` (pas de lazy-load, mais pas de préchargement non
          // plus) : un `priority` sur plusieurs images à la fois dilue le
          // signal LCP au lieu de l'accélérer (#perf, 12/08/2026).
          priority={priority}
          className={styles.image}
          sizes="(max-width: 640px) calc(100vw - 40px), (max-width: 980px) 46vw, 30vw"
        />
        <div className={styles.scrim} aria-hidden="true" />
        <div className={styles.topBadges}>
          {countdown && <span className={urgent ? styles.urgentBadge : styles.badge}>{countdown}</span>}
          {minimumPrice != null && <span className={styles.price}>Dès {fmtMoney(minimumPrice, eventCurrency(event))}</span>}
        </div>
        {(stock || reason) && (
          <div className={styles.bottomBadges}>
            {stock && <span className={styles.stock} style={{ color: stock.ink, background: stock.color }}>{stock.label}</span>}
            {reason && <span className={styles.reason}>{reason}</span>}
          </div>
        )}
      </div>

      <div className={styles.content}>
        {event.category && <p className={styles.category}>{event.category}</p>}
        <h3>{event.name}</h3>
        <div className={styles.meta}>
          {event.dateDisplay && <span><CalendarDays size={18} aria-hidden="true" />{event.dateDisplay}</span>}
          {event.city && <span><MapPin size={18} aria-hidden="true" />{event.city}</span>}
        </div>
        <div className={styles.footer}>
          <span>{event.organizer || 'LIVEINBLACK'}</span>
          <span className={styles.discover}>Découvrir <ArrowUpRight size={18} aria-hidden="true" /></span>
        </div>
      </div>
    </Link>
  )
}

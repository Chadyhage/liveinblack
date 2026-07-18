import type { PublicEvent } from '@/lib/server/events'
import EventListCard from './EventListCard'

// Rangée horizontale style Netflix (scroll natif CSS, pas de JS nécessaire).
export default function EventRow({ title, events }: { title: string; events: PublicEvent[] }) {
  if (events.length === 0) return null
  return (
    <div style={{ marginBottom: 30 }}>
      <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 12px', padding: '0 22px' }}>{title}</h2>
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '0 22px 6px', scrollbarWidth: 'thin' }}>
        {events.map((event) => (
          <EventListCard key={event.id} event={event} />
        ))}
      </div>
    </div>
  )
}

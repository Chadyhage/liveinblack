import type { PublicEvent } from '@/lib/server/events'
import EventListCard from './EventListCard'

// Rangée horizontale style Netflix (scroll natif CSS, pas de JS nécessaire).
// `reasons` (optionnel) : eventId → texte du badge "recommandé pour toi"
// (lib/shared/recommendations.ts), transmis tel quel à EventListCard.
export default function EventRow({ title, events, reasons }: { title: string; events: PublicEvent[]; reasons?: Record<string, string> }) {
  if (events.length === 0) return null
  return (
    <div style={{ marginBottom: 30 }}>
      <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 12px', padding: '0 22px' }}>{title}</h2>
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '0 22px 6px', scrollbarWidth: 'thin' }}>
          {events.map((event) => (
            <EventListCard key={event.id} event={event} reason={reasons?.[event.id]} />
          ))}
        </div>
        {/* Affordance visuelle de scroll horizontal — sans elle, rien
            n'indique qu'il y a plus de contenu hors champ (souris desktop). */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 0,
            bottom: 6,
            right: 0,
            width: 40,
            pointerEvents: 'none',
            background: 'linear-gradient(to right, transparent, var(--obsidian))',
          }}
        />
      </div>
    </div>
  )
}

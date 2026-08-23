import type { PublicEvent } from '@/lib/server/events/events'
import EventListCard from './EventListCard'

// Rangée horizontale style Netflix (scroll natif CSS, pas de JS nécessaire).
// `reasons` (optionnel) : eventId → texte du badge "recommandé pour toi"
// (lib/shared/recommendations.ts), transmis tel quel à EventListCard.
export default function EventRow({ title, events, reasons, eagerFirst = false }: { title: string; events: PublicEvent[]; reasons?: Record<string, string>; eagerFirst?: boolean }) {
  if (events.length === 0) return null
  return (
    <section style={{ marginBottom: 52 }} aria-label={title}>
      <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: 18, marginBottom: 18 }}>
        <h2 className="font-display" style={{ fontSize: 'clamp(24px, 3vw, 34px)', lineHeight: 1, letterSpacing: '.01em', margin: 0 }}>{title}</h2>
        <span style={{ color: 'var(--text-faint)', fontSize: 12.5, whiteSpace: 'nowrap' }}>{events.length} événement{events.length > 1 ? 's' : ''}</span>
      </div>
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', gap: 22, overflowX: 'auto', padding: '0 0 14px', scrollbarWidth: 'thin', scrollSnapType: 'x proximity' }}>
          {events.map((event, index) => (
            <EventListCard key={event.id} event={event} reason={reasons?.[event.id]} eager={eagerFirst && index === 0} />
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
    </section>
  )
}

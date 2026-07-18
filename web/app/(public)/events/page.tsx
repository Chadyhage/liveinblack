import Link from 'next/link'
import { listPublicEvents, type PublicEvent } from '@/lib/server/events'
import { getBoostedEventIds } from '@/lib/server/boosts'
import { normalizeGeoText } from '@/lib/shared/locations'
import { isEventTonight } from '@/lib/shared/eventUrgency'
import EventListCard from '../_components/EventListCard'
import EventRow from '../_components/EventRow'

// Port de src/pages/EventsPage.jsx : rangées style Netflix par catégorie +
// recherche texte. Simplification assumée : recherche en formulaire GET
// simple (pas de saisie instantanée côté client) — cohérent avec le reste de
// la phase 2 qui reste 100% server-rendered.
const KNOWN_CATEGORIES = ['Afrobeat', 'Amapiano', 'Zouk / Kompa', 'Hip-Hop', 'House', 'Live']

function matchesSearch(event: PublicEvent, query: string): boolean {
  const hay = [event.name, event.city, event.category, event.subtitle, event.organizer, event.region, ...(event.tags || []), ...(event.artists || []).map((a) => a.name)]
    .filter(Boolean)
    .map(normalizeGeoText)
    .join(' ')
  return hay.includes(normalizeGeoText(query))
}

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams
  const search = (q || '').trim()

  const [events, boostedIds] = await Promise.all([listPublicEvents(), getBoostedEventIds()])

  return (
    <div style={{ padding: '28px 0 60px' }}>
      <div style={{ padding: '0 22px', marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 16px' }}>Événements</h1>
        <form action="/events" method="get" style={{ display: 'flex', gap: 8, maxWidth: 420 }}>
          <input
            type="text"
            name="q"
            defaultValue={search}
            placeholder="Rechercher un événement, une ville, un style…"
            style={{
              flex: 1,
              padding: '11px 14px',
              borderRadius: 10,
              border: '1px solid var(--border-strong)',
              background: 'var(--surface)',
              color: 'var(--text)',
              fontSize: 13.5,
            }}
          />
          <button
            type="submit"
            style={{ padding: '11px 18px', borderRadius: 10, border: 'none', background: 'var(--teal-solid)', color: '#04120e', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}
          >
            Chercher
          </button>
        </form>
      </div>

      {search ? (
        <SearchResults events={events} query={search} />
      ) : (
        <CategoryRails events={events} boostedIds={boostedIds} />
      )}
    </div>
  )
}

function SearchResults({ events, query }: { events: PublicEvent[]; query: string }) {
  const results = events.filter((e) => matchesSearch(e, query))
  if (results.length === 0) {
    return (
      <p style={{ padding: '0 22px', color: 'var(--text-muted)' }}>
        Aucun résultat pour « {query} ».{' '}
        <Link href="/events" style={{ color: 'var(--teal)' }}>
          Voir tous les événements
        </Link>
      </p>
    )
  }
  return (
    <div style={{ padding: '0 22px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
      {results.map((event) => (
        <EventListCard key={event.id} event={event} />
      ))}
    </div>
  )
}

function CategoryRails({ events, boostedIds }: { events: PublicEvent[]; boostedIds: Set<string> }) {
  const featured = events.filter((e) => boostedIds.has(e.id))
  const tonight = events.filter((e) => isEventTonight(e))
  const byCategory = KNOWN_CATEGORIES.map((category) => ({
    category,
    events: events.filter((e) => e.category === category),
  }))
  const categorized = new Set(byCategory.flatMap((c) => c.events.map((e) => e.id)))
  const others = events.filter((e) => !categorized.has(e.id) && !tonight.includes(e))

  if (events.length === 0) {
    return <p style={{ padding: '0 22px', color: 'var(--text-muted)' }}>Aucun événement disponible pour le moment.</p>
  }

  return (
    <>
      <EventRow title="À la une" events={featured} />
      <EventRow title="Ce soir" events={tonight} />
      {byCategory.map(({ category, events: catEvents }) => (
        <EventRow key={category} title={category} events={catEvents} />
      ))}
      <EventRow title="Autres soirées" events={others} />
    </>
  )
}

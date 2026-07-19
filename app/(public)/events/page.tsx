import Link from 'next/link'
import type { Metadata } from 'next'
import { auth } from '@/auth'
import { listPublicEvents, type PublicEvent } from '@/lib/server/events'
import { getBoostedEventIds } from '@/lib/server/boosts'
import { getMyProfile } from '@/lib/server/profile'
import { listActiveInterestSignals } from '@/lib/server/eventInterests'
import { normalizeGeoText } from '@/lib/shared/locations'
import { isEventTonight } from '@/lib/shared/eventUrgency'
import { getRecommendedEvents, type RecommendationPreferences } from '@/lib/shared/recommendations'
import EventListCard from '../_components/EventListCard'
import EventRow from '../_components/EventRow'

export const metadata: Metadata = {
  title: 'Événements — LIVEINBLACK',
  description: 'Parcourez tous les événements et soirées à venir et réservez votre billet sur LIVEINBLACK.',
}

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

// Personnalisation (recommandations #4 gap fidélité) : sort/highlight stable
// — un événement sans score connu (visiteur anonyme, ou aucun signal
// personnel) reste à sa place d'origine ; le tri JS (stable depuis ES2019)
// garantit qu'on ne mélange jamais l'ordre chronologique/catégorie existant
// quand aucun score ne les départage.
function sortByScore<T extends { id: string }>(events: T[], scores: Record<string, number>): T[] {
  if (Object.keys(scores).length === 0) return events
  return [...events].sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0))
}

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams
  const search = (q || '').trim()

  const [events, boostedIds, session] = await Promise.all([listPublicEvents(), getBoostedEventIds(), auth()])

  // Recommandations personnalisées (port de src/utils/recommendations.js +
  // la section "Nos recommandations pour toi" de HomePage.jsx — /home reste
  // hors périmètre, seule /events consomme ce moteur ici). Anonyme ou compte
  // sans préférences/intérêts déclarés → `recommendations` reste vide,
  // aucune ligne de code ci-dessous ne change l'ordre/affichage existant.
  let recommendations: ReturnType<typeof getRecommendedEvents<PublicEvent>> = []
  if (session?.user) {
    const [profile, interestHistory] = await Promise.all([
      getMyProfile({ id: session.user.id }),
      listActiveInterestSignals({ id: session.user.id }),
    ])
    if (profile && profile.privacy.personalizedRecommendations !== false) {
      recommendations = getRecommendedEvents({
        preferences: profile.preferences as RecommendationPreferences | null,
        interestHistory,
        events,
        boostedIds,
        currentUserId: session.user.id,
        max: 12,
      })
    }
  }
  const reasons: Record<string, string> = {}
  const scores: Record<string, number> = {}
  for (const r of recommendations) {
    if (r.reason) reasons[r.event.id] = r.reason
    scores[r.event.id] = r.score
  }

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
        <SearchResults events={events} query={search} scores={scores} reasons={reasons} />
      ) : (
        <>
          {recommendations.length > 0 && (
            <EventRow title="Recommandé pour toi" events={recommendations.map((r) => r.event)} reasons={reasons} />
          )}
          <CategoryRails events={events} boostedIds={boostedIds} scores={scores} reasons={reasons} />
        </>
      )}
    </div>
  )
}

function SearchResults({
  events,
  query,
  scores,
  reasons,
}: {
  events: PublicEvent[]
  query: string
  scores: Record<string, number>
  reasons: Record<string, string>
}) {
  const results = sortByScore(
    events.filter((e) => matchesSearch(e, query)),
    scores
  )
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
        <EventListCard key={event.id} event={event} reason={reasons[event.id]} />
      ))}
    </div>
  )
}

function CategoryRails({
  events,
  boostedIds,
  scores,
  reasons,
}: {
  events: PublicEvent[]
  boostedIds: Set<string>
  scores: Record<string, number>
  reasons: Record<string, string>
}) {
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
      <EventRow title="À la une" events={sortByScore(featured, scores)} reasons={reasons} />
      <EventRow title="Ce soir" events={sortByScore(tonight, scores)} reasons={reasons} />
      {byCategory.map(({ category, events: catEvents }) => (
        <EventRow key={category} title={category} events={sortByScore(catEvents, scores)} reasons={reasons} />
      ))}
      <EventRow title="Autres soirées" events={sortByScore(others, scores)} reasons={reasons} />
    </>
  )
}

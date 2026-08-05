import Link from 'next/link'
import type { Metadata } from 'next'
import { auth } from '@/auth'
import { type PublicEvent } from '@/lib/server/events'
import { getCachedPublicEvents as listPublicEvents, getCachedBoostedEventIds as getBoostedEventIds } from '@/lib/server/publicCache'
import { getMyProfile } from '@/lib/server/profile'
import { listActiveInterestSignals } from '@/lib/server/eventInterests'
import { normalizeGeoText } from '@/lib/shared/locations'
import { isEventTonight } from '@/lib/shared/eventUrgency'
import { getRecommendedEvents, type RecommendationPreferences } from '@/lib/shared/recommendations'
import EventListCard from '../_components/EventListCard'
import EventRow from '../_components/EventRow'
import { IconButton, EmptyState, Input, SectionHeader, PageLinks, pageSlice } from '@/app/components/ui'
import { PageShell } from '@/app/components/layout'
import { Search } from 'lucide-react'

const SEARCH_PAGE_SIZE = 24

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

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const { q, page: pageParam } = await searchParams
  const search = (q || '').trim()
  const requestedPage = Math.max(1, Number(pageParam) || 1)

  const [events, boostedIds, session] = await Promise.all([listPublicEvents(), getBoostedEventIds(), auth()])

  // Recommandations personnalisées (port de src/utils/recommendations.js +
  // la section "Nos recommandations pour toi" de HomePage.jsx. Anonyme ou compte
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
    <PageShell maxWidth={1800}>
      {/* Titre d'abord (pleine largeur), recherche en dessous — même
          hiérarchie que /providers et /organizers. L'ancienne disposition
          côte à côte (recherche à gauche plafonnée à 460px, titre poussé à
          l'extrémité droite via justifyContent:'space-between') laissait un
          grand vide au milieu sur les écrans larges. */}
      <SectionHeader eyebrow="La programmation" title="Événements" description="Découvre les prochaines expériences, soirées et rendez-vous près de chez toi." />
      <form action="/events" method="get" style={{ position: 'relative', display: 'flex', alignItems: 'center', minWidth: 0, width: '100%', maxWidth: 460, marginBottom: 36 }}>
        <Input
          type="search"
          name="q"
          defaultValue={search}
          placeholder="Nom, ville, artiste, style…"
          aria-label="Rechercher un événement"
          style={{ width: '100%', minHeight: 48, borderRadius: 999, paddingRight: 48 }}
        />
        <IconButton
          type="submit"
          label="Rechercher"
          icon={<Search size={17} strokeWidth={2} aria-hidden="true" />}
          tone="accent"
          size={38}
          style={{ position: 'absolute', right: 5, borderRadius: '50%' }}
        />
      </form>

      {search ? (
        <SearchResults events={events} query={search} scores={scores} reasons={reasons} page={requestedPage} />
      ) : (
        <>
          {recommendations.length > 0 && (
            <EventRow title="Recommandé pour toi" events={recommendations.map((r) => r.event)} reasons={reasons} eagerFirst />
          )}
          <CategoryRails events={events} boostedIds={boostedIds} scores={scores} reasons={reasons} />
        </>
      )}
    </PageShell>
  )
}

function SearchResults({
  events,
  query,
  scores,
  reasons,
  page,
}: {
  events: PublicEvent[]
  query: string
  scores: Record<string, number>
  reasons: Record<string, string>
  page: number
}) {
  const results = sortByScore(
    events.filter((e) => matchesSearch(e, query)),
    scores
  )
  if (results.length === 0) {
    return (
      <div style={{ maxWidth: 620 }}>
        <EmptyState
          title={`Aucun résultat pour « ${query} »`}
          description="Essaie un autre nom, une autre ville ou un style musical différent — ou lance une recherche globale si tu cherches un organisateur ou un prestataire."
          action={
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link href="/events" style={{ display: 'inline-flex', padding: '12px 18px', borderRadius: 'var(--radius-md)', fontSize: 12.5, fontWeight: 800, color: 'var(--primary-ink)', background: 'var(--primary)', textDecoration: 'none' }}>Voir tous les événements</Link>
              <Link href={`/search?q=${encodeURIComponent(query)}`} style={{ display: 'inline-flex', padding: '12px 18px', borderRadius: 'var(--radius-md)', fontSize: 12.5, fontWeight: 800, color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border-strong)', textDecoration: 'none' }}>Recherche globale</Link>
            </div>
          }
        />
      </div>
    )
  }
  const { pageItems: paged, pageCount, safePage } = pageSlice(results, page, SEARCH_PAGE_SIZE)
  function makeHref(p: number) {
    const params = new URLSearchParams({ q: query })
    if (p > 1) params.set('page', String(p))
    return `/events?${params.toString()}`
  }
  return (
    <>
      <div className="lb-card-grid">
        {paged.map((event, index) => (
          <EventListCard key={event.id} event={event} reason={reasons[event.id]} eager={index === 0} />
        ))}
      </div>
      <PageLinks page={safePage} pageCount={pageCount} makeHref={makeHref} totalItems={results.length} pageSize={SEARCH_PAGE_SIZE} />
    </>
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
      <EventRow title="À la une" events={sortByScore(featured, scores)} reasons={reasons} eagerFirst />
      <EventRow title="Ce soir" events={sortByScore(tonight, scores)} reasons={reasons} />
      {byCategory.map(({ category, events: catEvents }) => (
        <EventRow key={category} title={category} events={sortByScore(catEvents, scores)} reasons={reasons} />
      ))}
      <EventRow title="Plus d'événements" events={sortByScore(others, scores)} reasons={reasons} />
    </>
  )
}

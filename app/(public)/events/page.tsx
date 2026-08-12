import Link from 'next/link'
import type { Metadata } from 'next'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { auth } from '@/auth'
import { type PublicEvent } from '@/lib/server/events'
import { getCachedPublicEvents as listPublicEvents, getCachedBoostedEventIds as getBoostedEventIds } from '@/lib/server/publicCache'
import { getMyProfile } from '@/lib/server/profile'
import { listActiveInterestSignals } from '@/lib/server/eventInterests'
import { normalizeGeoText } from '@/lib/shared/locations'
import { getRecommendedEvents, type RecommendationPreferences } from '@/lib/shared/recommendations'
import { Button, HiddenField, Input, PageLinks, pageSlice } from '@/app/components/ui'
import EventListCard from '../_components/EventListCard'
import styles from './events.module.css'

const PAGE_SIZE = 24

export const metadata: Metadata = {
  title: 'Événements — LIVEINBLACK',
  description: 'Découvrez les prochains concerts, soirées et rendez-vous culturels sur LIVEINBLACK.',
}

function matchesSearch(event: PublicEvent, query: string): boolean {
  const haystack = [
    event.name,
    event.city,
    event.category,
    event.subtitle,
    event.organizer,
    event.region,
    ...(event.tags || []),
    ...(event.artists || []).map((artist) => artist.name),
  ]
    .filter(Boolean)
    .map(normalizeGeoText)
    .join(' ')

  return haystack.includes(normalizeGeoText(query))
}

function sortByScore<T extends { id: string }>(events: T[], scores: Record<string, number>): T[] {
  if (Object.keys(scores).length === 0) return events
  return [...events].sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0))
}

function filterHref(category?: string) {
  if (!category) return '/events'
  return `/events?category=${encodeURIComponent(category)}`
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; page?: string }>
}) {
  const { q, category: categoryParam, page: pageParam } = await searchParams
  const search = (q || '').trim()
  const category = (categoryParam || '').trim()
  const requestedPage = Math.max(1, Number(pageParam) || 1)

  const [events, boostedIds, session] = await Promise.all([listPublicEvents(), getBoostedEventIds(), auth()])

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
  for (const recommendation of recommendations) {
    if (recommendation.reason) reasons[recommendation.event.id] = recommendation.reason
    scores[recommendation.event.id] = recommendation.score
  }

  const categories = Array.from(new Set(events.map((event) => event.category).filter((value): value is string => Boolean(value)))).sort((a, b) =>
    a.localeCompare(b, 'fr')
  )
  const filteredEvents = sortByScore(
    events.filter((event) => (!search || matchesSearch(event, search)) && (!category || event.category === category)),
    scores
  )
  const { pageItems, pageCount, safePage } = pageSlice(filteredEvents, requestedPage, PAGE_SIZE)
  const hasFilters = Boolean(search || category)

  function makePageHref(page: number) {
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (category) params.set('category', category)
    if (page > 1) params.set('page', String(page))
    const query = params.toString()
    return query ? `/events?${query}` : '/events'
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero} aria-labelledby="events-title">
        <p className={styles.eyebrow}>La programmation</p>
        <h1 id="events-title">Trouvez votre prochaine expérience.</h1>
        <p className={styles.intro}>
          Concerts, soirées et rendez-vous culturels choisis pour vous. Recherchez simplement, puis réservez en quelques instants.
        </p>

        <form action="/events" method="get" role="search" className={styles.searchForm}>
          {category && <HiddenField name="category" value={category} />}
          <Search size={22} strokeWidth={2} aria-hidden="true" className={styles.searchIcon} />
          <Input
            type="search"
            name="q"
            defaultValue={search}
            placeholder="Événement, artiste ou ville"
            aria-label="Rechercher un événement"
            className={styles.searchInput}
            containerStyle={{ flex: 1, minWidth: 0 }}
            style={{ border: 0, background: 'transparent', boxShadow: 'none' }}
          />
          <Button type="submit" className={styles.searchButton} style={{ minWidth: 154, minHeight: 52, borderRadius: 15, background: '#b8f34a', color: '#142000', fontSize: 17 }}>
            <Search size={19} strokeWidth={2.2} aria-hidden="true" />
            <span>Rechercher</span>
          </Button>
        </form>
      </section>

      <section className={styles.catalogue} aria-labelledby="catalogue-title">
        <div className={styles.filterHeader}>
          <div>
            <p className={styles.sectionKicker}><SlidersHorizontal size={18} aria-hidden="true" /> Explorer</p>
            <h2 id="catalogue-title">Tous les événements</h2>
          </div>
          <p className={styles.resultCount} aria-live="polite">
            {filteredEvents.length} événement{filteredEvents.length > 1 ? 's' : ''}
          </p>
        </div>

        <nav className={styles.filters} aria-label="Filtrer par catégorie">
          <Link href={filterHref()} className={`${styles.filterChip} ${!category ? styles.filterChipActive : ''}`} aria-current={!category ? 'page' : undefined}>
            Tout voir
          </Link>
          {categories.map((item) => (
            <Link
              key={item}
              href={filterHref(item)}
              className={`${styles.filterChip} ${category === item ? styles.filterChipActive : ''}`}
              aria-current={category === item ? 'page' : undefined}
            >
              {item}
            </Link>
          ))}
        </nav>

        {hasFilters && (
          <div className={styles.activeFilters}>
            <p>
              {search ? <>Résultats pour <strong>« {search} »</strong></> : <>Catégorie <strong>{category}</strong></>}
            </p>
            <Link href="/events"><X size={17} aria-hidden="true" /> Effacer les filtres</Link>
          </div>
        )}

        {pageItems.length > 0 ? (
          <div className={styles.grid}>
            {pageItems.map((event, index) => (
              <EventListCard key={event.id} event={event} reason={reasons[event.id]} eager={index < 3} />
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <span aria-hidden="true"><Search size={28} /></span>
            <h3>Aucun événement trouvé</h3>
            <p>Essayez une autre ville, un autre artiste ou affichez toute la programmation.</p>
            <Link href="/events">Voir tous les événements</Link>
          </div>
        )}

        <div className={styles.pagination}>
          <PageLinks page={safePage} pageCount={pageCount} makeHref={makePageHref} totalItems={filteredEvents.length} pageSize={PAGE_SIZE} />
        </div>
      </section>
    </main>
  )
}

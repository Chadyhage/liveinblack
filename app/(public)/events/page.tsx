import Link from 'next/link'
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { auth } from '@/auth'
import { type PublicEvent } from '@/lib/server/events/events'
import { getCachedBoostedEventIds, getCachedPublicEventsDirectory } from '@/lib/server/publicCache'
import { hasAuthSessionCookie } from '@/lib/server/authSessionCookie'
import { getMyProfile } from '@/lib/server/users/profile'
import { listActiveInterestSignals } from '@/lib/server/events/eventInterests'
import { getRecommendedEvents, type RecommendationPreferences } from '@/lib/shared/recommendations'
import { Button, HiddenField, Input, Mascot, PageLinks } from '@/app/components/ui'
import EventListCard from '../_components/EventListCard'
import styles from './events.module.css'

const PAGE_SIZE = 24

export const metadata: Metadata = {
  title: 'Événements — LIVEINBLACK',
  description: 'Découvrez les prochains concerts, soirées et rendez-vous culturels sur LIVEINBLACK.',
  alternates: { canonical: '/events' },
  robots: { index: true, follow: true },
  openGraph: {
    url: '/events',
    siteName: 'LIVEINBLACK',
    locale: 'fr_BJ',
    title: 'Événements au Bénin — LIVEINBLACK',
    description: 'Concerts, soirées et rendez-vous culturels à découvrir et réserver au Bénin.',
  },
}

export const revalidate = 45

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
  const cookieStore = await cookies()
  const hasSessionCookie = hasAuthSessionCookie(cookieStore.getAll())

  const [{ events: pageEvents, total, pageSize, totalPages, page: safePage }, boostedIds, session] = await Promise.all([
    getCachedPublicEventsDirectory({
      q: search,
      category,
      page: requestedPage,
      pageSize: PAGE_SIZE,
      includeTotal: true,
    }),
    getCachedBoostedEventIds(),
    hasSessionCookie ? auth() : Promise.resolve(null),
  ])

  let recommendations: ReturnType<typeof getRecommendedEvents<PublicEvent>> = []
  let recommendationSource: PublicEvent[] = []
  if (session?.user) {
    const [{ events: prefSource }, profile, interestHistory] = await Promise.all([
      getCachedPublicEventsDirectory({
        page: 1,
        pageSize: 60,
        includeTotal: false,
      }),
      getMyProfile({ id: session.user.id }),
      listActiveInterestSignals({ id: session.user.id }),
    ])
    recommendationSource = prefSource

    if (profile && profile.privacy.personalizedRecommendations !== false) {
      recommendations = getRecommendedEvents({
        preferences: profile.preferences as RecommendationPreferences | null,
        interestHistory,
        events: recommendationSource,
        boostedIds,
        currentUserId: session.user.id,
        max: 12,
      })
    }
  } else {
    recommendationSource = pageEvents
  }

  const reasons: Record<string, string> = {}
  for (const recommendation of recommendations) {
    if (recommendation.reason) reasons[recommendation.event.id] = recommendation.reason
  }

  const categories = Array.from(
    new Set(
      recommendationSource.map((event) => event.category).filter((value): value is string => Boolean(value))
    )
  ).sort((a, b) => a.localeCompare(b, 'fr'))
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
          <Button
            type="submit"
            className={styles.searchButton}
            style={{ minWidth: 144, minHeight: 36, borderRadius: 15, background: '#b8f34a', color: '#142000', fontSize: 14 }}
          >
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
            {total} événement{total > 1 ? 's' : ''}
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

        {pageEvents.length > 0 ? (
          <div className={styles.grid}>
            {pageEvents.map((event, index) => (
              <EventListCard key={event.id} event={event} reason={reasons[event.id]} eager={index < 3} />
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <Mascot mood="search" size={164} />
            <h3>Aucun événement trouvé</h3>
            <p>Essayez une autre ville, un autre artiste ou affichez toute la programmation.</p>
            <Link href="/events">Voir tous les événements</Link>
          </div>
        )}

        <div className={styles.pagination}>
          <PageLinks page={safePage} pageCount={totalPages} makeHref={makePageHref} totalItems={total} pageSize={pageSize} />
        </div>
      </section>
    </main>
  )
}

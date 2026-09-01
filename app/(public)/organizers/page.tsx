import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { ArrowUpRight, MapPin, Search, SlidersHorizontal, Users, X } from 'lucide-react'
import { auth } from '@/auth'
import { getCachedPublicOrganizersDirectory } from '@/lib/server/publicCache'
import { hasAuthSessionCookie } from '@/lib/server/authSessionCookie'
import { listMyFollowedOrganizers } from '@/lib/server/organizer/organizerFollows'
import { getEntityRegionIds, getRegionName } from '@/lib/shared/locations'
import { regions } from '@/lib/shared/regions'
import { reliablePhotoUrl } from '@/lib/shared/placeholderImage'
import OrganizerFollowButtonClient from '@/app/components/features/organizer/OrganizerFollowButtonClient'
import FilterSelect from '../_components/FilterSelect'
import { Button, Checkbox, Input, Mascot, PageLinks } from '@/app/components/ui'
import styles from './organizers.module.css'

const SITE = process.env.PUBLIC_SITE_URL || 'https://liveinblack.com'

export const metadata: Metadata = {
  title: 'Organisateurs — LIVEINBLACK',
  description: "Découvrez les organisateurs d'événements et suivez ceux qui font vivre la scène sur LIVEINBLACK.",
  alternates: { canonical: '/organizers' },
  robots: { index: true, follow: true },
  openGraph: {
    url: '/organizers',
    siteName: 'LIVEINBLACK',
    locale: 'fr_BJ',
    title: 'Organisateurs d’événements au Bénin — LIVEINBLACK',
    description: 'Découvrez les organisateurs qui font vivre la scène événementielle au Bénin.',
  },
}

type DirectoryParams = { q?: string; region?: string; upcoming?: string; sort?: string; page?: string }

export default async function PublicOrganizersPage({ searchParams }: { searchParams: Promise<DirectoryParams> }) {
  const [{ q, region = '', upcoming, sort = 'popular', page: pageParam }, cookieStore] = await Promise.all([
    searchParams,
    cookies(),
  ])
  const search = (q || '').trim()
  const upcomingOnly = upcoming === '1'
  const requestedPage = Math.max(1, Number(pageParam) || 1)
  const hasSessionCookie = hasAuthSessionCookie(cookieStore.getAll())
  const session = hasSessionCookie ? await auth() : null

  const { organizers, total, totalPages, pageSize } = await getCachedPublicOrganizersDirectory({
    q: search,
    region,
    upcoming: upcomingOnly,
    sort: sort === 'recent' ? 'recent' : 'popular',
    page: requestedPage,
    pageSize: 24,
  })

  const followResult = session?.user ? await listMyFollowedOrganizers({ id: session.user.id }) : { ok: true as const, follows: [] }
  const followedIds = new Set(followResult.ok ? followResult.follows.map((follow) => follow.organizerId) : [])

  const hasFilters = Boolean(search || region || upcomingOnly || sort !== 'popular')
  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    '@id': `${SITE}/organizers#itemlist`,
    name: 'Organisateurs d’événements au Bénin sur LIVEINBLACK',
    inLanguage: 'fr-BJ',
    numberOfItems: organizers.length,
    itemListElement: organizers.map((organizer, index) => ({
      '@type': 'ListItem',
      position: (requestedPage - 1) * pageSize + index + 1,
      url: `${SITE}/organizers/${organizer.slug}`,
      name: organizer.publicName,
      item: {
        '@type': 'Organization',
        '@id': `${SITE}/organizers/${organizer.slug}`,
        name: organizer.publicName,
        url: `${SITE}/organizers/${organizer.slug}`,
        address: organizer.city || organizer.country ? {
          '@type': 'PostalAddress',
          addressLocality: organizer.city,
          addressCountry: organizer.country || 'BJ',
        } : undefined,
      },
    })),
  }

  function makeHref(page: number) {
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (region) params.set('region', region)
    if (upcomingOnly) params.set('upcoming', '1')
    if (sort !== 'popular') params.set('sort', sort)
    if (page > 1) params.set('page', String(page))
    const query = params.toString()
    return query ? `/organizers?${query}` : '/organizers'
  }

  return (
    <main className={styles.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd).replace(/</g, '\\u003c') }} />
      <section className={styles.hero} aria-labelledby="organizers-title">
        <h1 id="organizers-title">Suivez celles et ceux qui créent l’émotion.</h1>
        <p className={styles.intro}>Découvrez leur univers, suivez leur actualité et retrouvez leurs prochains rendez-vous.</p>

        <form action="/organizers" method="get" role="search" className={styles.searchPanel}>
          <div className={styles.searchField}>
            <Search size={22} aria-hidden="true" />
            <Input type="search" name="q" defaultValue={search} placeholder="Nom, ville ou événement" aria-label="Rechercher un organisateur" containerStyle={{ flex: 1, minWidth: 0 }} style={{ border: 0, background: 'transparent', boxShadow: 'none' }} />
          </div>
          <FilterSelect name="region" defaultValue={region} ariaLabel="Filtrer par région" options={[{ value: '', label: 'Toutes les régions' }, ...regions.map((item) => ({ value: item.id, label: `${item.flag} ${item.name}` }))]} style={{ minHeight: 36, borderRadius: 15, background: 'var(--field-bg)', borderColor: 'var(--border)', fontSize: 'var(--font-size-body)', padding: '0 12px' }} />
          <FilterSelect name="sort" defaultValue={sort} ariaLabel="Trier les organisateurs" options={[{ value: 'popular', label: 'Plus populaires' }, { value: 'recent', label: 'Plus récents' }]} style={{ minHeight: 36, borderRadius: 15, background: 'var(--field-bg)', borderColor: 'var(--border)', fontSize: 'var(--font-size-body)', padding: '0 12px' }} />
          <div className={styles.upcomingFilter}><Checkbox name="upcoming" value="1" defaultChecked={upcomingOnly} label="Événement à venir" style={{ minHeight: 36, fontSize: 'var(--font-size-body)', color: 'var(--text-muted)' }} /></div>
          <Button type="submit" className={styles.submitButton} style={{ minHeight: 36, borderRadius: 14, background: 'var(--primary)', color: 'var(--primary-ink)', fontSize: 'var(--font-size-body-sm)' }}>Appliquer</Button>
        </form>
      </section>

      <section className={styles.directory} aria-labelledby="organizer-directory-title">
        <div className={styles.directoryHeader}>
          <div><p className={styles.sectionKicker}><SlidersHorizontal size={18} aria-hidden="true" /> Explorer</p><h2 id="organizer-directory-title">Tous les organisateurs</h2></div>
          <p className={styles.resultCount}>{total} profil{total > 1 ? 's' : ''}</p>
        </div>

        {hasFilters && <div className={styles.activeFilters}><p>Résultats selon vos critères</p><Link href="/organizers"><X size={17} aria-hidden="true" /> Effacer les filtres</Link></div>}

        {organizers.length > 0 ? (
          <div className={styles.grid}>
            {organizers.map((organizer, index) => {
              const zones = getEntityRegionIds(organizer).map(getRegionName).filter(Boolean)
              const isSelf = session?.user?.id === organizer.userId
              return (
                <article key={organizer.userId} className={styles.card}>
                  <Link href={`/organizers/${organizer.slug}`} className={styles.cardLink} aria-label={`Découvrir ${organizer.publicName}`}>
                    <div className={styles.visual}>
                      <Image src={reliablePhotoUrl(organizer.bannerUrl, organizer.userId, 900, 600)} alt="" fill loading={index < 4 ? 'eager' : undefined} className={styles.cover} sizes="(max-width:680px) calc(100vw - 40px), (max-width:1020px) 46vw, (max-width:1440px) 24vw, 210px" />
                      <div className={styles.scrim} />
                      <div className={styles.avatar}>{organizer.avatarUrl ? <Image src={organizer.avatarUrl} alt="" fill sizes="72px" /> : organizer.publicName?.[0]?.toUpperCase()}</div>
                    </div>
                    <div className={styles.cardBody}>
                      <h3>{organizer.publicName}</h3>
                      {(organizer.city || zones.length > 0) && <p className={styles.location}><MapPin size={18} aria-hidden="true" />{[organizer.city, ...zones].filter(Boolean).slice(0, 3).join(' · ')}</p>}
                      <p className={styles.description}>{organizer.shortDescription || 'Découvrez sa programmation et son univers.'}</p>
                      <div className={styles.stats}><span><Users size={18} aria-hidden="true" />{organizer.followersCount || 0} abonné{(organizer.followersCount || 0) > 1 ? 's' : ''}</span></div>
                      {organizer.nextEvent && <div className={styles.nextEvent}><span>Prochain événement</span><strong>{organizer.nextEvent.name}</strong></div>}
                      <div className={styles.discover}>Découvrir la page <ArrowUpRight size={19} aria-hidden="true" /></div>
                    </div>
                  </Link>
                  {!isSelf && <div className={styles.follow}><OrganizerFollowButtonClient organizerId={organizer.userId} organizerName={organizer.publicName} initialFollowing={followedIds.has(organizer.userId)} isAuthenticated={Boolean(session?.user)} appearance="premium" /></div>}
                </article>
              )
            })}
          </div>
        ) : (
          <div className={styles.empty}><Mascot mood="search" size={164} /><h3>Aucun organisateur trouvé</h3><p>Élargissez la région ou essayez une autre recherche.</p><Link href="/organizers">Voir tous les organisateurs</Link></div>
        )}

        <PageLinks page={requestedPage} pageCount={totalPages} makeHref={makeHref} totalItems={total} pageSize={pageSize} />
      </section>
    </main>
  )
}

import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'
import { ArrowUpRight, MapPin, Search, SlidersHorizontal, Users, X } from 'lucide-react'
import { auth } from '@/auth'
import { getCachedPublicOrganizersWithNextEvent as listPublicOrganizersWithNextEvent } from '@/lib/server/publicCache'
import { listMyFollowedOrganizers } from '@/lib/server/organizerFollows'
import { normalizeGeoText, getEntityRegionIds, getRegionName, matchesEntityRegion } from '@/lib/shared/locations'
import { regions } from '@/lib/shared/regions'
import { placeholderPhotoUrl } from '@/lib/shared/placeholderImage'
import OrganizerFollowButtonClient from '@/app/components/OrganizerFollowButtonClient'
import FilterSelect from '../_components/FilterSelect'
import { Button, Checkbox, Input, PageLinks, pageSlice } from '@/app/components/ui'
import styles from './organizers.module.css'

const PAGE_SIZE = 20

export const metadata: Metadata = {
  title: 'Organisateurs — LIVEINBLACK',
  description: "Découvrez les organisateurs d'événements et suivez ceux qui font vivre la scène sur LIVEINBLACK.",
}

export const dynamic = 'force-dynamic'

type DirectoryParams = { q?: string; region?: string; upcoming?: string; sort?: string; page?: string }

export default async function PublicOrganizersPage({ searchParams }: { searchParams: Promise<DirectoryParams> }) {
  const [{ q, region = '', upcoming, sort = 'popular', page: pageParam }, organizers, session] = await Promise.all([
    searchParams,
    listPublicOrganizersWithNextEvent(),
    auth(),
  ])
  const search = (q || '').trim()
  const upcomingOnly = upcoming === '1'
  const requestedPage = Math.max(1, Number(pageParam) || 1)

  const followResult = session?.user ? await listMyFollowedOrganizers({ id: session.user.id }) : { ok: true as const, follows: [] }
  const followedIds = new Set(followResult.ok ? followResult.follows.map((follow) => follow.organizerId) : [])

  const filtered = organizers
    .filter((organizer) => {
      if (upcomingOnly && !organizer.nextEvent) return false
      if (!matchesEntityRegion(organizer, region, organizer.eventRegions)) return false
      if (!search) return true
      const zones = getEntityRegionIds(organizer, organizer.eventRegions).map(getRegionName)
      return [organizer.publicName, organizer.city, organizer.country, organizer.shortDescription, organizer.nextEvent?.name, ...zones]
        .filter(Boolean)
        .map(normalizeGeoText)
        .join(' ')
        .includes(normalizeGeoText(search))
    })
    .sort((a, b) => sort === 'recent'
      ? new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      : (b.followersCount || 0) - (a.followersCount || 0))

  const { pageItems, pageCount, safePage } = pageSlice(filtered, requestedPage, PAGE_SIZE)
  const hasFilters = Boolean(search || region || upcomingOnly || sort !== 'popular')

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
      <section className={styles.hero} aria-labelledby="organizers-title">
        <p className={styles.eyebrow}>L’annuaire LIVEINBLACK</p>
        <h1 id="organizers-title">Suivez celles et ceux qui créent l’émotion.</h1>
        <p className={styles.intro}>Découvrez leur univers, suivez leur actualité et retrouvez leurs prochains rendez-vous.</p>

        <form action="/organizers" method="get" role="search" className={styles.searchPanel}>
          <div className={styles.searchField}>
            <Search size={22} aria-hidden="true" />
            <Input type="search" name="q" defaultValue={search} placeholder="Nom, ville ou événement" aria-label="Rechercher un organisateur" containerStyle={{ flex: 1, minWidth: 0 }} style={{ border: 0, background: 'transparent', boxShadow: 'none' }} />
          </div>
          <FilterSelect name="region" defaultValue={region} ariaLabel="Filtrer par région" options={[{ value: '', label: 'Toutes les régions' }, ...regions.map((item) => ({ value: item.id, label: `${item.flag} ${item.name}` }))]} style={{ minHeight: 56, borderRadius: 15, background: 'rgba(255,255,255,.075)', borderColor: 'rgba(255,255,255,.14)', fontSize: 16, padding: '0 16px' }} />
          <FilterSelect name="sort" defaultValue={sort} ariaLabel="Trier les organisateurs" options={[{ value: 'popular', label: 'Plus populaires' }, { value: 'recent', label: 'Plus récents' }]} style={{ minHeight: 56, borderRadius: 15, background: 'rgba(255,255,255,.075)', borderColor: 'rgba(255,255,255,.14)', fontSize: 16, padding: '0 16px' }} />
          <div className={styles.upcomingFilter}><Checkbox name="upcoming" value="1" defaultChecked={upcomingOnly} label="Événement à venir" style={{ minHeight: 48, fontSize: 15, color: 'rgba(245,245,247,.75)' }} /></div>
          <Button type="submit" className={styles.submitButton} style={{ minHeight: 52, borderRadius: 14, background: '#b8f34a', color: '#142000', fontSize: 16 }}>Appliquer</Button>
        </form>
      </section>

      <section className={styles.directory} aria-labelledby="organizer-directory-title">
        <div className={styles.directoryHeader}>
          <div><p className={styles.sectionKicker}><SlidersHorizontal size={18} aria-hidden="true" /> Explorer</p><h2 id="organizer-directory-title">Tous les organisateurs</h2></div>
          <p className={styles.resultCount}>{filtered.length} profil{filtered.length > 1 ? 's' : ''}</p>
        </div>

        {hasFilters && <div className={styles.activeFilters}><p>Résultats selon vos critères</p><Link href="/organizers"><X size={17} aria-hidden="true" /> Effacer les filtres</Link></div>}

        {pageItems.length > 0 ? (
          <div className={styles.grid}>
            {pageItems.map((organizer, index) => {
              const zones = getEntityRegionIds(organizer).map(getRegionName).filter(Boolean)
              const isSelf = session?.user?.id === organizer.userId
              return (
                <article key={organizer.userId} className={styles.card}>
                  <Link href={`/organizers/${organizer.slug}`} className={styles.cardLink} aria-label={`Découvrir ${organizer.publicName}`}>
                    <div className={styles.visual}>
                      <Image src={organizer.bannerUrl || placeholderPhotoUrl(organizer.userId, 900, 600)} alt="" fill loading={index < 3 ? 'eager' : undefined} priority={index === 0} className={styles.cover} sizes="(max-width:680px) calc(100vw - 40px), (max-width:1020px) 46vw, 30vw" />
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
          <div className={styles.empty}><Search size={28} aria-hidden="true" /><h3>Aucun organisateur trouvé</h3><p>Élargissez la région ou essayez une autre recherche.</p><Link href="/organizers">Voir tous les organisateurs</Link></div>
        )}

        <PageLinks page={safePage} pageCount={pageCount} makeHref={makeHref} totalItems={filtered.length} pageSize={PAGE_SIZE} />
      </section>
    </main>
  )
}

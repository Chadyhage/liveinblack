import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowUpRight, Search, SlidersHorizontal, Sparkles, X } from 'lucide-react'
import { getCachedPublicProviders as listPublicProviders } from '@/lib/server/publicCache'
import { getProviderCategories, PROVIDER_CATEGORIES } from '@/lib/shared/providerCategories'
import { getEntityRegionIds, getRegionName, matchesEntityRegion, normalizeGeoText } from '@/lib/shared/locations'
import { regions } from '@/lib/shared/regions'
import { Button, HiddenField, Input, PageLinks, pageSlice } from '@/app/components/ui'
import FilterSelect from '../_components/FilterSelect'
import ProviderDirectoryCard from '../_components/ProviderDirectoryCard'
import styles from './providers.module.css'

const PAGE_SIZE = 24

export const metadata: Metadata = {
  title: 'Prestataires — LIVEINBLACK',
  description: 'Trouvez DJ, lieux, traiteurs et autres prestataires événementiels et contactez-les directement sur LIVEINBLACK.',
}

export const dynamic = 'force-dynamic'

export default async function PublicPrestatairesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; categorie?: string; region?: string; page?: string }>
}) {
  const { q, categorie, region = '', page: pageParam } = await searchParams
  const search = (q || '').trim()
  const category = categorie || ''
  const requestedPage = Math.max(1, Number(pageParam) || 1)
  const providers = await listPublicProviders()

  const filtered = providers.filter((provider) => {
    if (category && !getProviderCategories(provider).some((item) => item.id === category)) return false
    if (!matchesEntityRegion(provider, region)) return false
    if (!search) return true

    const regionNames = getEntityRegionIds(provider).map(getRegionName)
    const categoryNames = getProviderCategories(provider).flatMap((item) => [item.label, item.singular])
    const haystack = [provider.name, provider.headline, provider.city, provider.location, provider.country, provider.description, ...regionNames, ...categoryNames]
      .filter(Boolean)
      .map(normalizeGeoText)
      .join(' ')
    return haystack.includes(normalizeGeoText(search))
  })

  const counts = new Map<string, number>()
  for (const provider of providers) {
    for (const item of getProviderCategories(provider)) counts.set(item.id, (counts.get(item.id) || 0) + 1)
  }

  const { pageItems, pageCount, safePage } = pageSlice(filtered, requestedPage, PAGE_SIZE)
  const hasFilters = Boolean(search || category || region)

  function makeHref(page: number) {
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (category) params.set('categorie', category)
    if (region) params.set('region', region)
    if (page > 1) params.set('page', String(page))
    const query = params.toString()
    return query ? `/providers?${query}` : '/providers'
  }

  function categoryHref(categoryId?: string) {
    const params = new URLSearchParams()
    if (categoryId) params.set('categorie', categoryId)
    if (search) params.set('q', search)
    if (region) params.set('region', region)
    const query = params.toString()
    return query ? `/providers?${query}` : '/providers'
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero} aria-labelledby="providers-title">
        <p className={styles.eyebrow}>L’annuaire LIVEINBLACK</p>
        <h1 id="providers-title">Les talents derrière chaque expérience.</h1>
        <p className={styles.intro}>
          DJ, lieux, photographes, traiteurs et équipes techniques : trouvez le partenaire qui donnera vie à votre prochain événement.
        </p>

        <form action="/providers" method="get" role="search" className={styles.searchPanel}>
          {category && <HiddenField name="categorie" value={category} />}
          <div className={styles.searchField}>
            <Search size={22} strokeWidth={2} aria-hidden="true" />
            <Input
              type="search"
              name="q"
              defaultValue={search}
              placeholder="Prestataire, service ou ville"
              aria-label="Rechercher un prestataire"
              containerStyle={{ flex: 1, minWidth: 0 }}
              style={{ border: 0, background: 'transparent', boxShadow: 'none' }}
            />
            <Button type="submit" className={styles.searchButton} style={{ minWidth: 140, minHeight: 48, borderRadius: 13, background: '#b8f34a', color: '#142000', fontSize: 16 }}>
              <Search size={19} strokeWidth={2.2} aria-hidden="true" />
              <span>Rechercher</span>
            </Button>
          </div>
          <div className={styles.regionField}>
            <FilterSelect
              name="region"
              defaultValue={region}
              ariaLabel="Filtrer par région"
              options={[{ value: '', label: 'Toutes les régions' }, ...regions.map((item) => ({ value: item.id, label: `${item.flag} ${item.name}` }))]}
              style={{ minHeight: 56, borderRadius: 15, background: 'rgba(255,255,255,.075)', borderColor: 'rgba(255,255,255,.14)', fontSize: 16, padding: '0 16px' }}
            />
          </div>
          <Button type="submit" variant="secondary" className={styles.filterButton} style={{ minHeight: 56, borderRadius: 15, background: 'rgba(255,255,255,.08)', color: '#f5f5f7', fontSize: 16 }}>Appliquer</Button>
        </form>
      </section>

      <section className={styles.directory} aria-labelledby="directory-title">
        <div className={styles.directoryHeader}>
          <div>
            <p className={styles.sectionKicker}><SlidersHorizontal size={18} aria-hidden="true" /> Explorer</p>
            <h2 id="directory-title">Tous les prestataires</h2>
          </div>
          <p className={styles.resultCount} aria-live="polite">{filtered.length} profil{filtered.length > 1 ? 's' : ''}</p>
        </div>

        <nav className={styles.categories} aria-label="Filtrer par métier">
          <Link href={categoryHref()} className={`${styles.categoryChip} ${!category ? styles.categoryChipActive : ''}`} aria-current={!category ? 'page' : undefined}>
            Tous <span>{providers.length}</span>
          </Link>
          {PROVIDER_CATEGORIES.filter((item) => counts.get(item.id)).map((item) => (
            <Link
              key={item.id}
              href={categoryHref(item.id)}
              className={`${styles.categoryChip} ${category === item.id ? styles.categoryChipActive : ''}`}
              aria-current={category === item.id ? 'page' : undefined}
            >
              {item.label} <span>{counts.get(item.id) || 0}</span>
            </Link>
          ))}
        </nav>

        {hasFilters && (
          <div className={styles.activeFilters}>
            <p>
              {search && <>Recherche : <strong>« {search} »</strong></>}
              {search && (category || region) ? <span aria-hidden="true"> · </span> : null}
              {category && <>Métier : <strong>{PROVIDER_CATEGORIES.find((item) => item.id === category)?.label || category}</strong></>}
              {category && region ? <span aria-hidden="true"> · </span> : null}
              {region && <>Région : <strong>{getRegionName(region)}</strong></>}
            </p>
            <Link href="/providers"><X size={17} aria-hidden="true" /> Effacer les filtres</Link>
          </div>
        )}

        {pageItems.length > 0 ? (
          <div className={styles.grid}>
            {pageItems.map((provider, index) => (
              <ProviderDirectoryCard key={provider.userId} provider={provider} eager={index < 3} priority={index === 0} />
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <span aria-hidden="true"><Search size={28} /></span>
            <h3>Aucun prestataire trouvé</h3>
            <p>Élargissez la zone, changez de métier ou essayez une autre recherche.</p>
            <Link href="/providers">Voir tous les prestataires</Link>
          </div>
        )}

        <div className={styles.pagination}>
          <PageLinks page={safePage} pageCount={pageCount} makeHref={makeHref} totalItems={filtered.length} pageSize={PAGE_SIZE} />
        </div>

        <aside className={styles.cta}>
          <span className={styles.ctaIcon} aria-hidden="true"><Sparkles size={26} /></span>
          <div>
            <p className={styles.ctaKicker}>Professionnels</p>
            <h2>Votre savoir-faire mérite d’être vu.</h2>
            <p>Créez votre vitrine, présentez vos offres et échangez directement avec les organisateurs.</p>
          </div>
          <Link href="/provider-signup">Devenir prestataire <ArrowUpRight size={19} aria-hidden="true" /></Link>
        </aside>
      </section>
    </main>
  )
}

import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowUpRight, Search, SlidersHorizontal, Sparkles, X } from 'lucide-react'
import { getProviderCategories, PROVIDER_CATEGORIES } from '@/lib/shared/providerCategories'
import { getRegionName } from '@/lib/shared/locations'
import { regions } from '@/lib/shared/regions'
import { Button, HiddenField, Input, Mascot, PageLinks } from '@/app/components/ui'
import FilterSelect from '../_components/FilterSelect'
import ProviderDirectoryCard from '../_components/ProviderDirectoryCard'
import styles from './providers.module.css'
import { getCachedPublicProvidersDirectory } from '@/lib/server/publicCache'

const SITE = process.env.PUBLIC_SITE_URL || 'https://liveinblack.com'

export const metadata: Metadata = {
  title: 'Prestataires — LIVEINBLACK',
  description: 'Trouvez DJ, lieux, traiteurs et autres prestataires événementiels et contactez-les directement sur LIVEINBLACK.',
  alternates: { canonical: '/providers' },
  robots: { index: true, follow: true },
  openGraph: {
    url: '/providers',
    siteName: 'LIVEINBLACK',
    locale: 'fr_BJ',
    title: 'Prestataires événementiels au Bénin — LIVEINBLACK',
    description: 'Trouvez DJ, lieux, photographes, traiteurs et équipes techniques pour vos événements au Bénin.',
  },
}

export const revalidate = 45

export default async function PublicPrestatairesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; categorie?: string; region?: string; page?: string }>
}) {
  const { q, categorie, region = '', page: pageParam } = await searchParams
  const search = (q || '').trim()
  const category = categorie || ''
  const requestedPage = Math.max(1, Number(pageParam) || 1)
  const { providers, total, pageSize, totalPages } = await getCachedPublicProvidersDirectory({
    q: search,
    categorie: category,
    region,
    page: requestedPage,
    pageSize: 24,
    includeTotal: true,
  })

  const filtered = providers

  const counts = new Map<string, number>()
  for (const provider of filtered) {
    for (const item of getProviderCategories(provider)) counts.set(item.id, (counts.get(item.id) || 0) + 1)
  }

  const safePage = requestedPage
  const hasFilters = Boolean(search || category || region)
  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    '@id': `${SITE}/providers#itemlist`,
    name: 'Prestataires événementiels au Bénin sur LIVEINBLACK',
    inLanguage: 'fr-BJ',
    numberOfItems: filtered.length,
    itemListElement: filtered.map((provider, index) => ({
      '@type': 'ListItem',
      position: (safePage - 1) * pageSize + index + 1,
      url: `${SITE}/providers/${encodeURIComponent(provider.userId)}`,
      name: provider.name,
      item: {
        '@type': 'ProfessionalService',
        '@id': `${SITE}/providers/${encodeURIComponent(provider.userId)}`,
        name: provider.name,
        url: `${SITE}/providers/${encodeURIComponent(provider.userId)}`,
        areaServed: provider.country || 'Bénin',
        address: provider.city || provider.location ? {
          '@type': 'PostalAddress',
          addressLocality: provider.city || provider.location,
          addressCountry: provider.country || 'BJ',
        } : undefined,
      },
    })),
  }

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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd).replace(/</g, '\\u003c') }} />
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
            <Button type="submit" className={styles.searchButton} style={{ minWidth: 136, minHeight: 40, borderRadius: 13, background: 'var(--primary)', color: 'var(--primary-ink)', fontSize: 'var(--font-size-body-lg)' }}>
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
              style={{ minHeight: 40, borderRadius: 15, background: 'var(--field-bg)', borderColor: 'var(--border)', fontSize: 'var(--font-size-body-sm)', padding: '0 14px' }}
            />
          </div>
          <Button type="submit" variant="secondary" className={styles.filterButton} style={{ minHeight: 40, borderRadius: 15, background: 'var(--fill-secondary)', color: 'var(--text)', fontSize: 'var(--font-size-body-lg)' }}>Appliquer</Button>
        </form>
      </section>

      <section className={styles.directory} aria-labelledby="directory-title">
        <div className={styles.directoryHeader}>
          <div>
            <p className={styles.sectionKicker}><SlidersHorizontal size={18} aria-hidden="true" /> Explorer</p>
            <h2 id="directory-title">Tous les prestataires</h2>
          </div>
          <p className={styles.resultCount} aria-live="polite">{filtered.length} profil{filtered.length > 1 ? 's' : ''}</p>
          <p style={{ color: 'var(--text-muted)' }} aria-live="polite">{total} résultat{total > 1 ? 's' : ''} au total</p>
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

        {filtered.length > 0 ? (
          <div className={styles.grid}>
            {filtered.map((provider, index) => (
              <ProviderDirectoryCard key={provider.userId} provider={provider} eager={index < 4} />
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <Mascot mood="search" size={164} />
            <h3>Aucun prestataire trouvé</h3>
            <p>Élargissez la zone, changez de métier ou essayez une autre recherche.</p>
            <Link href="/providers">Voir tous les prestataires</Link>
          </div>
        )}

        <div className={styles.pagination}>
          <PageLinks page={safePage} pageCount={totalPages} makeHref={makeHref} totalItems={total} pageSize={pageSize} />
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

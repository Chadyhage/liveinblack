import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'
import { ArrowUpRight, Search, SlidersHorizontal, Sparkles, X } from 'lucide-react'
import { getProviderCategories, PROVIDER_CATEGORIES } from '@/lib/shared/providerCategories'
import { getRegionName } from '@/lib/shared/locations'
import { regions } from '@/lib/shared/regions'
import { Button, HiddenField, Input, PageLinks } from '@/app/components/ui'
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
        <p className={styles.heroEyebrow}>L’annuaire des professionnels</p>
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
            <Button type="submit" className={styles.searchButton}>
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
              style={{ minHeight: 42, borderRadius: 'var(--radius-control)', background: 'var(--field-bg)', borderColor: 'var(--border)', fontSize: 'var(--font-size-body-sm)', padding: '0 14px' }}
            />
          </div>
          <Button type="submit" variant="secondary" className={styles.filterButton}>Appliquer</Button>
        </form>
      </section>

      <section className={styles.directory} aria-labelledby="directory-title">
        <div className={styles.directoryHeader}>
          <div>
            <p className={styles.sectionKicker}><SlidersHorizontal size={18} aria-hidden="true" /> Explorer</p>
            <h2 id="directory-title">Tous les prestataires</h2>
          </div>
          <p className={styles.resultCount} aria-live="polite">{total} profil{total > 1 ? 's' : ''}</p>
        </div>

        {(total > 0 || hasFilters) && (
          <nav className={styles.categories} aria-label="Filtrer par métier">
            <Link href={categoryHref()} className={`${styles.categoryChip} ${!category ? styles.categoryChipActive : ''}`} aria-current={!category ? 'page' : undefined}>
              Tous <span>{total}</span>
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
        )}

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
            <div className={styles.emptyVisual} aria-hidden="true">
              <Image
                src="https://images.unsplash.com/photo-1598387993441-a364f854c3e1?auto=format&fit=crop&w=1200&q=80"
                alt=""
                fill
                className={styles.emptyImage}
                sizes="(max-width: 680px) 100vw, 38vw"
              />
              <span>Talents</span>
            </div>
            <div className={styles.emptyContent}>
              <p className={styles.emptyEyebrow}>{hasFilters ? 'Aucun résultat' : 'Annuaire en préparation'}</p>
              <h3>{hasFilters ? 'Aucun professionnel ne correspond à ces critères.' : 'Les talents qui font vivre vos événements arrivent.'}</h3>
              <p>{hasFilters ? 'Essayez un autre métier, une autre région ou repartez de tout l’annuaire.' : 'DJ, lieux, image, son et création rejoignent progressivement notre sélection.'}</p>
              <Link href={hasFilters ? '/providers' : '/provider-signup'}>
                {hasFilters ? 'Effacer les filtres' : 'Proposer mes services'} <span aria-hidden="true">↗</span>
              </Link>
            </div>
          </div>
        )}

        <div className={styles.pagination}>
          <PageLinks page={safePage} pageCount={totalPages} makeHref={makeHref} totalItems={total} pageSize={pageSize} />
        </div>

        {filtered.length > 0 && (
          <aside className={styles.cta}>
            <span className={styles.ctaIcon} aria-hidden="true"><Sparkles size={26} /></span>
            <div>
              <p className={styles.ctaKicker}>Professionnels</p>
              <h2>Votre savoir-faire mérite d’être vu.</h2>
              <p>Créez votre vitrine, présentez vos offres et échangez directement avec les organisateurs.</p>
            </div>
            <Link href="/provider-signup">Devenir prestataire <ArrowUpRight size={19} aria-hidden="true" /></Link>
          </aside>
        )}
      </section>
    </main>
  )
}

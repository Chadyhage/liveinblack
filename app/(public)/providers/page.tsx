import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'
import { Star } from 'lucide-react'
import { getCachedPublicProviders as listPublicProviders } from '@/lib/server/publicCache'
import { getProviderCategories, getProviderCategory, PROVIDER_CATEGORIES } from '@/lib/shared/providerCategories'
import { getEntityRegionIds, getRegionName, matchesEntityRegion, normalizeGeoText } from '@/lib/shared/locations'
import { regions } from '@/lib/shared/regions'
import FilterSelect from '../_components/FilterSelect'
import { Button, Input, PageLinks, pageSlice } from '@/app/components/ui'

const PAGE_SIZE = 24

export const metadata: Metadata = {
  title: 'Prestataires — LIVEINBLACK',
  description: 'Trouvez DJ, lieux, traiteurs et autres prestataires événementiels et contactez-les directement sur LIVEINBLACK.',
}

export const dynamic = 'force-dynamic'

function firstCatalogImage(catalog: { available?: boolean; media?: { url?: string; type?: string }[] }[] | null | undefined): string | null {
  for (const item of catalog || []) {
    if (item.available === false) continue
    const image = item.media?.find((media) => media.url && media.type !== 'video')
    if (image?.url) return image.url
  }
  return null
}

// Port de src/pages/PublicPrestataires.jsx — annuaire public des prestataires.
export default async function PublicPrestatairesPage({ searchParams }: { searchParams: Promise<{ q?: string; categorie?: string; region?: string; page?: string }> }) {
  const { q, categorie, region = '', page: pageParam } = await searchParams
  const search = (q || '').trim()
  const category = categorie || ''
  const requestedPage = Math.max(1, Number(pageParam) || 1)

  const providers = await listPublicProviders()

  const filtered = providers.filter((p) => {
    if (category && !getProviderCategories(p).some((c) => c.id === category)) return false
    if (!matchesEntityRegion(p, region)) return false
    if (search) {
      const regionNames = getEntityRegionIds(p).map(getRegionName)
      const categoryNames = getProviderCategories(p).flatMap((item) => [item.label, item.singular])
      const hay = [p.name, p.headline, p.city, p.location, p.country, p.description, ...regionNames, ...categoryNames].filter(Boolean).map(normalizeGeoText).join(' ')
      if (!hay.includes(normalizeGeoText(search))) return false
    }
    return true
  })

  const counts = new Map<string, number>()
  for (const p of providers) {
    for (const c of getProviderCategories(p)) counts.set(c.id, (counts.get(c.id) || 0) + 1)
  }

  const { pageItems: paged, pageCount, safePage } = pageSlice(filtered, requestedPage, PAGE_SIZE)
  function makeHref(p: number) {
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (category) params.set('categorie', category)
    if (region) params.set('region', region)
    if (p > 1) params.set('page', String(p))
    const qs = params.toString()
    return qs ? `/providers?${qs}` : '/providers'
  }

  return (
    <main className="provider-directory" style={{ padding: '56px clamp(20px, 3vw, 48px) 88px', width: '100%', minHeight: '100vh' }}>
      <style>{`
        .provider-directory__filters{display:grid;grid-template-columns:minmax(320px,1.6fr) minmax(220px,.7fr) auto;gap:10px;margin:0 0 22px}
        .provider-directory__field{min-width:0;padding:11px 14px;border-radius:var(--radius-pill);border:1px solid var(--border-strong);background:#0b0c12;color:var(--text);font-size:13.5px}
        .provider-directory__grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));gap:clamp(18px,2vw,26px)}
        .provider-directory__grid:has(>.lb-card:only-child){grid-template-columns:minmax(min(100%,360px),560px)}
        @media(max-width:620px){.provider-directory{padding:32px 14px 96px!important}.provider-directory__filters{grid-template-columns:1fr}.provider-directory__filters button{width:100%;min-height:44px}.provider-directory__grid{grid-template-columns:1fr}}
      `}</style>
      <div style={{ maxWidth: 1480, margin: '0 auto' }}>
      <header className="lb-directory-hero">
        <p style={{ margin: 0, color: 'var(--gold)', fontSize: 14, fontWeight: 400, letterSpacing: '3.2px', textTransform: 'uppercase', fontFamily: 'var(--font-display), sans-serif' }}>L&apos;annuaire</p>
        <h1 className="font-display" style={{ fontSize: 'clamp(34px, 7.5vw, 58px)', lineHeight: 1, letterSpacing: '.01em', margin: '10px 0 0' }}>Les prestataires qui font<br /><span style={{ color: 'var(--gold)' }}>vivre la nuit.</span></h1>
        <p style={{ maxWidth: 620, margin: '16px 0 0', color: 'var(--text-muted)', fontSize: 15, lineHeight: 1.6 }}>DJ, salles, sono, photo, boissons : trouve le bon partenaire et découvre directement ses offres.</p>
      </header>

      <form action="/providers" method="get" className="provider-directory__filters lb-directory-filters">
        {category && <input type="hidden" name="categorie" value={category} />}
        <Input
          type="text"
          name="q"
          defaultValue={search}
          placeholder="Rechercher un prestataire, une ville…"
          style={{ minWidth: 0, borderRadius: 'var(--radius-pill)', background: '#0b0c12', fontSize: 13.5 }}
        />
        <FilterSelect
          name="region"
          defaultValue={region}
          ariaLabel="Filtrer par région"
          options={[{ value: '', label: 'Toutes les régions' }, ...regions.map((item) => ({ value: item.id, label: `${item.flag} ${item.name}` }))]}
          style={{ borderRadius: 'var(--radius-pill)', background: '#0b0c12', fontSize: 13.5 }}
        />
        <Button
          type="submit"
          variant="primary"
          style={{ flexShrink: 0, minHeight: 46, padding: '12px 20px', borderRadius: 999, textTransform: 'none', letterSpacing: 'normal', fontSize: 13 }}
        >
          Filtrer
        </Button>
      </form>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        <CategoryChip label={`Tous (${providers.length})`} href={`/providers?${new URLSearchParams({ ...(search ? { q: search } : {}), ...(region ? { region } : {}) }).toString()}`} active={!category} />
        {PROVIDER_CATEGORIES.filter((c) => counts.get(c.id)).map((c) => (
          <CategoryChip
            key={c.id}
            label={`${c.label} (${counts.get(c.id) || 0})`}
            href={`/providers?${new URLSearchParams({ categorie: c.id, ...(search ? { q: search } : {}), ...(region ? { region } : {}) }).toString()}`}
            active={category === c.id}
            color={c.color}
          />
        ))}
      </div>

      {filtered.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>Aucun prestataire ne correspond à ta recherche.</p>
      ) : (
        <div className="provider-directory__grid">
          {paged.map((p) => {
            const categories = getProviderCategories(p)
            const pc = categories[0] || getProviderCategory(p.prestataireType)
            const visibleCatalog = (p.catalog || []).filter((item) => item.available !== false)
            const coverImage = p.coverUrl || firstCatalogImage(p.catalog)
            return (
              <Link
                key={p.userId}
                href={`/providers/${encodeURIComponent(p.userId)}`}
                className="lb-card"
                style={{ display: 'flex', flexDirection: 'column', minHeight: 410, textDecoration: 'none', color: 'inherit', background: 'linear-gradient(180deg,var(--surface-2),var(--surface))', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-xl)', overflow: 'hidden', boxShadow: '0 18px 48px rgba(0,0,0,.24)' }}
              >
                <div style={{ position: 'relative', minHeight: 190, background: `linear-gradient(135deg, ${pc.color}44, ${pc.color}12 55%, var(--obsidian))` }}>
                  {coverImage && (
                    <Image src={coverImage} alt="" fill style={{ objectFit: 'cover' }} sizes="(max-width: 768px) 100vw, 230px" />
                  )}
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(4,4,11,.88), transparent 64%)' }} />
                  <span
                    style={{
                      position: 'absolute',
                      top: 10,
                      left: 10,
                      maxWidth: 'calc(100% - 20px)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      fontSize: 10.5,
                      fontWeight: 800,
                      color: '#fff',
                      background: `${pc.color}cc`,
                      padding: '4px 9px',
                      borderRadius: 999,
                    }}
                  >
                    {pc.label}
                    {categories.length > 1 ? ` +${categories.length - 1}` : ''}
                  </span>
                  <div style={{ position: 'absolute', left: 20, bottom: -30, width: 68, height: 68, borderRadius: '50%', border: '3px solid var(--surface)', overflow: 'hidden', background: pc.color, display: 'grid', placeItems: 'center', color: '#04120e', fontSize: 24, fontWeight: 800, boxShadow: '0 10px 24px rgba(0,0,0,.32)' }}>
                    {p.photoUrl ? (
                      <Image src={p.photoUrl} alt={p.name} width={68} height={68} style={{ objectFit: 'cover' }} />
                    ) : p.name?.[0]?.toUpperCase()}
                  </div>
                </div>
                <div style={{ padding: '42px 22px 24px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <p style={{ fontSize: 20, lineHeight: 1.2, fontWeight: 800, margin: 0 }}>{p.name}</p>
                  {p.headline && <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '7px 0 0', lineHeight: 1.45 }}>{p.headline}</p>}
                  {(p.city || p.location || p.country) && <p style={{ fontSize: 13, color: 'var(--gold)', margin: '8px 0 0', fontWeight: 700 }}>{[p.city || p.location, p.country].filter(Boolean).join(' · ')}</p>}
                  {p.description && <p style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--text-faint)', margin: '14px 0 0', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.description}</p>}
                  <div style={{ marginTop: 'auto', paddingTop: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTop: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 700 }}>{visibleCatalog.length > 0 ? `${visibleCatalog.length} offre${visibleCatalog.length !== 1 ? 's' : ''}` : 'Voir le profil'}</span>
                    {(p.ratingCount || 0) > 0 && <span style={{ fontSize: 13, color: 'var(--gold)', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 5 }}><Star size={14} fill="currentColor" /> {(p.ratingAvg || 0).toFixed(1)} · {p.ratingCount}</span>}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      <PageLinks page={safePage} pageCount={pageCount} makeHref={makeHref} totalItems={filtered.length} pageSize={PAGE_SIZE} />

      <section style={{ maxWidth: 820, margin: '54px auto 0', padding: '36px 24px', textAlign: 'center', borderRadius: 20, border: '1px solid rgba(184, 243, 74,.3)', background: 'var(--surface)' }}>
        <h2 className="font-display" style={{ margin: 0, fontSize: 32, letterSpacing: '.01em' }}>Tu es prestataire ?</h2>
        <p style={{ maxWidth: 500, margin: '10px auto 20px', color: 'var(--text-muted)', lineHeight: 1.6 }}>Crée ta vitrine, présente ton catalogue et échange directement avec les organisateurs.</p>
        <Link href="/provider-signup" style={{ display: 'inline-block', padding: '13px 22px', borderRadius: 999, background: 'var(--primary)', color: 'var(--primary-ink)', textDecoration: 'none', fontWeight: 700, textTransform: 'none', letterSpacing: 'normal', fontSize: 13.5 }}>Devenir prestataire</Link>
      </section>
      </div>
    </main>
  )
}

function CategoryChip({ label, href, active, color }: { label: string; href: string; active: boolean; color?: string }) {
  return (
    <Link
      href={href}
      style={{
        minHeight: 44,
        display: 'inline-flex',
        alignItems: 'center',
        fontSize: 12.5,
        fontWeight: 700,
        padding: '7px 14px',
        borderRadius: 999,
        textDecoration: 'none',
        color: active ? '#04120e' : 'var(--text)',
        background: active ? color || 'var(--teal-solid)' : 'var(--surface)',
        border: `1px solid ${active ? 'transparent' : 'var(--border-strong)'}`,
      }}
    >
      {label}
    </Link>
  )
}

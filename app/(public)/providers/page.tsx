import Link from 'next/link'
import type { Metadata } from 'next'
import { listPublicProviders } from '@/lib/server/providers'
import { getProviderCategories, getProviderCategory, PROVIDER_CATEGORIES } from '@/lib/shared/providerCategories'
import { getEntityRegionIds, getRegionName, matchesEntityRegion, normalizeGeoText } from '@/lib/shared/locations'
import { regions } from '@/lib/shared/regions'

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
export default async function PublicPrestatairesPage({ searchParams }: { searchParams: Promise<{ q?: string; categorie?: string; region?: string }> }) {
  const { q, categorie, region = '' } = await searchParams
  const search = (q || '').trim()
  const category = categorie || ''

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

  return (
    <main className="provider-directory" style={{ padding: '46px 22px 76px', width: '100%', minHeight: '100vh', background: 'radial-gradient(circle 760px at 5% 0%, rgba(139,92,246,.16), transparent 65%), radial-gradient(circle 760px at 96% 24%, rgba(200,169,110,.12), transparent 62%)' }}>
      <style>{`
        .provider-directory__filters{display:grid;grid-template-columns:minmax(220px,1fr) minmax(170px,.45fr) auto;gap:8px;max-width:760px;margin:0 auto 18px}
        .provider-directory__field{min-width:0;padding:11px 14px;border-radius:var(--radius-pill);border:1px solid var(--border-strong);background:#0b0c12;color:var(--text);font-size:13.5px}
        @media(max-width:620px){.provider-directory{padding:32px 14px 96px!important}.provider-directory__filters{grid-template-columns:1fr}.provider-directory__filters button{width:100%;min-height:42px}}
      `}</style>
      <div style={{ maxWidth: 1120, margin: '0 auto' }}>
      <header style={{ textAlign: 'center', marginBottom: 26 }}>
        <p style={{ margin: 0, color: 'var(--gold)', fontSize: 11, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase' }}>L&apos;annuaire</p>
        <h1 style={{ fontSize: 'clamp(32px, 7vw, 54px)', lineHeight: 1.02, letterSpacing: '-.04em', margin: '10px 0 0' }}>Les prestataires qui font<br /><span style={{ color: 'var(--gold)' }}>vivre la nuit.</span></h1>
        <p style={{ maxWidth: 560, margin: '16px auto 0', color: 'var(--text-muted)', fontSize: 15, lineHeight: 1.6 }}>DJ, salles, sono, photo, boissons : trouve le bon partenaire et découvre directement ses offres.</p>
      </header>

      <form action="/providers" method="get" className="provider-directory__filters">
        {category && <input type="hidden" name="categorie" value={category} />}
        <input
          className="provider-directory__field"
          type="text"
          name="q"
          defaultValue={search}
          placeholder="Rechercher un prestataire, une ville…"
        />
        <select className="provider-directory__field" name="region" defaultValue={region} aria-label="Filtrer par région">
          <option value="">Toutes les régions</option>
          {regions.map((item) => <option key={item.id} value={item.id}>{item.flag} {item.name}</option>)}
        </select>
        <button type="submit" style={{ flexShrink: 0, padding: '11px 18px', borderRadius: 999, border: 'none', background: 'var(--teal-solid)', color: '#04120e', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>
          Filtrer
        </button>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 16 }}>
          {filtered.map((p) => {
            const categories = getProviderCategories(p)
            const pc = categories[0] || getProviderCategory(p.prestataireType)
            const visibleCatalog = (p.catalog || []).filter((item) => item.available !== false)
            const coverImage = p.coverUrl || firstCatalogImage(p.catalog)
            return (
              <Link
                key={p.userId}
                href={`/providers/${encodeURIComponent(p.userId)}`}
                style={{ display: 'flex', flexDirection: 'column', textDecoration: 'none', color: 'inherit', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}
              >
                <div style={{ position: 'relative', height: 120, background: `linear-gradient(135deg, ${pc.color}44, ${pc.color}12 55%, var(--obsidian))` }}>
                  {coverImage && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={coverImage} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
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
                  <div style={{ position: 'absolute', left: 14, bottom: -22, width: 52, height: 52, borderRadius: '50%', border: '2px solid var(--surface)', overflow: 'hidden', background: pc.color, display: 'grid', placeItems: 'center', color: '#04120e', fontSize: 20, fontWeight: 800 }}>
                    {p.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.photoUrl} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : p.name?.[0]?.toUpperCase()}
                  </div>
                </div>
                <div style={{ padding: '30px 14px 15px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <p style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>{p.name}</p>
                  {p.headline && <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '4px 0 0' }}>{p.headline}</p>}
                  {(p.city || p.location || p.country) && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>{[p.city || p.location, p.country].filter(Boolean).join(' · ')}</p>}
                  {p.description && <p style={{ fontSize: 12.5, color: 'var(--text-faint)', margin: '8px 0 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.description}</p>}
                  {visibleCatalog.length > 0 && <p style={{ fontSize: 11.5, color: 'var(--text-faint)', fontWeight: 700, margin: '12px 0 0' }}>{visibleCatalog.length} offre{visibleCatalog.length !== 1 ? 's' : ''} au catalogue</p>}
                  {(p.ratingCount || 0) > 0 && <p style={{ fontSize: 11.5, color: 'var(--gold)', fontWeight: 800, margin: '6px 0 0' }}>★ {(p.ratingAvg || 0).toFixed(1)} · {p.ratingCount} avis</p>}
                </div>
              </Link>
            )
          })}
        </div>
      )}
      <section style={{ maxWidth: 820, margin: '54px auto 0', padding: '36px 24px', textAlign: 'center', borderRadius: 20, border: '1px solid rgba(200,169,110,.3)', background: 'var(--surface)' }}>
        <h2 style={{ margin: 0, fontSize: 28 }}>Tu es prestataire ?</h2>
        <p style={{ maxWidth: 500, margin: '10px auto 20px', color: 'var(--text-muted)', lineHeight: 1.6 }}>Crée ta vitrine, présente ton catalogue et échange directement avec les organisateurs.</p>
        <Link href="/provider-signup" style={{ display: 'inline-block', padding: '12px 19px', borderRadius: 11, background: 'var(--gold)', color: '#090a0f', textDecoration: 'none', fontWeight: 800 }}>Devenir prestataire</Link>
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

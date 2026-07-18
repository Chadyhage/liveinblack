import Link from 'next/link'
import { listPublicProviders } from '@/lib/server/providers'
import { getProviderCategories, getProviderCategory, PROVIDER_CATEGORIES } from '@/lib/shared/providerCategories'
import { normalizeGeoText } from '@/lib/shared/locations'

export const dynamic = 'force-dynamic'

// Port de src/pages/PublicPrestataires.jsx — annuaire public des prestataires.
export default async function PublicPrestatairesPage({ searchParams }: { searchParams: Promise<{ q?: string; categorie?: string }> }) {
  const { q, categorie } = await searchParams
  const search = (q || '').trim()
  const category = categorie || ''

  const providers = await listPublicProviders()

  const filtered = providers.filter((p) => {
    if (category && !getProviderCategories(p).some((c) => c.id === category)) return false
    if (search) {
      const hay = [p.name, p.city, p.location, p.country, p.description].filter(Boolean).map(normalizeGeoText).join(' ')
      if (!hay.includes(normalizeGeoText(search))) return false
    }
    return true
  })

  const counts = new Map<string, number>()
  for (const p of providers) {
    for (const c of getProviderCategories(p)) counts.set(c.id, (counts.get(c.id) || 0) + 1)
  }

  return (
    <div style={{ padding: '28px 22px 60px', maxWidth: 1120, margin: '0 auto', width: '100%' }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 16px' }}>Prestataires</h1>

      <form action="/providers" method="get" style={{ display: 'flex', gap: 8, maxWidth: 420, marginBottom: 18 }}>
        {category && <input type="hidden" name="categorie" value={category} />}
        <input
          type="text"
          name="q"
          defaultValue={search}
          placeholder="Rechercher un prestataire, une ville…"
          style={{ flex: 1, padding: '11px 14px', borderRadius: 10, border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13.5 }}
        />
        <button type="submit" style={{ padding: '11px 18px', borderRadius: 10, border: 'none', background: 'var(--teal-solid)', color: '#04120e', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>
          Chercher
        </button>
      </form>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        <CategoryChip label={`Tous (${providers.length})`} href={`/providers${search ? `?q=${encodeURIComponent(search)}` : ''}`} active={!category} />
        {PROVIDER_CATEGORIES.filter((c) => counts.get(c.id)).map((c) => (
          <CategoryChip
            key={c.id}
            label={`${c.label} (${counts.get(c.id) || 0})`}
            href={`/providers?categorie=${c.id}${search ? `&q=${encodeURIComponent(search)}` : ''}`}
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
            return (
              <Link
                key={p.userId}
                href={`/providers/${encodeURIComponent(p.userId)}`}
                style={{ display: 'flex', flexDirection: 'column', textDecoration: 'none', color: 'inherit', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}
              >
                <div style={{ position: 'relative', height: 110, background: `linear-gradient(135deg, ${pc.color}44, ${pc.color}12 55%, var(--obsidian))` }}>
                  {p.coverUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.coverUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                  )}
                  <span style={{ position: 'absolute', top: 10, left: 10, fontSize: 10.5, fontWeight: 800, color: '#fff', background: `${pc.color}cc`, padding: '4px 9px', borderRadius: 999 }}>
                    {pc.label}
                    {categories.length > 1 ? ` +${categories.length - 1}` : ''}
                  </span>
                </div>
                <div style={{ padding: '14px' }}>
                  <p style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>{p.name}</p>
                  {(p.city || p.location || p.country) && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>{[p.city || p.location, p.country].filter(Boolean).join(' · ')}</p>}
                  {p.description && <p style={{ fontSize: 12.5, color: 'var(--text-faint)', margin: '8px 0 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.description}</p>}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
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

import Link from 'next/link'
import type { Metadata } from 'next'
import { listPublicOrganizers } from '@/lib/server/organizers'
import { normalizeGeoText, getEntityRegionIds, getRegionName } from '@/lib/shared/locations'

export const metadata: Metadata = {
  title: 'Organisateurs — LIVEINBLACK',
  description: "Découvrez les organisateurs d'événements et de soirées et suivez ceux qui font la nuit sur LIVEINBLACK.",
}

export const dynamic = 'force-dynamic'

// Port de src/pages/PublicOrganizers.jsx — annuaire public des organisateurs.
// Simplification assumée : pas de "prochain événement" en teaser sur la carte
// (nécessiterait une requête events par organisateur pour chaque carte de la
// liste — coûteux ici ; affiché sur la page profil individuelle à la place).
export default async function PublicOrganizersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams
  const search = (q || '').trim()

  const organizers = await listPublicOrganizers()
  const filtered = organizers.filter((o) => {
    if (!search) return true
    const hay = [o.publicName, o.city, o.country, o.shortDescription].filter(Boolean).map(normalizeGeoText).join(' ')
    return hay.includes(normalizeGeoText(search))
  })

  return (
    <div style={{ padding: '28px 22px 60px', maxWidth: 1120, margin: '0 auto', width: '100%' }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 16px' }}>Organisateurs</h1>

      <form action="/organizers" method="get" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxWidth: 420, marginBottom: 24 }}>
        <input
          type="text"
          name="q"
          defaultValue={search}
          placeholder="Rechercher un organisateur, une ville…"
          style={{ flex: '1 1 220px', minWidth: 0, padding: '11px 14px', borderRadius: 10, border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13.5 }}
        />
        <button type="submit" style={{ flexShrink: 0, padding: '11px 18px', borderRadius: 10, border: 'none', background: 'var(--teal-solid)', color: '#04120e', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>
          Chercher
        </button>
      </form>

      {filtered.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>Aucun organisateur ne correspond à ta recherche.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
          {filtered.map((o) => {
            const zones = getEntityRegionIds(o).map(getRegionName).filter(Boolean)
            return (
              <Link
                key={o.userId}
                href={`/organizers/${o.slug}`}
                style={{ display: 'flex', flexDirection: 'column', textDecoration: 'none', color: 'inherit', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}
              >
                <div style={{ position: 'relative', height: 90, background: 'linear-gradient(135deg, rgba(139,92,246,.3), var(--obsidian))' }}>
                  {o.bannerUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={o.bannerUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                  )}
                  <div style={{ position: 'absolute', left: 12, bottom: -18, width: 42, height: 42, borderRadius: '50%', border: '2px solid #0b0d16', overflow: 'hidden', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
                    {o.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={o.avatarUrl} alt={o.publicName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      o.publicName?.[0]?.toUpperCase()
                    )}
                  </div>
                </div>
                <div style={{ padding: '24px 14px 14px', flex: 1 }}>
                  <p style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>{o.publicName}</p>
                  {(o.city || zones.length) && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '3px 0 0' }}>{[o.city, ...zones].filter(Boolean).slice(0, 2).join(' · ')}</p>}
                  {o.shortDescription && <p style={{ fontSize: 12.5, color: 'var(--text-faint)', margin: '8px 0 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{o.shortDescription}</p>}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

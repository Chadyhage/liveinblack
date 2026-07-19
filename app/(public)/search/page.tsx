import Link from 'next/link'
import type { Metadata } from 'next'
import { listPublicEvents } from '@/lib/server/events'
import { listPublicProviders } from '@/lib/server/providers'
import { listPublicOrganizers } from '@/lib/server/organizers'
import { normalizeGeoText, getEntityRegionIds, getRegionName } from '@/lib/shared/locations'
import { getProviderCategories } from '@/lib/shared/providerCategories'
import EventListCard from '../_components/EventListCard'

export const metadata: Metadata = {
  title: 'Recherche — LIVEINBLACK',
  description: 'Recherchez événements, prestataires et organisateurs en un seul endroit sur LIVEINBLACK.',
}

export const dynamic = 'force-dynamic'

const RESULTS_CAP = 8

// Port de src/pages/GlobalSearchPage.jsx — recherche texte simple à travers
// événements, organisateurs et prestataires (remplace la recherche
// client-side sur snapshots Firestore par une requête + filtrage serveur).
export default async function GlobalSearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams
  const query = (q || '').trim()
  const normalized = normalizeGeoText(query)

  const [events, providers, organizers] = query
    ? await Promise.all([listPublicEvents(), listPublicProviders(), listPublicOrganizers()])
    : [[], [], []]

  const matchedEvents = query
    ? events
        .filter((e) => [e.name, e.city, e.region, e.category, e.subtitle, e.description].filter(Boolean).map(normalizeGeoText).join(' ').includes(normalized))
        .slice(0, RESULTS_CAP)
    : []

  const matchedOrganizers = query
    ? organizers
        .filter((o) => {
          const zones = getEntityRegionIds(o).map(getRegionName)
          return [o.publicName, o.city, o.country, o.shortDescription, o.longDescription, ...zones].filter(Boolean).map(normalizeGeoText).join(' ').includes(normalized)
        })
        .slice(0, RESULTS_CAP)
    : []

  const matchedProviders = query
    ? providers
        .filter((p) => {
          const categoryLabels = getProviderCategories(p).map((c) => c.label)
          const zones = getEntityRegionIds(p).map(getRegionName)
          return [p.name, p.city, p.location, p.country, p.description, ...categoryLabels, ...zones].filter(Boolean).map(normalizeGeoText).join(' ').includes(normalized)
        })
        .slice(0, RESULTS_CAP)
    : []

  const totalResults = matchedEvents.length + matchedOrganizers.length + matchedProviders.length

  return (
    <div style={{ padding: '28px 22px 60px', maxWidth: 1120, margin: '0 auto', width: '100%' }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 16px' }}>Recherche</h1>
      <form action="/search" method="get" style={{ display: 'flex', gap: 8, maxWidth: 480, marginBottom: 28 }}>
        <input
          type="text"
          name="q"
          defaultValue={query}
          placeholder="Événements, organisateurs, prestataires…"
          style={{ flex: 1, padding: '11px 14px', borderRadius: 10, border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13.5 }}
          autoFocus
        />
        <button type="submit" style={{ padding: '11px 18px', borderRadius: 10, border: 'none', background: 'var(--teal-solid)', color: '#04120e', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>
          Chercher
        </button>
      </form>

      {!query ? (
        <p style={{ color: 'var(--text-muted)' }}>Tape un mot-clé pour rechercher un événement, un organisateur ou un prestataire.</p>
      ) : totalResults === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>Aucun résultat pour « {query} ».</p>
      ) : (
        <>
          {matchedEvents.length > 0 && (
            <ResultSection title="Événements">
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {matchedEvents.map((e) => (
                  <EventListCard key={e.id} event={e} />
                ))}
              </div>
            </ResultSection>
          )}

          {matchedOrganizers.length > 0 && (
            <ResultSection title="Organisateurs">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {matchedOrganizers.map((o) => (
                  <Link
                    key={o.userId}
                    href={`/organizers/${o.slug}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}
                  >
                    <span style={{ fontSize: 13.5, fontWeight: 700 }}>{o.publicName}</span>
                    {o.city && <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{o.city}</span>}
                  </Link>
                ))}
              </div>
            </ResultSection>
          )}

          {matchedProviders.length > 0 && (
            <ResultSection title="Prestataires">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {matchedProviders.map((p) => (
                  <Link
                    key={p.userId}
                    href={`/providers/${encodeURIComponent(p.userId)}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}
                  >
                    <span style={{ fontSize: 13.5, fontWeight: 700 }}>{p.name}</span>
                    {(p.city || p.location) && <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{p.city || p.location}</span>}
                  </Link>
                ))}
              </div>
            </ResultSection>
          )}
        </>
      )}
    </div>
  )
}

function ResultSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 30 }}>
      <h2 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 12px' }}>{title}</h2>
      {children}
    </section>
  )
}

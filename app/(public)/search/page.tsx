import Link from 'next/link'
import type { Metadata } from 'next'
import {
  getCachedPublicEvents as listPublicEvents,
  getCachedPublicProviders as listPublicProviders,
  getCachedPublicOrganizers as listPublicOrganizers,
} from '@/lib/server/publicCache'
import { normalizeGeoText, getEntityRegionIds, getRegionName } from '@/lib/shared/locations'
import { getProviderCategories } from '@/lib/shared/providerCategories'
import EventListCard from '../_components/EventListCard'
import { Button, Input } from '@/app/components/ui'

export const metadata: Metadata = {
  title: 'Recherche — LIVEINBLACK',
  description: 'Recherchez événements, prestataires et organisateurs en un seul endroit sur LIVEINBLACK.',
}

export const dynamic = 'force-dynamic'

const RESULTS_CAP = 8
const SUGGESTIONS = ['Afrobeat', 'Amapiano', 'House', 'Techno', 'Hip-Hop', 'Live band']

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
    <main className="lb-page-shell" style={{ padding: '52px clamp(20px, 3vw, 48px) 88px', maxWidth: 1480, margin: '0 auto', width: '100%' }}>
      <section className="lb-directory-intro" style={{ marginBottom: 36 }}>
      <h1 className="font-display" style={{ fontSize: 'clamp(36px, 6vw, 64px)', letterSpacing: '.01em', margin: 0 }}>Tout LIVEINBLACK, en une recherche.</h1>
      <p style={{ color: 'var(--text-muted)', maxWidth: 680, margin: '12px 0 24px', fontSize: 15 }}>Retrouve en même temps les événements, les organisateurs et les prestataires.</p>
      <form action="/search" method="get" className="lb-search-panel__controls" style={{ width: '100%' }}>
        <Input
          type="text"
          name="q"
          defaultValue={query}
          placeholder="Événements, organisateurs, prestataires…"
          style={{ flex: '1 1 600px', minWidth: 0, minHeight: 54, fontSize: 15 }}
          autoFocus
        />
        <Button
          type="submit"
          variant="primary"
          style={{ flexShrink: 0, minHeight: 54, padding: '12px 28px', fontSize: 14 }}
        >
          Chercher
        </Button>
      </form>
      </section>

      {!query ? (
        <div>
          <p style={{ color: 'var(--text-muted)', margin: '0 0 16px' }}>Tape un mot-clé pour rechercher un événement, un organisateur ou un prestataire.</p>
          <p style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px' }}>Styles populaires</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {SUGGESTIONS.map((s) => (
              <Link
                key={s}
                href={`/search?q=${encodeURIComponent(s)}`}
                style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', padding: '9px 16px', borderRadius: 999, background: 'var(--surface)', border: '1px solid var(--border-strong)', color: 'var(--text)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}
              >
                {s}
              </Link>
            ))}
          </div>
        </div>
      ) : totalResults === 0 ? (
        <div>
          <p style={{ color: 'var(--text-muted)', margin: '0 0 14px' }}>Aucun résultat pour « {query} ».</p>
          <Link
            href="/events"
            style={{ display: 'inline-block', padding: '12px 18px', borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: 'var(--primary-ink)', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}
          >
            Parcourir les événements
          </Link>
        </div>
      ) : (
        <>
          {matchedEvents.length > 0 && (
            <ResultSection title="Événements">
              <div className="lb-card-grid">
                {matchedEvents.map((e, index) => (
                  <EventListCard key={e.id} event={e} eager={index === 0} />
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
    </main>
  )
}

function ResultSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 30 }}>
      <h2 style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>{title}</h2>
      {children}
    </section>
  )
}

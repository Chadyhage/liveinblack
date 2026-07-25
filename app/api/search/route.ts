import { NextResponse } from 'next/server'
import { searchPublicEvents } from '@/lib/server/events'
import { listPublicProviders } from '@/lib/server/providers'
import { listPublicOrganizers } from '@/lib/server/organizers'
import { normalizeGeoText, getEntityRegionIds, getRegionName } from '@/lib/shared/locations'
import { getProviderCategories } from '@/lib/shared/providerCategories'

const RESULTS_CAP = 8

// Recherche globale JSON — miroir de app/(public)/search/page.tsx (mêmes
// entités, même filtrage, même cap à 8 résultats/section), pour l'app mobile
// qui n'a pas d'équivalent SSR pour cette page. Réutilise searchPublicEvents
// (index texte Mongo, déjà servi par GET /api/events?q=) plutôt que le
// filtrage substring de la page pour les événements ; organisateurs/
// prestataires reprennent la logique de filtrage exacte de la page (pas de
// fonction serveur dédiée à dupliquer).
export async function GET(req: Request) {
  const query = (new URL(req.url).searchParams.get('q') || '').trim()
  const normalized = normalizeGeoText(query)

  if (!query) return NextResponse.json({ ok: true, events: [], providers: [], organizers: [] })

  const [events, providers, organizers] = await Promise.all([
    searchPublicEvents(query),
    listPublicProviders(),
    listPublicOrganizers(),
  ])

  const matchedOrganizers = organizers
    .filter((o) => {
      const zones = getEntityRegionIds(o).map(getRegionName)
      return [o.publicName, o.city, o.country, o.shortDescription, o.longDescription, ...zones].filter(Boolean).map(normalizeGeoText).join(' ').includes(normalized)
    })
    .slice(0, RESULTS_CAP)

  const matchedProviders = providers
    .filter((p) => {
      const categoryLabels = getProviderCategories(p).map((c) => c.label)
      const zones = getEntityRegionIds(p).map(getRegionName)
      return [p.name, p.city, p.location, p.country, p.description, ...categoryLabels, ...zones].filter(Boolean).map(normalizeGeoText).join(' ').includes(normalized)
    })
    .slice(0, RESULTS_CAP)

  return NextResponse.json({
    ok: true,
    events: events.slice(0, RESULTS_CAP),
    providers: matchedProviders,
    organizers: matchedOrganizers,
  })
}

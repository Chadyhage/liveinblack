import { NextResponse } from 'next/server'
import {
  getCachedSearchPublicEvents as searchPublicEvents,
  getCachedPublicProviders as listPublicProviders,
  getCachedPublicOrganizers as listPublicOrganizers,
} from '@/lib/server/publicCache'
import { normalizeGeoText, getEntityRegionIds, getRegionName } from '@/lib/shared/locations'
import { getProviderCategories } from '@/lib/shared/providerCategories'
import { checkRateLimit, getRequestIp } from '@/lib/server/rateLimit'

const RESULTS_CAP = 8

// Recherche globale JSON — miroir de app/(public)/search/page.tsx (mêmes
// entités, même filtrage, même cap à 8 résultats/section), pour l'app mobile
// qui n'a pas d'équivalent SSR pour cette page. Réutilise searchPublicEvents
// (index texte Mongo, déjà servi par GET /api/events?q=) plutôt que le
// filtrage substring de la page pour les événements ; organisateurs/
// prestataires reprennent la logique de filtrage exacte de la page (pas de
// fonction serveur dédiée à dupliquer).
// Ajouté suite à l'audit de scalabilité du 12/08/2026 : même route publique
// que search/quick/route.ts (voir son commentaire), aucune limite jusqu'ici
// — utilisée aussi par l'app mobile, donc plafond légèrement plus généreux
// que le champ inline (recherche explicite, moins fréquente qu'une frappe
// au clavier).
export async function GET(req: Request) {
  const rateLimit = await checkRateLimit({ scope: 'search-ip', identifier: getRequestIp(req), limit: 30, windowMs: 60 * 1000 })
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } })
  }

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

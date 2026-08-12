import { NextResponse } from 'next/server'
import {
  getCachedSearchPublicEvents as searchPublicEvents,
  getCachedPublicProviders as listPublicProviders,
  getCachedPublicOrganizers as listPublicOrganizers,
} from '@/lib/server/publicCache'
import { normalizeGeoText, getEntityRegionIds, getRegionName } from '@/lib/shared/locations'
import { getProviderCategories } from '@/lib/shared/providerCategories'

// Résultats "top N" pour le champ de recherche inline du header
// (PublicNav.tsx:HeaderSearch) — miroir léger de GET /api/search (qui reste
// la recherche complète servant /search et l'app mobile), même logique de
// filtrage mais cap réduit à 3/catégorie pour un dropdown compact. Pas de
// catégorie "Utilisateurs" : la seule recherche d'utilisateurs existante
// (lib/server/friends.ts:searchUsers, via GET /api/users/search) exige une
// session et sert la messagerie (trouver un contact), ce n'est pas un
// répertoire public — l'exposer ici publierait des comptes hors de ce cadre.
const QUICK_CAP = 3

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
    .slice(0, QUICK_CAP)
    .map((o) => ({ userId: o.userId, slug: o.slug, publicName: o.publicName, city: o.city || null, avatarUrl: o.avatarUrl || null }))

  const matchedProviders = providers
    .filter((p) => {
      const categoryLabels = getProviderCategories(p).map((c) => c.label)
      const zones = getEntityRegionIds(p).map(getRegionName)
      return [p.name, p.city, p.location, p.country, p.description, ...categoryLabels, ...zones].filter(Boolean).map(normalizeGeoText).join(' ').includes(normalized)
    })
    .slice(0, QUICK_CAP)
    .map((p) => ({ userId: p.userId, name: p.name, city: p.city || p.location || null, avatarUrl: p.photoUrl || null }))

  const matchedEvents = events.slice(0, QUICK_CAP).map((e) => ({
    id: e.id,
    name: e.name,
    dateDisplay: e.dateDisplay || null,
    city: e.city || null,
    imageUrl: e.imageUrl || null,
  }))

  return NextResponse.json({
    ok: true,
    events: matchedEvents,
    providers: matchedProviders,
    organizers: matchedOrganizers,
  })
}

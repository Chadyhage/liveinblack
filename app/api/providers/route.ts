import { NextResponse } from 'next/server'
import { listPublicProviders } from '@/lib/server/providers'
import { getProviderCategories, PROVIDER_CATEGORIES } from '@/lib/shared/providerCategories'
import { getEntityRegionIds, getRegionName, matchesEntityRegion, normalizeGeoText } from '@/lib/shared/locations'

// Annuaire public des prestataires en JSON — miroir de
// app/(public)/providers/page.tsx (même logique de filtrage q/categorie/
// region, filtrée ici côté serveur plutôt que renvoyée en clair, pour éviter
// à l'app mobile de dupliquer lib/shared/providerCategories.ts /
// lib/shared/locations.ts). listPublicProviders() n'a aucun paramètre de
// filtre propre — le filtrage est fait dans la route, pas dans lib/server/*.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const search = (searchParams.get('q') || '').trim()
  const category = searchParams.get('categorie') || ''
  const region = searchParams.get('region') || ''

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

  const counts: Record<string, number> = {}
  for (const p of providers) {
    for (const c of getProviderCategories(p)) counts[c.id] = (counts[c.id] || 0) + 1
  }

  return NextResponse.json({
    ok: true,
    providers: filtered,
    total: providers.length,
    categories: PROVIDER_CATEGORIES.filter((c) => counts[c.id]).map((c) => ({ id: c.id, label: c.label, color: c.color, count: counts[c.id] })),
  })
}

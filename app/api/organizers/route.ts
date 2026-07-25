import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { listPublicOrganizersWithNextEvent } from '@/lib/server/organizers'
import { listMyFollowedOrganizers } from '@/lib/server/organizerFollows'
import { normalizeGeoText, getEntityRegionIds, getRegionName, matchesEntityRegion } from '@/lib/shared/locations'

// Annuaire public des organisateurs en JSON — miroir de
// app/(public)/organizers/page.tsx (mêmes filtres q/region/upcoming/sort,
// filtrés ici côté serveur). listPublicOrganizersWithNextEvent() n'a aucun
// paramètre propre — le filtrage/tri vit dans la page (donc ici, dans la
// route), pas dans lib/server/*.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const search = (searchParams.get('q') || '').trim()
  const region = searchParams.get('region') || ''
  const upcomingOnly = searchParams.get('upcoming') === '1'
  const sort = searchParams.get('sort') || 'popular'

  const session = await auth()
  const [organizers, followResult] = await Promise.all([
    listPublicOrganizersWithNextEvent(),
    session?.user ? listMyFollowedOrganizers({ id: session.user.id }) : Promise.resolve({ ok: true as const, follows: [] }),
  ])
  const followedIds = new Set(followResult.ok ? followResult.follows.map((f) => f.organizerId) : [])

  const filtered = organizers
    .filter((organizer) => {
      if (upcomingOnly && !organizer.nextEvent) return false
      if (!matchesEntityRegion(organizer, region, organizer.eventRegions)) return false
      if (!search) return true
      const zoneNames = getEntityRegionIds(organizer, organizer.eventRegions).map(getRegionName)
      const hay = [organizer.publicName, organizer.city, organizer.country, organizer.shortDescription, organizer.nextEvent?.name, ...zoneNames]
        .filter(Boolean)
        .map(normalizeGeoText)
        .join(' ')
      return hay.includes(normalizeGeoText(search))
    })
    .sort((a, b) => {
      if (sort !== 'recent') return (b.followersCount || 0) - (a.followersCount || 0)
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    })
    .map((o) => ({ ...o, isFollowing: followedIds.has(o.userId) }))

  return NextResponse.json({ ok: true, organizers: filtered })
}

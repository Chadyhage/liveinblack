import { INTERNATIONAL_REGION_ID } from '@/lib/shared/locations'
import { CATALOG_CATEGORIES } from '@/lib/shared/providerCategories'
import type { SocialNetworkKey } from '@/lib/shared/social'

export interface ProviderProfileComparable {
  name: string
  headline: string
  description: string
  city: string
  regionId: string
  website: string
  socialLinks: Record<SocialNetworkKey, string>
  prestataireTypes: string[]
  zonesIntervention: string[]
}

export interface ProviderProfileEditable extends ProviderProfileComparable {
  country: string
  photoUrl: string | null
  coverUrl: string | null
  prestataireType: string
  phone: string
  catalogCurrency: 'EUR' | 'XOF'
  subscriptionActive: boolean
  subscriptionStatus: string
  subscriptionExpiresAt: string | null
  gracePeriodEndsAt: string | null
  ratingAvg: number
  ratingCount: number
  catalog: unknown[]
  userId: string
}

export function comparableProviderProfile(profile: ProviderProfileComparable): string {
  const socialLinks = Object.fromEntries(
    Object.entries(profile.socialLinks).map(([key, value]) => [key, (value || '').trim()])
  ) as Record<SocialNetworkKey, string>

  return JSON.stringify({
    name: (profile.name || '').trim(),
    headline: (profile.headline || '').trim(),
    description: (profile.description || '').trim(),
    city: (profile.city || '').trim(),
    regionId: profile.regionId,
    website: (socialLinks.website || profile.website || '').trim(),
    socialLinks,
    prestataireTypes: profile.prestataireTypes,
    zonesIntervention: profile.zonesIntervention,
  })
}

export function toggleProviderCategorySelection(selected: string[], categoryId: string): string[] {
  if (selected.includes(categoryId)) return selected.filter((v) => v !== categoryId)
  if (categoryId === 'autre') return ['autre']
  return [...selected.filter((v) => v !== 'autre'), categoryId]
}

export function toggleProviderZoneSelection(selected: string[], zoneId: string, regionId: string): string[] {
  if (zoneId === INTERNATIONAL_REGION_ID) {
    return selected.includes(zoneId) ? [regionId] : [INTERNATIONAL_REGION_ID]
  }
  const withoutIntl = selected.filter((v) => v !== INTERNATIONAL_REGION_ID)
  const zonesIntervention = withoutIntl.includes(zoneId) ? withoutIntl.filter((v) => v !== zoneId) : [...withoutIntl, zoneId]
  return zonesIntervention.length ? zonesIntervention : [regionId]
}

export function applyPrimaryRegionChange(currentZones: string[], currentRegionId: string, nextRegionId: string): string[] {
  if (currentZones.includes(INTERNATIONAL_REGION_ID)) return currentZones
  const zones = [...new Set([nextRegionId, ...currentZones.filter((v) => v !== currentRegionId)])]
  return zones.length ? zones : [nextRegionId]
}

export function catalogCategoriesForProviderTypes(providerTypes: string[]): string[] {
  return [...new Set(providerTypes.flatMap((t) => CATALOG_CATEGORIES[t] || CATALOG_CATEGORIES.autre || []))]
}

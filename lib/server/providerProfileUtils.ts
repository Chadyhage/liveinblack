import { normalizeRegionIds } from '../shared/locations'
import { SOCIAL_NETWORKS, socialUrl, type SocialNetworkKey } from '../shared/social'

export interface CatalogItemView {
  id: string
  name: string
  description: string
  price: number | null
  currency: 'EUR' | 'XOF'
  unit: string
  category: string
  available: boolean
  media: Array<{ url: string; type: string }>
  createdAt: string
}

export interface ProviderProfileView {
  userId: string
  name: string
  headline: string
  description: string
  city: string
  regionId: string
  country: string
  zonesIntervention: string[]
  website: string
  socialLinks: Record<SocialNetworkKey, string>
  photoUrl: string | null
  coverUrl: string | null
  prestataireType: string
  prestataireTypes: string[]
  phone: string
  catalogCurrency: 'EUR' | 'XOF'
  subscriptionActive: boolean
  subscriptionStatus: string
  subscriptionExpiresAt: string | null
  gracePeriodEndsAt: string | null
  ratingAvg: number
  ratingCount: number
  catalog: CatalogItemView[]
}

export interface ProviderCatalogMediaLike {
  url: string
  type?: string | null
}

export interface ProviderCatalogItemLike {
  id: string
  name: string
  description?: string | null
  price?: number | null
  currency?: 'EUR' | 'XOF' | null
  unit?: string | null
  category?: string | null
  available?: boolean | null
  media?: ProviderCatalogMediaLike[] | null
  createdAt?: string | Date | null
}

export interface ProviderProfileLike {
  userId: string
  name: string
  headline?: string | null
  description?: string | null
  city?: string | null
  regionId?: string | null
  country?: string | null
  zonesIntervention?: string[] | null
  website?: string | null
  socialLinks?: unknown
  photoUrl?: string | null
  coverUrl?: string | null
  prestataireType?: string | null
  prestataireTypes?: string[] | null
  phone?: string | null
  catalogCurrency?: 'EUR' | 'XOF' | null
  subscriptionActive?: boolean | null
  subscriptionStatus?: string | null
  subscriptionExpiresAt?: string | Date | null
  gracePeriodEndsAt?: string | Date | null
  ratingAvg?: number | null
  ratingCount?: number | null
  catalog?: ProviderCatalogItemLike[] | null
}

export function toProviderSocialLinks(links: unknown): Record<SocialNetworkKey, string> {
  const source = (links ?? {}) as Partial<Record<SocialNetworkKey, string>>
  const result = {} as Record<SocialNetworkKey, string>
  for (const net of SOCIAL_NETWORKS) result[net.key] = source[net.key] ?? ''
  return result
}

export function toProviderCatalogView(catalog: ProviderCatalogItemLike[] | null | undefined): CatalogItemView[] {
  return (catalog ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description ?? '',
    price: item.price ?? null,
    currency: item.currency ?? 'EUR',
    unit: item.unit ?? '',
    category: item.category ?? '',
    available: item.available !== false,
    media: (item.media ?? []).map((media) => ({ url: media.url, type: media.type ?? 'image' })),
    createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : new Date().toISOString(),
  }))
}

export function toProviderProfileView(profile: ProviderProfileLike): ProviderProfileView {
  return {
    userId: profile.userId,
    name: profile.name,
    headline: profile.headline ?? '',
    description: profile.description ?? '',
    city: profile.city ?? '',
    regionId: profile.regionId ?? '',
    country: profile.country ?? '',
    zonesIntervention: [...(profile.zonesIntervention ?? [])],
    website: profile.website ?? '',
    socialLinks: toProviderSocialLinks(profile.socialLinks),
    photoUrl: profile.photoUrl ?? null,
    coverUrl: profile.coverUrl ?? null,
    prestataireType: profile.prestataireType ?? 'autre',
    prestataireTypes: [...(profile.prestataireTypes ?? [])],
    phone: profile.phone ?? '',
    catalogCurrency: profile.catalogCurrency ?? 'EUR',
    subscriptionActive: Boolean(profile.subscriptionActive),
    subscriptionStatus: profile.subscriptionStatus ?? 'none',
    subscriptionExpiresAt: profile.subscriptionExpiresAt ? new Date(profile.subscriptionExpiresAt).toISOString() : null,
    gracePeriodEndsAt: profile.gracePeriodEndsAt ? new Date(profile.gracePeriodEndsAt).toISOString() : null,
    ratingAvg: profile.ratingAvg ?? 0,
    ratingCount: profile.ratingCount ?? 0,
    catalog: toProviderCatalogView(profile.catalog),
  }
}

export function resolveProviderZones(regionId: string | null | undefined, requestedZones: string[]): string[] {
  const zones = normalizeRegionIds(requestedZones)
  if (zones.includes('international')) return ['international']
  if (regionId && !zones.includes(regionId)) return [regionId, ...zones]
  return zones
}

export function sanitizeProviderSocialLinks(input: Partial<Record<SocialNetworkKey, string>>): Record<string, string> {
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, socialUrl(key, value) ?? '']))
}

export function resolveCatalogCurrency(selected: string | undefined, catalogDefaultCurrency: 'EUR' | 'XOF'): 'EUR' | 'XOF' {
  return selected === 'XOF' ? 'XOF' : catalogDefaultCurrency
}

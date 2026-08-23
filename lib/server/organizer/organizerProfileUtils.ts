import { normalizeRegionIds } from '@/lib/shared/locations'
import { SOCIAL_NETWORKS, type SocialNetworkKey } from '@/lib/shared/social'

export interface OrganizerProfileMediaView {
  id: string
  url: string
  type: string
  title: string
  description: string
  eventId: string | null
  visibility: string
  displayOrder: number
}

export interface OrganizerProfileView {
  publicName: string
  slug: string
  city: string
  country: string
  regionId: string
  shortDescription: string
  socialLinks: Record<SocialNetworkKey, string>
  zonesIntervention: string[]
  avatarUrl: string | null
  bannerUrl: string | null
  status: string
  isVerified: boolean
  followersCount: number
  totalEventsCount: number
  viewsCount: number
  media: OrganizerProfileMediaView[]
}

export interface OrganizerProfileMediaLike {
  id: string
  url: string
  type?: string | null
  title?: string | null
  description?: string | null
  eventId?: string | null
  visibility?: string | null
  displayOrder?: number | null
}

export interface OrganizerProfileLike {
  publicName: string
  slug: string
  city?: string | null
  country?: string | null
  regionId?: string | null
  shortDescription?: string | null
  socialLinks?: unknown
  zonesIntervention?: string[] | null
  avatarUrl?: string | null
  bannerUrl?: string | null
  status?: string | null
  isVerified?: boolean | null
  followersCount?: number | null
  totalEventsCount?: number | null
  viewsCount?: number | null
  media?: OrganizerProfileMediaLike[] | null
}

export function toOrganizerSocialLinks(links: unknown): Record<SocialNetworkKey, string> {
  const source = (links ?? {}) as Partial<Record<SocialNetworkKey, string>>
  const result = {} as Record<SocialNetworkKey, string>
  for (const net of SOCIAL_NETWORKS) result[net.key] = source[net.key] ?? ''
  return result
}

export function toOrganizerProfileView(profile: OrganizerProfileLike): OrganizerProfileView {
  return {
    publicName: profile.publicName,
    slug: profile.slug,
    city: profile.city ?? '',
    country: profile.country ?? '',
    regionId: profile.regionId ?? '',
    shortDescription: profile.shortDescription ?? '',
    socialLinks: toOrganizerSocialLinks(profile.socialLinks),
    zonesIntervention: [...(profile.zonesIntervention ?? [])],
    avatarUrl: profile.avatarUrl ?? null,
    bannerUrl: profile.bannerUrl ?? null,
    status: profile.status ?? 'draft',
    isVerified: Boolean(profile.isVerified),
    followersCount: profile.followersCount ?? 0,
    totalEventsCount: profile.totalEventsCount ?? 0,
    viewsCount: profile.viewsCount ?? 0,
    media: (profile.media ?? []).map((media) => ({
      id: media.id,
      url: media.url,
      type: media.type ?? 'image',
      title: media.title ?? '',
      description: media.description ?? '',
      eventId: media.eventId ?? null,
      visibility: media.visibility ?? 'public',
      displayOrder: media.displayOrder ?? 0,
    })),
  }
}

export function resolveOrganizerZones(regionId: string | null | undefined, requestedZones: string[]): string[] {
  const zones = normalizeRegionIds(requestedZones)
  if (zones.includes('international')) return ['international']
  if (regionId && !zones.includes(regionId)) return [regionId, ...zones]
  return zones
}

export function reorderOrganizerMediaList<T extends { id: string; displayOrder: number }>(
  media: T[],
  order: string[]
): { ok: true; media: T[] } | { ok: false; error: 'invalid_order' } {
  const byId = new Map(media.map((item) => [item.id, item]))
  if (order.length !== media.length || new Set(order).size !== media.length || order.some((id) => !byId.has(id))) {
    return { ok: false, error: 'invalid_order' }
  }

  const reordered = order.map((id, index) => {
    const item = byId.get(id)!
    item.displayOrder = index
    return item
  })

  return { ok: true, media: reordered }
}

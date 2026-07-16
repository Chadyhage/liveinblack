// Port TypeScript de src/utils/locations.js
import { regions, type Region } from './regions'

export const INTERNATIONAL_REGION_ID = 'international'

export type RegionOption = Region | { id: string; name: string; country: string; flag: string; code: string }

export const REGION_OPTIONS: RegionOption[] = [
  ...regions,
  { id: INTERNATIONAL_REGION_ID, name: 'International', country: 'International', flag: '🌍', code: 'INT' },
]

const LEGACY_CITY_REGION = new Map<string, string>(
  Object.entries({
    paris: 'france', lyon: 'france', marseille: 'france', lille: 'france', bordeaux: 'france',
    toulouse: 'france', nantes: 'france', nice: 'france', strasbourg: 'france', montpellier: 'france', rennes: 'france',
    lome: 'togo', kara: 'togo', sokode: 'togo', kpalime: 'togo', atakpame: 'togo',
    cotonou: 'benin', 'porto novo': 'benin', 'abomey calavi': 'benin', parakou: 'benin', abomey: 'benin',
  })
)

export function normalizeGeoText(value: unknown = ''): string {
  return String(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

type RegionLike = { id?: string; code?: string; name?: string; country?: string } | string | null | undefined

export function normalizeRegionId(value: RegionLike): string {
  if (!value) return ''
  const token = normalizeGeoText(
    typeof value === 'object' ? value.id || value.code || value.name || value.country : value
  )
  if (!token) return ''
  if (token === INTERNATIONAL_REGION_ID || token === 'monde' || token === 'worldwide') return INTERNATIONAL_REGION_ID

  const exact = regions.find((region) =>
    [region.id, region.code, region.name, region.country].some((candidate) => normalizeGeoText(candidate) === token)
  )
  if (exact) return exact.id

  const contained = regions.find((region) => token.includes(normalizeGeoText(region.name)))
  return contained?.id || ''
}

export function normalizeRegionIds(values: unknown): string[] {
  const source = Array.isArray(values) ? values : values ? [values] : []
  const ids = [...new Set(source.map((v) => normalizeRegionId(v as RegionLike)).filter(Boolean))]
  return ids.includes(INTERNATIONAL_REGION_ID) ? [INTERNATIONAL_REGION_ID] : ids
}

export function getRegion(idOrName: RegionLike): RegionOption | null {
  const id = normalizeRegionId(idOrName)
  return REGION_OPTIONS.find((region) => region.id === id) || null
}

export function getRegionName(idOrName: RegionLike): string {
  return getRegion(idOrName)?.name || ''
}

export function inferRegionIdFromCity(value: unknown): string {
  return LEGACY_CITY_REGION.get(normalizeGeoText(value)) || ''
}

export type RegionEntity = {
  regionId?: string
  primaryRegionId?: string
  country?: string
  region?: string
  city?: string
  location?: string
  zonesIntervention?: string[]
}

export function getEntityRegionIds(entity: RegionEntity = {}, relatedItems: RegionEntity[] = []): string[] {
  return normalizeRegionIds([
    entity.regionId,
    entity.primaryRegionId,
    entity.country,
    entity.region,
    inferRegionIdFromCity(entity.city || entity.location),
    ...(Array.isArray(entity.zonesIntervention) ? entity.zonesIntervention : []),
    ...relatedItems.flatMap((item) => [item?.regionId, item?.region, item?.country]),
  ])
}

export function matchesEntityRegion(entity: RegionEntity, regionId: string, relatedItems: RegionEntity[] = []): boolean {
  if (!regionId) return true
  const ids = getEntityRegionIds(entity, relatedItems)
  return ids.includes(INTERNATIONAL_REGION_ID) || ids.includes(regionId)
}

import { regions } from '../data/regions.js'

export const INTERNATIONAL_REGION_ID = 'international'
export const REGION_OPTIONS = [
  ...regions,
  { id: INTERNATIONAL_REGION_ID, name: 'International', country: 'International', flag: '🌍', code: 'INT' },
]

export function normalizeGeoText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function normalizeRegionId(value) {
  if (!value) return ''
  const token = normalizeGeoText(typeof value === 'object'
    ? value.id || value.code || value.name || value.country
    : value)
  if (!token) return ''
  if (token === INTERNATIONAL_REGION_ID || token === 'monde' || token === 'worldwide') return INTERNATIONAL_REGION_ID

  const exact = regions.find(region => [region.id, region.code, region.name, region.country]
    .some(candidate => normalizeGeoText(candidate) === token))
  if (exact) return exact.id

  // Compatibilité des anciennes saisies comme « France entière » ou
  // « intervention au Togo ». On ne déduit jamais un pays depuis une ville.
  const contained = regions.find(region => token.includes(normalizeGeoText(region.name)))
  return contained?.id || ''
}

export function normalizeRegionIds(values) {
  const source = Array.isArray(values) ? values : values ? [values] : []
  const ids = [...new Set(source.map(normalizeRegionId).filter(Boolean))]
  return ids.includes(INTERNATIONAL_REGION_ID) ? [INTERNATIONAL_REGION_ID] : ids
}

export function getRegion(idOrName) {
  const id = normalizeRegionId(idOrName)
  return REGION_OPTIONS.find(region => region.id === id) || null
}

export function getRegionName(idOrName) {
  return getRegion(idOrName)?.name || ''
}

export function getEntityRegionIds(entity = {}, relatedItems = []) {
  return normalizeRegionIds([
    entity.regionId,
    entity.primaryRegionId,
    entity.country,
    entity.region,
    ...(Array.isArray(entity.zonesIntervention) ? entity.zonesIntervention : []),
    ...relatedItems.flatMap(item => [item?.regionId, item?.region, item?.country]),
  ])
}

export function matchesEntityRegion(entity, regionId, relatedItems = []) {
  if (!regionId) return true
  const ids = getEntityRegionIds(entity, relatedItems)
  return ids.includes(INTERNATIONAL_REGION_ID) || ids.includes(regionId)
}

export const PROVIDER_CATEGORIES = [
  { id: 'artiste', label: 'Artistes, DJ & animation', singular: 'Artiste / DJ / animation', icon: 'mic', color: '#e05aaa', description: 'DJ, musicien, danseur, MC, performeur, animation…' },
  { id: 'salle', label: 'Salles & lieux', singular: 'Salle / lieu', icon: 'building', color: '#8b5cf6', description: 'Club, rooftop, loft, domaine, espace de réception…' },
  { id: 'materiel', label: 'Technique & matériel', singular: 'Technique / matériel', icon: 'speaker', color: '#4ee8c8', description: 'Son, lumière, scène, vidéo, mobilier, structures…' },
  { id: 'food', label: 'Food & boissons', singular: 'Food / boissons', icon: 'cart', color: '#c8a96e', description: 'Traiteur, bar, cocktails, food truck, pâtisserie…' },
  { id: 'photo_video', label: 'Photo & vidéo', singular: 'Photo / vidéo', icon: 'camera', color: '#38bdf8', description: 'Photographe, vidéaste, photobooth, drone, montage…' },
  { id: 'decoration', label: 'Décoration & scénographie', singular: 'Décoration / scénographie', icon: 'sparkle', color: '#f472b6', description: 'Décoration, fleurs, scénographie, design d’espace…' },
  { id: 'securite', label: 'Sécurité & accueil', singular: 'Sécurité / accueil', icon: 'shield', color: '#60a5fa', description: 'Sécurité, agents d’accueil, contrôle, vestiaire…' },
  { id: 'transport', label: 'Transport & logistique', singular: 'Transport / logistique', icon: 'truck', color: '#fb923c', description: 'Navettes, chauffeurs, livraison, montage et logistique…' },
  { id: 'staff', label: 'Équipe & renfort événementiel', singular: 'Équipe événementielle', icon: 'users', color: '#a78bfa', description: 'Serveurs, hôtes, techniciens, régisseurs, personnel…' },
  { id: 'communication', label: 'Communication & création', singular: 'Communication / création', icon: 'megaphone', color: '#2dd4bf', description: 'Graphisme, réseaux sociaux, promotion, impression…' },
  { id: 'bien_etre', label: 'Beauté & bien-être', singular: 'Beauté / bien-être', icon: 'heart', color: '#fda4af', description: 'Maquillage, coiffure, stylisme et préparation…' },
  { id: 'autre', label: 'Autres services', singular: 'Service événementiel', icon: 'grid', color: '#94a3b8', description: 'Toute autre activité utile à un événement.' },
]

const LEGACY_TYPE_ALIASES = {
  prestation: 'artiste',
  dj: 'artiste',
  supermarche: 'food',
  traiteur: 'food',
  photographe: 'photo_video',
  videaste: 'photo_video',
  securite_evenementielle: 'securite',
}

export function normalizeProviderType(type, fallback = 'autre') {
  const value = LEGACY_TYPE_ALIASES[type] || type
  return PROVIDER_CATEGORIES.some(category => category.id === value) ? value : fallback
}

export function normalizeProviderTypes(value, legacyType = null) {
  const source = Array.isArray(value) ? value : value ? [value] : legacyType ? [legacyType] : []
  return [...new Set(source.map(type => normalizeProviderType(type, '')).filter(Boolean))]
}

export function getProviderTypes(provider = {}) {
  const types = normalizeProviderTypes(provider.prestataireTypes, provider.prestataireType)
  return types.length ? types : ['autre']
}

export function getPrimaryProviderType(providerOrType) {
  if (typeof providerOrType === 'string') return normalizeProviderType(providerOrType)
  return getProviderTypes(providerOrType)[0]
}

export function getProviderCategory(type) {
  const normalized = normalizeProviderType(type)
  return PROVIDER_CATEGORIES.find(category => category.id === normalized) || PROVIDER_CATEGORIES.at(-1)
}

export function getProviderCategories(provider = {}) {
  return getProviderTypes(provider).map(getProviderCategory)
}

export function providerMatchesCategory(provider, categoryId) {
  return !categoryId || getProviderTypes(provider).includes(normalizeProviderType(categoryId, ''))
}

// Port TypeScript de src/utils/providerCategories.js
export type ProviderCategory = {
  id: string
  label: string
  singular: string
  icon: string
  color: string
  description: string
}

export const PROVIDER_CATEGORIES: ProviderCategory[] = [
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

const LEGACY_TYPE_ALIASES: Record<string, string> = {
  prestation: 'artiste',
  dj: 'artiste',
  supermarche: 'food',
  traiteur: 'food',
  photographe: 'photo_video',
  videaste: 'photo_video',
  securite_evenementielle: 'securite',
}

export function normalizeProviderType(type: string, fallback = 'autre'): string {
  const value = LEGACY_TYPE_ALIASES[type] || type
  return PROVIDER_CATEGORIES.some((category) => category.id === value) ? value : fallback
}

export function normalizeProviderTypes(value: unknown, legacyType: string | null = null): string[] {
  const source: string[] = Array.isArray(value) ? value : value ? [value as string] : legacyType ? [legacyType] : []
  return [...new Set(source.map((type) => normalizeProviderType(type, '')).filter(Boolean))]
}

export function getProviderTypes(provider: { prestataireTypes?: string[]; prestataireType?: string } = {}): string[] {
  const types = normalizeProviderTypes(provider.prestataireTypes, provider.prestataireType || null)
  return types.length ? types : ['autre']
}

export function getPrimaryProviderType(providerOrType: string | { prestataireTypes?: string[]; prestataireType?: string }): string {
  if (typeof providerOrType === 'string') return normalizeProviderType(providerOrType)
  return getProviderTypes(providerOrType)[0]
}

export function getProviderCategory(type: string): ProviderCategory {
  const normalized = normalizeProviderType(type)
  return PROVIDER_CATEGORIES.find((category) => category.id === normalized) || PROVIDER_CATEGORIES[PROVIDER_CATEGORIES.length - 1]
}

export function getProviderCategories(provider: { prestataireTypes?: string[]; prestataireType?: string } = {}): ProviderCategory[] {
  return getProviderTypes(provider).map(getProviderCategory)
}

export function providerMatchesCategory(provider: { prestataireTypes?: string[]; prestataireType?: string }, categoryId: string): boolean {
  return !categoryId || getProviderTypes(provider).includes(normalizeProviderType(categoryId, ''))
}

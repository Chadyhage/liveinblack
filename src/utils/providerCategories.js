export const PROVIDER_CATEGORIES = [
  {
    id: 'artiste',
    label: 'Artistes & DJ',
    singular: 'Artiste / DJ',
    icon: 'mic',
    color: '#e05aaa',
  },
  {
    id: 'salle',
    label: 'Salles & lieux',
    singular: 'Salle / lieu',
    icon: 'building',
    color: '#8b5cf6',
  },
  {
    id: 'materiel',
    label: 'Matériel & sono',
    singular: 'Matériel / sono',
    icon: 'speaker',
    color: '#4ee8c8',
  },
  {
    id: 'food',
    label: 'Food & boissons',
    singular: 'Food / boissons',
    icon: 'cart',
    color: '#c8a96e',
  },
]

const LEGACY_TYPE_ALIASES = {
  prestation: 'artiste',
  supermarche: 'food',
}

export function normalizeProviderType(type) {
  return LEGACY_TYPE_ALIASES[type] || type || 'artiste'
}

export function getProviderCategory(type) {
  const normalized = normalizeProviderType(type)
  return PROVIDER_CATEGORIES.find(category => category.id === normalized) || PROVIDER_CATEGORIES[0]
}


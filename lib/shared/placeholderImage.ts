// Visuels de secours réels libres de droits (Unsplash) pour les événements sans photo.
// Le choix reste déterministe afin qu'une même fiche garde la même identité.
const NIGHTLIFE_PHOTOS = [
  'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1598387993441-a364f854c3e1?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1200&q=80',
]

// Identifiants d'images distantes réellement cassées ou inaccessibles.
const BROKEN_REMOTE_PHOTO_IDS = ['1571266028243-e4bb35fd2ca6']
const LEGACY_DEMO_PHOTO_HOSTS: string[] = []

function hashSeed(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return h
}

export function placeholderPhotoUrl(seed: string, w = 1200, h = 500): string {
  void w
  void h
  return NIGHTLIFE_PHOTOS[hashSeed(seed) % NIGHTLIFE_PHOTOS.length]
}

export function reliablePhotoUrl(url: string | null | undefined, seed: string, w = 1200, h = 500, fallbackUrl?: string): string {
  const candidate = url?.trim()
  if (!candidate || BROKEN_REMOTE_PHOTO_IDS.some((id) => candidate.includes(id)) || LEGACY_DEMO_PHOTO_HOSTS.some((host) => candidate.includes(host))) {
    return fallbackUrl || placeholderPhotoUrl(seed, w, h)
  }
  return candidate
}

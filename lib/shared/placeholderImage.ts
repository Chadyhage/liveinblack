// Visuels de secours créés sur mesure pour les vitrines sans photo réelle.
// Le choix reste déterministe afin qu'une même fiche garde la même identité.
const NIGHTLIFE_PHOTOS = [
  '/images/live-in-black/placeholder-event-dancefloor.png',
  '/images/live-in-black/placeholder-organizer-rooftop.png',
  '/images/live-in-black/placeholder-provider-equipment.png',
]

// Certaines anciennes données de démonstration peuvent encore contenir ces
// identifiants Unsplash supprimés. On les remplace à l'affichage plutôt que
// de laisser une grande zone noire ou une icône d'image cassée.
const BROKEN_REMOTE_PHOTO_IDS = ['1571266028243-e4bb35fd2ca6']
const LEGACY_DEMO_PHOTO_HOSTS = ['images.unsplash.com']

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

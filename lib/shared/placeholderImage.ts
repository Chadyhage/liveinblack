// Photos de secours pour les vitrines prestataire/organisateur qui n'ont
// pas encore d'image réelle (coverUrl/avatarUrl null) — évite les cartes
// vides côté annuaire public. Domaine déjà whitelisté (next.config.ts
// images.remotePatterns + CSP img-src), choix déterministe (jamais aléatoire
// à chaque rendu) pour qu'une même fiche garde toujours la même photo.
// Chaque id vérifié visuellement (photo réellement nightlife/concert/DJ, pas
// un simple mot-clé qui matchait par hasard) avant intégration — deux ids
// initialement inclus se sont révélés être un livreur à vélo et un intérieur
// de galerie d'art, corrigés ici.
const NIGHTLIFE_PHOTO_IDS = [
  '1470229722913-7c0e2dbbafd3', '1493676304819-0d7a8d026dcf', '1514525253161-7a46d19cd819',
  '1470225620780-dba8ba36b745', '1478147427282-58a87a120781', '1522158637959-30385a09e0da',
  '1516280440614-37939bbacd81', '1516450360452-9312f5e86fc7', '1477281765962-ef34e8bb0967',
  '1496337589254-7e19d01cec44', '1429962714451-bb934ecdc4ec', '1499364615650-ec38552f4f34',
]

// Certaines anciennes données de démonstration peuvent encore contenir ces
// identifiants Unsplash supprimés. On les remplace à l'affichage plutôt que
// de laisser une grande zone noire ou une icône d'image cassée.
const BROKEN_REMOTE_PHOTO_IDS = ['1571266028243-e4bb35fd2ca6']

function hashSeed(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return h
}

export function placeholderPhotoUrl(seed: string, w = 1200, h = 500): string {
  const id = NIGHTLIFE_PHOTO_IDS[hashSeed(seed) % NIGHTLIFE_PHOTO_IDS.length]
  return `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&h=${h}&q=80`
}

export function reliablePhotoUrl(url: string | null | undefined, seed: string, w = 1200, h = 500): string {
  const candidate = url?.trim()
  if (!candidate || BROKEN_REMOTE_PHOTO_IDS.some((id) => candidate.includes(id))) {
    return placeholderPhotoUrl(seed, w, h)
  }
  return candidate
}

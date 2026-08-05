// Photos de secours pour les vitrines prestataire/organisateur qui n'ont
// pas encore d'image réelle (coverUrl/avatarUrl null) — évite les cartes
// vides côté annuaire public. Domaine déjà whitelisté (next.config.ts
// images.remotePatterns + CSP img-src), choix déterministe (jamais aléatoire
// à chaque rendu) pour qu'une même fiche garde toujours la même photo.
const NIGHTLIFE_PHOTO_IDS = [
  '1470229722913-7c0e2dbbafd3', '1493676304819-0d7a8d026dcf', '1514525253161-7a46d19cd819',
  '1470225620780-dba8ba36b745', '1518998053901-5348d3961a04', '1522158637959-30385a09e0da',
  '1526367790999-0150786686a2', '1516450360452-9312f5e86fc7', '1477281765962-ef34e8bb0967',
  '1496337589254-7e19d01cec44', '1429962714451-bb934ecdc4ec', '1499364615650-ec38552f4f34',
]

function hashSeed(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return h
}

export function placeholderPhotoUrl(seed: string, w = 1200, h = 500): string {
  const id = NIGHTLIFE_PHOTO_IDS[hashSeed(seed) % NIGHTLIFE_PHOTO_IDS.length]
  return `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&h=${h}&q=80`
}

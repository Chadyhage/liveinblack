// Port TypeScript de src/utils/recommendations.js ("Recommandations
// personnalisées V1" côté legacy) — fonction PURE, pas d'accès réseau/DOM ici
// (contrairement au legacy qui lisait `localStorage` directement dans ce
// fichier pour le journal de vues et les réservations). Dans ce port,
// l'équivalent du "comportement" legacy (vues locales + réservations +
// organisateurs suivis) est réduit au signal réellement disponible :
// l'historique "Intéressé" (EventInterest, cf. lib/server/eventInterests.ts),
// résolu côté serveur puis passé ici en `interestHistory`. Suivre/réserver ne
// sont pas encore des signaux câblés dans ce port (aucune régression : ils
// n'existaient nulle part avant ce fichier).
//
// Barème et règles de sélection (seuil, exigence d'au moins une raison
// personnelle) copiés à l'identique du legacy — voir WEIGHTS ci-dessous et
// `getRecommendedEvents`.

export const MUSIC_STYLE_LABELS: Record<string, string> = {
  afrobeat: 'Afrobeat',
  amapiano: 'Amapiano',
  rap: 'Rap / Hip-hop',
  rnb: 'R&B',
  dancehall: 'Dancehall',
  'coupe-decale': 'Coupé-décalé',
  zouk: 'Zouk / Kompa',
  house: 'House',
  techno: 'Techno',
  latino: 'Latino',
  gospel: 'Gospel',
  generaliste: 'Généraliste',
}

export const EVENT_TYPE_LABELS: Record<string, string> = {
  club: 'Club',
  concert: 'Concert / Showcase',
  festival: 'Festival',
  rooftop: 'Rooftop',
  lounge: 'Lounge',
  gala: 'Gala',
  afterwork: 'Afterwork',
  'pool-party': 'Pool party',
  'plein-air': 'Plein air',
  privee: 'Soirée privée',
  anniversaire: 'Anniversaire',
}

// Identique à BUDGETS de src/utils/recommendations.js (mêmes bornes, même
// ordre) — `vip` et `plus-50` ont volontairement le même test (fidèle au
// legacy, jamais "corrigé" ici pour rester bug-for-bug compatible).
export const BUDGETS: { id: string; test: (price: number) => boolean }[] = [
  { id: 'gratuit', test: (p) => p <= 0 },
  { id: 'moins-10', test: (p) => p > 0 && p < 10 },
  { id: '10-20', test: (p) => p >= 10 && p <= 20 },
  { id: '20-50', test: (p) => p > 20 && p <= 50 },
  { id: 'plus-50', test: (p) => p > 50 },
  { id: 'vip', test: (p) => p > 50 },
]

// Compat legacy : events créés avant l'introduction de musicStyles[] n'ont
// qu'un `category` (genre unique). Mappé vers nos ids pour rester
// recommandables sans re-édition — copié à l'identique de CATEGORY_ALIASES.
const CATEGORY_ALIASES: Record<string, string[]> = {
  afrobeat: ['afrobeat'],
  rap: ['rap'],
  'r&b': ['rnb'],
  rnb: ['rnb'],
  reggaeton: ['latino'],
  dancehall: ['dancehall'],
  house: ['house'],
  techno: ['techno'],
  electronique: ['house', 'techno'],
  latino: ['latino'],
  gospel: ['gospel'],
  zouk: ['zouk'],
  kompa: ['zouk'],
  amapiano: ['amapiano'],
  'coupe-decale': ['coupe-decale'],
  'coupe decale': ['coupe-decale'],
}

export const RECOMMENDATION_WEIGHTS = {
  musicStyle: 25,
  artist: 25,
  city: 20,
  eventType: 20,
  budget: 15,
  ambiance: 10,
  interestedSimilarStyle: 5, // équivalent du "viewedSimilar" legacy (5 pts)
  popular: 5,
  almostFull: 5,
}

export interface RecommendationPreferences {
  musicStyles?: string[]
  artists?: string[]
  eventTypes?: string[]
  cities?: string[]
  budget?: string
  ambiances?: string[]
}

// Signal comportemental résolu côté serveur à partir des lignes EventInterest
// actives de l'utilisateur (voir lib/server/eventInterests.ts). `musicStyles`
// est le seul champ effectivement scoré aujourd'hui (équivalent du journal de
// vues locales legacy) ; eventId/city sont gardés pour une évolution future
// sans revoir la forme du signal.
export interface RecommendationInterestSignal {
  eventId: string
  musicStyles?: string[]
}

type RecommendationPlace = { price?: number | null; available?: number | null; total?: number | null }
type RecommendationPlaceWithStock = { available?: number | null; total?: number | null }
type RecommendationArtist = { name?: string | null } | string

export interface RecommendationEvent {
  id: string
  organizerId?: string | null
  createdBy?: string | null
  city?: string | null
  location?: string | null
  category?: string | null
  eventType?: string | null
  musicStyles?: string[] | null
  ambiances?: string[] | null
  artists?: RecommendationArtist[] | null
  dj?: string | null
  places?: RecommendationPlace[] | null
}

export interface ScoredRecommendation<T extends RecommendationEvent = RecommendationEvent> {
  event: T
  score: number
  reason: string
  reasons: string[]
}

// ── Normalisation (accents/casse) pour comparer villes et artistes ─────────
function norm(v: unknown): string {
  return String(v || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

function eventStyleIds(event: RecommendationEvent): string[] {
  if (Array.isArray(event.musicStyles) && event.musicStyles.length) return event.musicStyles
  const cat = norm(event.category)
  return cat ? CATEGORY_ALIASES[cat] || [] : []
}

function eventArtistNames(event: RecommendationEvent): string[] {
  const out: string[] = []
  for (const a of event.artists || []) {
    const n = norm(typeof a === 'string' ? a : a?.name)
    if (n) out.push(n)
  }
  const dj = norm(event.dj)
  if (dj) out.push(dj)
  return out
}

// Prix minimum d'un event — null si INCONNU (pas de places valides). Ne
// jamais confondre "prix inconnu" et "gratuit", sinon un event mal formé
// matcherait à tort le budget "Gratuit".
function eventMinPrice(event: RecommendationEvent): number | null {
  const prices = (event.places || [])
    .map((p) => Number(p.price))
    .filter((n) => Number.isFinite(n) && n >= 0)
  return prices.length ? Math.min(...prices) : null
}

// Match ville au MOT entier (pas de substring laxiste) : "Paris" matche
// "Paris" et "Paris 11e" mais pas "Parisot" ; "Roubaix" ne matche pas "Aix".
const WORD_SEP = /[^a-z0-9]+/
function cityMatches(prefCity: string, evCity: string | null | undefined): boolean {
  const np = norm(prefCity)
  const ne = norm(evCity)
  if (!np || !ne) return false
  if (np === ne) return true
  return ne.split(WORD_SEP).includes(np) || np.split(WORD_SEP).includes(ne)
}

// A-t-on au moins une préférence déclarée exploitable ?
export function hasPreferences(prefs: RecommendationPreferences | null | undefined): boolean {
  if (!prefs) return false
  return (
    (prefs.musicStyles || []).length > 0 ||
    (prefs.artists || []).length > 0 ||
    (prefs.eventTypes || []).length > 0 ||
    (prefs.cities || []).length > 0 ||
    (prefs.ambiances || []).length > 0 ||
    !!prefs.budget
  )
}

export function musicPreferenceReason(label: string): string {
  return `${String(label || '').trim()} correspond à tes goûts`
}

// ── Score de compatibilité pour UN événement ────────────────────────────────
export function scoreRecommendationEvent(
  prefs: RecommendationPreferences | null | undefined,
  interestedStyles: Set<string>,
  event: RecommendationEvent,
  ctx: { boostedIds?: Set<string> } = {}
): { score: number; reason: string; reasons: string[] } {
  let score = 0
  const reasons: { weight: number; text: string }[] = []
  const p = prefs || {}

  // Style musical (champ dédié, sinon dérivé du genre legacy `category`)
  const evStyles = eventStyleIds(event)
  const styleMatch = evStyles.find((s) => (p.musicStyles || []).includes(s))
  if (styleMatch) {
    score += RECOMMENDATION_WEIGHTS.musicStyle
    reasons.push({ weight: RECOMMENDATION_WEIGHTS.musicStyle, text: musicPreferenceReason(MUSIC_STYLE_LABELS[styleMatch] || styleMatch) })
  }

  // Artistes / DJs — garde ≥ 3 caractères DES DEUX CÔTÉS : sinon un event
  // avec artiste "DJ" matcherait la préférence "DJ Arafat" (faux positif).
  const evArtists = eventArtistNames(event)
  const artistMatch = (p.artists || []).find((a) => {
    const na = norm(a)
    return na.length >= 3 && evArtists.some((ea) => ea.length >= 3 && (ea.includes(na) || na.includes(ea)))
  })
  if (artistMatch) {
    score += RECOMMENDATION_WEIGHTS.artist
    reasons.push({ weight: RECOMMENDATION_WEIGHTS.artist, text: `Avec ${artistMatch} que tu aimes` })
  }

  // Ville — au mot entier (voir cityMatches)
  const cityMatch = (p.cities || []).find((c) => cityMatches(c, event.city || event.location))
  if (cityMatch) {
    score += RECOMMENDATION_WEIGHTS.city
    reasons.push({ weight: RECOMMENDATION_WEIGHTS.city, text: `Parce que tu sors à ${cityMatch}` })
  }

  // Type de soirée
  if (event.eventType && (p.eventTypes || []).includes(event.eventType)) {
    score += RECOMMENDATION_WEIGHTS.eventType
    reasons.push({ weight: RECOMMENDATION_WEIGHTS.eventType, text: `Ton type de soirée : ${EVENT_TYPE_LABELS[event.eventType] || event.eventType}` })
  }

  // Budget — seulement si le prix de l'event est CONNU
  const budget = BUDGETS.find((b) => b.id === p.budget)
  const minPrice = eventMinPrice(event)
  if (budget && minPrice != null && budget.test(minPrice)) {
    score += RECOMMENDATION_WEIGHTS.budget
    reasons.push({ weight: RECOMMENDATION_WEIGHTS.budget, text: 'Dans ton budget habituel' })
  }

  // Ambiance
  const evAmbiances = event.ambiances || []
  if (evAmbiances.some((a) => (p.ambiances || []).includes(a))) {
    score += RECOMMENDATION_WEIGHTS.ambiance
    reasons.push({ weight: RECOMMENDATION_WEIGHTS.ambiance, text: 'L’ambiance que tu recherches' })
  }

  // Dans l'esprit de ce à quoi tu t'es déjà intéressé (EventInterest) — signal
  // le plus faible, jamais cumulé avec un match de style déclaré (ce serait
  // compter deux fois le même signal, même règle que legacy viewedSimilar).
  if (!styleMatch && evStyles.some((s) => interestedStyles.has(s))) {
    score += RECOMMENDATION_WEIGHTS.interestedSimilarStyle
    reasons.push({ weight: RECOMMENDATION_WEIGHTS.interestedSimilarStyle, text: 'Dans l’esprit de ce qui t’intéresse' })
  }

  // Popularité (event boosté / mis en avant)
  if (ctx.boostedIds?.has(String(event.id))) {
    score += RECOMMENDATION_WEIGHTS.popular
    reasons.push({ weight: RECOMMENDATION_WEIGHTS.popular, text: 'Tendance en ce moment' })
  }

  // Bientôt complet
  const total = (event.places || []).reduce((s, pl) => s + (Number((pl as RecommendationPlaceWithStock).total) || 0), 0)
  const remaining = (event.places || []).reduce((s, pl) => s + (Number((pl as RecommendationPlaceWithStock).available) || 0), 0)
  if (total > 0 && remaining > 0 && remaining / total <= 0.15) {
    score += RECOMMENDATION_WEIGHTS.almostFull
    reasons.push({ weight: RECOMMENDATION_WEIGHTS.almostFull, text: 'Bientôt complet' })
  }

  reasons.sort((a, b) => b.weight - a.weight)
  return { score, reason: reasons[0]?.text || '', reasons: reasons.map((r) => r.text) }
}

// ── Sélection finale pour la liste /events ──────────────────────────────────
// Règles métier V1 (identiques au legacy) : il faut au moins UNE raison
// personnelle (style/artiste/ville/type/budget/ambiance/intérêt) — la
// popularité seule ne suffit pas (pas de spam), plafond d'affichage `max`.
export function getRecommendedEvents<T extends RecommendationEvent>({
  preferences,
  interestHistory = [],
  events,
  boostedIds = new Set(),
  excludeEventIds = new Set(),
  currentUserId,
  max = 12,
  minScore = 20,
}: {
  preferences: RecommendationPreferences | null | undefined
  interestHistory?: RecommendationInterestSignal[]
  events: T[]
  boostedIds?: Set<string>
  // Events à ne jamais recommander (ex: déjà mis en avant ailleurs sur la
  // même page, pour éviter un doublon visuel) — comparé à `event.id`.
  excludeEventIds?: Set<string>
  // Jamais recommander ses propres événements (organisateur qui consulte
  // /events avec un compte multi-rôles) — même règle que legacy.
  currentUserId?: string | null
  max?: number
  minScore?: number
}): ScoredRecommendation<T>[] {
  const interestedStyles = new Set(interestHistory.flatMap((i) => i.musicStyles || []))
  const hasAnySignal = hasPreferences(preferences) || interestedStyles.size > 0
  if (!hasAnySignal) return []

  const PERSONAL_MIN = RECOMMENDATION_WEIGHTS.popular + RECOMMENDATION_WEIGHTS.almostFull
  const ownerId = currentUserId ? String(currentUserId) : ''

  return events
    .filter((ev) => !excludeEventIds.has(String(ev.id)))
    .filter((ev) => !ownerId || String(ev.organizerId || ev.createdBy || '') !== ownerId)
    .map((ev) => ({ event: ev, ...scoreRecommendationEvent(preferences, interestedStyles, ev, { boostedIds }) }))
    .filter((r) => r.score >= minScore && r.score > PERSONAL_MIN)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
}

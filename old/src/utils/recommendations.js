// ─── Recommandations personnalisées (V1) ──────────────────────────────────────
// Système SIMPLE et lisible : préférences déclarées + tags événements + score
// pondéré. Pas d'IA, pas de serveur : tout se calcule côté client à partir de
// ce qui est déjà chargé (events publics, préférences du compte, historique
// local). Les pondérations sont volontairement centralisées ici (WEIGHTS) pour
// rester modifiables en 30 secondes.
//
// Données :
//  · Préférences  → users/{uid}.preferences (cross-device, éditable Paramètres)
//  · Comportement → lib_reco_views_{uid} (LOCAL uniquement — vie privée :
//    l'historique de consultation ne quitte jamais l'appareil)
//  · Tags events  → champs eventType / musicStyles[] / ambiances[] / artists
//    posés à la création (MesEvenementsPage). Les vieux events sans tags sont
//    quand même scorés sur ville/budget/popularité.
//
// V2 (non construit, mais le score est prêt à l'accueillir) : « Ciblage
// intelligent » payant organisateur = bonus de score plafonné + badge
// « Sponsorisé · correspond à tes goûts », jamais montré à un profil
// incompatible (le score de base doit déjà dépasser le seuil).

import { eventEndMs } from './event-time'
import { musicPreferenceReason } from './recommendationCopy'
export { musicPreferenceReason } from './recommendationCopy'

// ── Référentiels partagés (onboarding client + tags événement) ────────────────
export const MUSIC_STYLES = [
  { id: 'afrobeat', label: 'Afrobeat' },
  { id: 'amapiano', label: 'Amapiano' },
  { id: 'rap', label: 'Rap / Hip-hop' },
  { id: 'rnb', label: 'R&B' },
  { id: 'dancehall', label: 'Dancehall' },
  { id: 'coupe-decale', label: 'Coupé-décalé' },
  { id: 'zouk', label: 'Zouk / Kompa' },
  { id: 'house', label: 'House' },
  { id: 'techno', label: 'Techno' },
  { id: 'latino', label: 'Latino' },
  { id: 'gospel', label: 'Gospel' },
  { id: 'generaliste', label: 'Généraliste' },
]

export const EVENT_TYPES = [
  { id: 'club', label: 'Club' },
  { id: 'concert', label: 'Concert / Showcase' },
  { id: 'festival', label: 'Festival' },
  { id: 'rooftop', label: 'Rooftop' },
  { id: 'lounge', label: 'Lounge' },
  { id: 'gala', label: 'Gala' },
  { id: 'afterwork', label: 'Afterwork' },
  { id: 'pool-party', label: 'Pool party' },
  { id: 'plein-air', label: 'Plein air' },
  { id: 'privee', label: 'Soirée privée' },
  { id: 'anniversaire', label: 'Anniversaire' },
]

export const AMBIANCES = [
  { id: 'chill', label: 'Chill' },
  { id: 'dansant', label: 'Dansant' },
  { id: 'tres-festif', label: 'Très festif' },
  { id: 'premium', label: 'Premium' },
  { id: 'select', label: 'Sélect' },
  { id: 'populaire', label: 'Populaire' },
  { id: 'etudiant', label: 'Étudiant' },
  { id: 'networking', label: 'Networking' },
  { id: 'romantique', label: 'Romantique' },
  { id: 'luxe', label: 'Luxe' },
]

export const BUDGETS = [
  { id: 'gratuit', label: 'Gratuit', test: p => p <= 0 },
  { id: 'moins-10', label: 'Moins de 10 €', test: p => p > 0 && p < 10 },
  { id: '10-20', label: '10 à 20 €', test: p => p >= 10 && p <= 20 },
  { id: '20-50', label: '20 à 50 €', test: p => p > 20 && p <= 50 },
  { id: 'plus-50', label: 'Plus de 50 €', test: p => p > 50 },
  { id: 'vip', label: 'VIP / Premium', test: p => p > 50 },
]

export const FREQUENCIES = [
  { id: 'rare', label: 'Rarement' },
  { id: '1-mois', label: '1 fois par mois' },
  { id: '2-3-mois', label: '2 à 3 fois par mois' },
  { id: 'semaine', label: 'Chaque semaine' },
]

export const GROUP_PREFS = [
  { id: 'seul', label: 'Seul·e' },
  { id: 'amis', label: 'Avec des amis' },
  { id: 'couple', label: 'En couple' },
  { id: 'vip', label: 'Groupe VIP / table' },
]

export const EMPTY_PREFERENCES = {
  musicStyles: [],   // ids de MUSIC_STYLES
  artists: [],       // noms d'artistes/DJs (recherche Deezer + ajout libre)
  artistPhotos: {},  // { nom: urlPhoto } — display seul (avatar des pastilles)
  eventTypes: [],    // ids de EVENT_TYPES
  cities: [],        // texte libre (villes)
  budget: '',        // id de BUDGETS
  ambiances: [],     // ids de AMBIANCES
  // Collectés dès la V1 mais PAS encore scorés : serviront au « Ciblage
  // intelligent » V2 (estimation d'audience côté organisateur).
  frequency: '',     // id de FREQUENCIES
  groupPref: '',     // id de GROUP_PREFS
}

// A-t-on au moins une préférence déclarée exploitable ?
export function hasPreferences(prefs) {
  if (!prefs) return false
  return (prefs.musicStyles || []).length > 0
    || (prefs.artists || []).length > 0
    || (prefs.eventTypes || []).length > 0
    || (prefs.cities || []).length > 0
    || (prefs.ambiances || []).length > 0
    || !!prefs.budget
}

// La personnalisation est ACTIVE par défaut, désactivable dans Confidentialité.
export function personalizationEnabled(user) {
  return user?.privacy?.personalization !== false
}

// ── Normalisation (accents/casse) pour comparer villes et artistes ────────────
const norm = v => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

// ── Compat legacy : les events créés AVANT ce système n'ont qu'un `category`
// (genre unique : 'Afrobeat', 'Rap', 'Électronique'…). On le mappe vers nos ids
// pour qu'ils restent recommandables sans re-édition.
const CATEGORY_ALIASES = {
  'afrobeat': ['afrobeat'],
  'rap': ['rap'],
  'r&b': ['rnb'],
  'rnb': ['rnb'],
  'reggaeton': ['latino'],
  'dancehall': ['dancehall'],
  'house': ['house'],
  'techno': ['techno'],
  'electronique': ['house', 'techno'],
  'latino': ['latino'],
  'gospel': ['gospel'],
  'zouk': ['zouk'],
  'kompa': ['zouk'],
  'amapiano': ['amapiano'],
  'coupe-decale': ['coupe-decale'],
  'coupe decale': ['coupe-decale'],
}

// Styles musicaux effectifs d'un event : champ dédié sinon dérivés de category.
function eventStyleIds(event) {
  if (Array.isArray(event.musicStyles) && event.musicStyles.length) return event.musicStyles
  const cat = norm(event.category)
  return cat ? (CATEGORY_ALIASES[cat] || []) : []
}

// Noms d'artistes d'un event : artists peut être [{name, role}] ou [string],
// et `dj` est une chaîne libre (noms joints).
function eventArtistNames(event) {
  const out = []
  for (const a of (event.artists || [])) {
    const n = norm(typeof a === 'string' ? a : a?.name)
    if (n) out.push(n)
  }
  const dj = norm(event.dj)
  if (dj) out.push(dj)
  return out
}

// ── Prix minimum d'un event — null si INCONNU (pas de places valides) ─────────
// Important : ne jamais confondre « prix inconnu » et « gratuit », sinon un
// event mal formé matcherait le budget « Gratuit » à tort.
function eventMinPrice(event) {
  const prices = (event.places || []).map(p => Number(p.price)).filter(n => Number.isFinite(n) && n >= 0)
  return prices.length ? Math.min(...prices) : null
}

// ── Match ville au MOT entier (pas de substring laxiste) ──────────────────────
// « Paris » matche « Paris » et « Paris 11e », mais PAS « Parisot » ;
// « Roubaix » ne matche pas « Aix ».
const WORD_SEP = /[^a-z0-9]+/
function cityMatches(prefCity, evCity) {
  const np = norm(prefCity), ne = norm(evCity)
  if (!np || !ne) return false
  if (np === ne) return true
  return ne.split(WORD_SEP).includes(np) || np.split(WORD_SEP).includes(ne)
}

// ── Journal comportemental — LOCAL UNIQUEMENT (vie privée) ────────────────────
const viewsKey = uid => `lib_reco_views_${uid}`

export function recordEventView(user, event) {
  const uid = user?.uid || user?.id
  if (!uid || !event?.id || !personalizationEnabled(user)) return
  try {
    const all = JSON.parse(localStorage.getItem(viewsKey(uid)) || '[]')
    const entry = {
      id: String(event.id),
      ts: Date.now(),
      // Styles EFFECTIFS (champ dédié ou dérivés du genre legacy) — sinon le
      // journal serait vide pour tous les vieux events sans musicStyles.
      musicStyles: eventStyleIds(event),
      eventType: event.eventType || '',
      city: event.city || event.location || '',
    }
    const next = [entry, ...all.filter(v => v.id !== entry.id)].slice(0, 100)
    localStorage.setItem(viewsKey(uid), JSON.stringify(next))
  } catch {}
}

export function clearBehavior(uid) {
  try { localStorage.removeItem(viewsKey(uid)) } catch {}
  _behaviorCache = { key: '', ts: 0, value: null }
}

// Signaux dérivés : réservations (lib_bookings), organisateurs suivis, vues.
// `events` sert à résoudre les réservations (un booking ne stocke que eventId :
// on retrouve l'organisateur et les styles via la liste d'events chargée).
// Cache court (5 s) : HomePage re-render souvent, inutile de re-parser
// lib_bookings (global, potentiellement gros) à chaque render.
let _behaviorCache = { key: '', ts: 0, value: null }
function getBehavior(user, events = []) {
  const uid = user?.uid || user?.id
  const out = { bookedEventIds: new Set(), bookedOrganizerIds: new Set(), bookedStyles: new Set(), followedOrganizerIds: new Set(), viewedStyles: new Set() }
  if (!uid) return out
  const cacheKey = `${uid}:${(events || []).length}`
  if (_behaviorCache.value && _behaviorCache.key === cacheKey && Date.now() - _behaviorCache.ts < 5000) return _behaviorCache.value
  const byId = new Map((events || []).map(ev => [String(ev.id), ev]))
  try {
    const bookings = JSON.parse(localStorage.getItem('lib_bookings') || '[]')
    for (const b of bookings) {
      // STRICT : lib_bookings est GLOBAL multi-comptes sur l'appareil ; les
      // vieilles entrées sans userId (app d'origine) ne sont attribuées à
      // personne plutôt que de polluer tous les comptes.
      if (!b || String(b.userId || '') !== String(uid)) continue
      if (b.eventId == null) continue
      const id = String(b.eventId)
      out.bookedEventIds.add(id)
      const ev = byId.get(id)
      if (ev) {
        const org = String(ev.organizerId || ev.createdBy || '')
        if (org) out.bookedOrganizerIds.add(org)
        for (const s of eventStyleIds(ev)) out.bookedStyles.add(s)
      }
    }
  } catch {}
  try {
    const follows = JSON.parse(localStorage.getItem(`lib_organizer_follows_${uid}`) || '[]')
    for (const f of follows) if (f?.status === 'active') out.followedOrganizerIds.add(String(f.organizerId))
  } catch {}
  try {
    const views = JSON.parse(localStorage.getItem(viewsKey(uid)) || '[]')
    for (const v of views) for (const s of (v.musicStyles || [])) out.viewedStyles.add(s)
  } catch {}
  _behaviorCache = { key: cacheKey, ts: Date.now(), value: out }
  return out
}

// ── Score de compatibilité ────────────────────────────────────────────────────
// Barème (modifiable ici, nulle part ailleurs) :
export const WEIGHTS = {
  musicStyle: 25,
  artist: 25,
  city: 20,
  eventType: 20,
  budget: 15,
  ambiance: 10,
  knownOrganizer: 10,   // suivi OU déjà réservé chez lui
  similarToBooked: 10,  // même style qu'une soirée déjà réservée
  viewedSimilar: 5,     // même style que les soirées consultées (journal local)
  popular: 5,           // boosté / mis en avant
  almostFull: 5,
}

const styleLabel = id => MUSIC_STYLES.find(s => s.id === id)?.label || id
const typeLabel = id => EVENT_TYPES.find(t => t.id === id)?.label || id

export function scoreEvent(prefs, behavior, event, ctx = {}) {
  let score = 0
  const reasons = [] // [{ weight, text }] — on garde la meilleure pour l'affichage
  const p = prefs || EMPTY_PREFERENCES

  // Style musical (champ dédié, sinon dérivé du genre legacy `category`)
  const evStyles = eventStyleIds(event)
  const styleMatch = evStyles.find(s => (p.musicStyles || []).includes(s))
  if (styleMatch) { score += WEIGHTS.musicStyle; reasons.push({ weight: WEIGHTS.musicStyle, text: musicPreferenceReason(styleLabel(styleMatch)) }) }

  // Artistes / DJs (artists = [{name}] ou [string] + champ dj libre).
  // Garde ≥ 3 caractères DES DEUX CÔTÉS : sinon un event avec artiste « DJ »
  // matcherait la préférence « DJ Arafat » (faux positif systématique).
  const evArtists = eventArtistNames(event)
  const artistMatch = (p.artists || []).find(a => { const na = norm(a); return na.length >= 3 && evArtists.some(ea => ea.length >= 3 && (ea.includes(na) || na.includes(ea))) })
  if (artistMatch) { score += WEIGHTS.artist; reasons.push({ weight: WEIGHTS.artist, text: `Avec ${artistMatch} que tu aimes` }) }

  // Ville — au MOT entier (voir cityMatches)
  const cityMatch = (p.cities || []).find(c => cityMatches(c, event.city || event.location))
  if (cityMatch) { score += WEIGHTS.city; reasons.push({ weight: WEIGHTS.city, text: `Parce que tu sors à ${cityMatch}` }) }

  // Type de soirée
  if (event.eventType && (p.eventTypes || []).includes(event.eventType)) {
    score += WEIGHTS.eventType
    reasons.push({ weight: WEIGHTS.eventType, text: `Ton type de soirée : ${typeLabel(event.eventType)}` })
  }

  // Budget — seulement si le prix de l'event est CONNU
  const budget = BUDGETS.find(b => b.id === p.budget)
  const minPrice = eventMinPrice(event)
  if (budget && minPrice != null && budget.test(minPrice)) {
    score += WEIGHTS.budget
    reasons.push({ weight: WEIGHTS.budget, text: 'Dans ton budget habituel' })
  }

  // Ambiance
  const evAmbiances = event.ambiances || []
  if (evAmbiances.some(a => (p.ambiances || []).includes(a))) {
    score += WEIGHTS.ambiance
    reasons.push({ weight: WEIGHTS.ambiance, text: 'L’ambiance que tu recherches' })
  }

  // Organisateur connu (suivi ou déjà réservé)
  const orgId = String(event.organizerId || event.createdBy || '')
  if (orgId && (behavior.followedOrganizerIds.has(orgId) || behavior.bookedOrganizerIds.has(orgId))) {
    score += WEIGHTS.knownOrganizer
    reasons.push({ weight: WEIGHTS.knownOrganizer, text: behavior.followedOrganizerIds.has(orgId) ? 'Par un organisateur que tu suis' : 'Tu as déjà réservé chez cet organisateur' })
  }

  // Similaire aux réservations passées (même style) — ne se cumule pas avec un
  // match de style déclaré (ce serait compter deux fois le même signal)
  const similarBooked = evStyles.some(s => behavior.bookedStyles.has(s)) && !styleMatch
  if (similarBooked) {
    score += WEIGHTS.similarToBooked
    reasons.push({ weight: WEIGHTS.similarToBooked, text: 'Similaire aux soirées que tu as réservées' })
  }

  // Dans l'esprit de ce que tu CONSULTES (journal local) — signal le plus
  // faible, jamais cumulé avec un match de style déclaré ou réservé
  if (!styleMatch && !similarBooked && evStyles.some(s => behavior.viewedStyles.has(s))) {
    score += WEIGHTS.viewedSimilar
    reasons.push({ weight: WEIGHTS.viewedSimilar, text: 'Dans l’esprit de ce que tu regardes' })
  }

  // Popularité (event boosté / mis en avant)
  if (ctx.boostedIds?.has(String(event.id))) {
    score += WEIGHTS.popular
    reasons.push({ weight: WEIGHTS.popular, text: 'Tendance en ce moment' })
  }

  // Bientôt complet
  const total = (event.places || []).reduce((s, pl) => s + (Number(pl.total) || 0), 0)
  const remaining = (event.places || []).reduce((s, pl) => s + (Number(pl.available) || 0), 0)
  if (total > 0 && remaining > 0 && remaining / total <= 0.15) {
    score += WEIGHTS.almostFull
    reasons.push({ weight: WEIGHTS.almostFull, text: 'Bientôt complet' })
  }

  reasons.sort((a, b) => b.weight - a.weight)
  return { score, reason: reasons[0]?.text || '', reasons: reasons.map(r => r.text) }
}

// ── Sélection finale pour la section « Nos recommandations pour vous » ────────
// Règles métier V1 :
//  · jamais d'events privés, passés, annulés, ni ses propres events
//  · il faut au moins UNE raison personnelle (style/artiste/ville/type/budget/
//    ambiance/organisateur) — la popularité seule ne suffit pas (pas de spam)
//  · seuil de score minimal + plafond d'affichage
export function getRecommendations({ user, events, allEvents, boostedIds = new Set(), max = 6, minScore = 20 }) {
  const uid = user?.uid || user?.id
  if (!uid || !personalizationEnabled(user)) return []
  const prefs = user?.preferences
  // allEvents (liste NON filtrée) sert à résoudre les réservations : un billet
  // acheté concerne souvent un event PASSÉ ou hors région, absent de `events`
  // (les candidats filtrés) — sans ça, « similaire à tes réservations » serait mort.
  const behavior = getBehavior(user, allEvents || events)
  const hasAnySignal = hasPreferences(prefs)
    || behavior.followedOrganizerIds.size > 0
    || behavior.bookedOrganizerIds.size > 0
    || behavior.bookedStyles.size > 0
    || behavior.viewedStyles.size > 0
  if (!hasAnySignal) return []

  const now = Date.now()
  const PERSONAL_MIN = WEIGHTS.popular + WEIGHTS.almostFull // au-delà = au moins un match personnel

  return (events || [])
    .filter(ev => ev && !ev.isPrivate && !ev.cancelled)
    .filter(ev => String(ev.organizerId || ev.createdBy || '') !== String(uid))
    // eventEndMs renvoie 0 si la date est absente/illisible → on garde (défensif) ;
    // sinon on garde tant que la soirée n'est pas TERMINÉE (une soirée en cours
    // ce soir reste recommandable).
    .filter(ev => { const end = eventEndMs(ev); return end === 0 || end >= now })
    // Jamais recommander une soirée pour laquelle il a DÉJÀ un billet
    .filter(ev => !behavior.bookedEventIds.has(String(ev.id)))
    .map(ev => ({ event: ev, ...scoreEvent(prefs, behavior, ev, { boostedIds }) }))
    .filter(r => r.score >= minScore && r.score > PERSONAL_MIN)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
}

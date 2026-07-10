const DAY_MS = 24 * 60 * 60 * 1000

export const EVENT_STATS_DEFINITIONS = {
  estimatedRevenue: {
    label: 'Recettes billetterie',
    plain: 'Argent généré par les billets',
    definition: 'Somme des prix payés pour tous les billets vendus (hors invitations gratuites).',
    formula: 'Somme des prix des billets payants',
    limitation: 'Estimation : ne déduit pas encore les remboursements, remises et frais Stripe. Les précommandes (boissons) sont comptées à part.',
  },
  assignedTickets: {
    label: 'Billets émis',
    plain: 'Billets en circulation (vendus + invitations)',
    definition: 'Tous les billets valides existants : ceux payés par les clients ET les invitations gratuites. C’est le nombre de personnes attendues.',
    formula: 'Billets payants + invitations gratuites',
    limitation: 'Ce n’est pas le nombre d’entrées : un billet émis ne devient « présent » qu’une fois scanné à l’entrée.',
  },
  fillRate: {
    label: 'Taux de remplissage',
    plain: 'Part du stock déjà vendue',
    definition: 'Quelle proportion des places en vente a déjà trouvé preneur. Répond à : « suis-je bientôt complet ? ». Avec le filtre catégorie, ne concerne que la place sélectionnée.',
    formula: 'Places vendues ÷ capacité × 100 (une table de groupe = 1 place en vente)',
    limitation: 'Compte les unités VENDABLES : une table vendue compte pour 1, même si elle émet plusieurs billets-sièges. Non calculable sans capacité définie.',
  },
  remaining: {
    label: 'Places restantes',
    plain: 'Encore disponibles à la vente',
    definition: 'Le stock réel encore en vente — le même chiffre que voient les clients sur la page de l’événement. Avec le filtre catégorie, c’est le stock de la place sélectionnée.',
    formula: 'Stock restant de la place (capacité − vendues)',
    limitation: 'Une table de groupe compte pour 1 place en vente. Une session de paiement en cours réserve la place quelques minutes même si elle n’aboutit pas.',
  },
  toScan: {
    label: 'Restent à scanner',
    plain: 'Billets pas encore entrés',
    definition: 'Billets émis dont le QR n’a pas encore été scanné à l’entrée. C’est le nombre de personnes encore attendues.',
    formula: 'Billets émis − entrées confirmées',
    limitation: 'Un billet non scanné n’est pas forcément un absent : la personne n’est peut-être pas encore arrivée.',
  },
  present: {
    label: 'Entrées confirmées',
    plain: 'Personnes réellement entrées (scannées)',
    definition: 'Nombre de billets uniques scannés et validés à l’entrée le soir de l’événement.',
    formula: 'Billets distincts avec un check-in valide',
    limitation: 'Les scans en double ou refusés ne sont pas comptés. Reste à 0 tant que le check-in n’a pas commencé.',
  },
  attendanceRate: {
    label: 'Taux de présence',
    plain: 'Part des billets qui sont venus',
    definition: 'Parmi les gens qui ont un billet, combien se sont réellement présentés. Répond à : « combien d’absents ? »',
    formula: 'Entrées confirmées ÷ billets émis × 100',
    limitation: 'À ne pas confondre avec le taux de remplissage (qui mesure les ventes). Devient fiable pendant / après le check-in.',
  },
}

export function ticketPrice(event, ticket) {
  // Priorité absolue : le prix réellement payé stocké sur le billet.
  // placePrice est écrit par EventDetailPage (billets gratuits).
  // price / amountPaid peuvent être écrits par le webhook Stripe.
  const recorded = ticket?.placePrice ?? ticket?.price ?? ticket?.amountPaid
  if (recorded != null && Number.isFinite(Number(recorded))) return Number(recorded)
  // Fallback : prix actuel de la catégorie dans l'événement.
  // ⚠️ Ce fallback est imprécis si l'organisateur a changé ses tarifs.
  const place = (event?.places || []).find(p => String(p.type) === String(ticket?.place))
  const fallback = Number(place?.price ?? 0) || 0
  if (fallback && typeof ticket?.ticketCode === 'string') {
    console.warn(`[eventStats] ticketPrice fallback pour ${ticket.ticketCode} — placePrice absent, utilisation du prix actuel (${fallback} €). Le webhook devrait écrire placePrice.`)
  }
  return fallback
}

export function eventCapacity(event) {
  // N'utiliser QUE place.total pour la capacité.
  // place.available diminue à chaque vente — l'utiliser comme fallback
  // fausserait le taux de remplissage (capacité qui rétrécit → % aberrant).
  return (event?.places || []).reduce((sum, place) => {
    const value = Number(place.total || 0)
    return sum + (Number.isFinite(value) ? Math.max(0, value) : 0)
  }, 0)
}

// ── Stock de vente (capacité / restantes / vendues) — en UNITÉS VENDABLES ─────
// Source de vérité : place.total et place.available du doc événement (le stock
// vivant, décrémenté transactionnellement à chaque vente). C'est LE même chiffre
// que les clients voient sur la fiche (« 99/100 restantes ») — donc toujours
// cohérent. Une table de groupe compte pour 1 unité (elle émet pourtant
// groupMax billets-sièges) : compter les restantes en « capacité − billets émis »
// était donc structurellement faux pour les tables.
// placeFilter : 'all' = tout l'événement, sinon UNIQUEMENT la place sélectionnée
// (le filtre catégorie de la page stats s'applique ainsi aussi au stock).
export function eventStock(event, placeFilter = 'all') {
  const places = (event?.places || []).filter(p =>
    placeFilter === 'all' || String(p.type || 'Standard') === String(placeFilter))
  let capacity = 0
  let remaining = 0
  for (const place of places) {
    const total = Math.max(0, Number(place.total) || 0)
    if (!total) continue
    capacity += total
    // `available` ABSENT (place sans suivi de stock / legacy) ≠ « 0 restante » :
    // sans ce repli sur `total`, une place non suivie s'affichait 100 % vendue.
    // On distingue `available:0` explicite (réellement épuisé) de l'absence.
    const avail = place.available != null ? Number(place.available) : total
    remaining += Math.max(0, Math.min(total, avail))
  }
  return { capacity, remaining, sold: Math.max(0, capacity - remaining) }
}

export function isActiveTicket(ticket) {
  return Boolean(ticket) && ticket.revoked !== true && ticket.cancelled !== true
}

// `user_events/{uid}` est la source d'appartenance utilisée par "Mes Events".
// Les anciens documents publics `events/{id}` peuvent avoir des métadonnées
// createdBy/organizerId absentes ou obsolètes après une migration.
export function canAccessEventStats({ user, event, userEvent, cachedEvent, eventId }) {
  if (!user) return false
  if (user.role === 'agent') return true
  const uid = String(user.uid || user.id || '')
  if (!uid) return false
  const targetId = String(eventId || event?.id || userEvent?.id || cachedEvent?.id || '')
  if (userEvent && String(userEvent.id) === targetId) return true

  const ownerIds = [event?.createdBy, event?.organizerId].filter(Boolean).map(String)
  if (ownerIds.includes(uid)) return true

  // Vérification hors-ligne : on vérifie aussi le cache local mais uniquement
  // si le propriétaire correspond bien à l'utilisateur connecté.
  const cachedOwnerIds = [cachedEvent?.createdBy, cachedEvent?.organizerId].filter(Boolean).map(String)
  if (cachedOwnerIds.includes(uid) && String(cachedEvent?.id) === targetId) return true

  return false
}

export function filterEventTickets(tickets, filters = {}, now = new Date()) {
  const place = filters.place || 'all'
  const range = filters.range || 'all'
  const cutoff = range === '7d'
    ? now.getTime() - 7 * DAY_MS
    : range === '30d'
      ? now.getTime() - 30 * DAY_MS
      : 0

  return (tickets || []).filter(ticket => {
    if (!isActiveTicket(ticket)) return false
    if (place !== 'all' && String(ticket.place || 'Standard') !== String(place)) return false
    if (cutoff) {
      const timestamp = new Date(ticket.bookedAt || 0).getTime()
      if (!Number.isFinite(timestamp) || timestamp < cutoff) return false
    }
    return true
  })
}

function dayKey(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// Les précommandes existent sous DEUX formes selon la source du billet :
//  A) billets payés via Stripe → le webhook écrit `preorders: [{name, qty, priceEUR, emoji?}]`
//  B) réservations locales / gratuites → `preorderSummary: [{name, emoji, price}]`
//     + `preorderItems: { [name]: quantité }`
// On normalise vers { name, emoji, quantity, price } pour que le CA précommandes
// remonte quelle que soit la source (sinon les vrais achats Stripe étaient ignorés).
export function ticketPreorderLines(ticket) {
  if (!ticket) return []
  if (Array.isArray(ticket.preorders) && ticket.preorders.length) {
    return ticket.preorders
      .map(i => ({
        name: i.name,
        emoji: i.emoji || '',
        quantity: Number(i.qty ?? i.quantity) || 0,
        price: Number(i.priceEUR ?? i.price) || 0,
      }))
      .filter(i => i.name && i.quantity > 0)
  }
  return (ticket.preorderSummary || [])
    .map(i => ({
      name: i.name,
      emoji: i.emoji || '',
      quantity: Number(ticket.preorderItems?.[i.name] ?? i.quantity) || 0,
      price: Number(i.price) || 0,
    }))
    .filter(i => i.name && i.quantity > 0)
}

export function computeEventStats(event, tickets, options = {}) {
  const now = options.now || new Date()
  const active = filterEventTickets(tickets, options.filters, now)
  // Capacité / restantes / vendues : STOCK RÉEL, filtré par la catégorie
  // sélectionnée (avant : capacité globale vs billets filtrés → 110 places
  // affichées pour une place de 100, restantes fausses, et unités mélangées
  // pour les tables de groupe).
  const stock = eventStock(event, options.filters?.place || 'all')
  const capacity = stock.capacity
  const assignedTickets = active.length
  const paidTickets = active.filter(ticket => ticket.paid === true)
  const freeTickets = active.filter(ticket => ticket.paid !== true)
  const presentCodes = new Set(active.filter(ticket => ticket.checkedInAt).map(ticket => ticket.ticketCode || ticket.id))
  const present = presentCodes.size
  const estimatedRevenue = paidTickets.reduce((sum, ticket) => sum + ticketPrice(event, ticket), 0)
  const preorderMap = new Map()
  active.forEach(ticket => {
    for (const line of ticketPreorderLines(ticket)) {
      const current = preorderMap.get(line.name) || { name: line.name, emoji: line.emoji, quantity: 0, revenue: 0 }
      current.quantity += line.quantity
      current.revenue += line.quantity * line.price
      if (!current.emoji && line.emoji) current.emoji = line.emoji
      preorderMap.set(line.name, current)
    }
  })
  const preorderItems = [...preorderMap.values()].sort((a, b) => b.revenue - a.revenue)
  const preorderRevenue = preorderItems.reduce((sum, item) => sum + item.revenue, 0)

  const byPlaceMap = new Map()
  active.forEach(ticket => {
    const name = ticket.place || 'Standard'
    const current = byPlaceMap.get(name) || { name, count: 0, paid: 0, free: 0, revenue: 0, present: 0 }
    current.count += 1
    current.paid += ticket.paid === true ? 1 : 0
    current.free += ticket.paid === true ? 0 : 1
    current.revenue += ticket.paid === true ? ticketPrice(event, ticket) : 0
    // Même déduplication que le compteur global present (Set par ticketCode)
    current.present += ticket.checkedInAt && presentCodes.has(ticket.ticketCode || ticket.id) ? 1 : 0
    byPlaceMap.set(name, current)
  })

  const salesMap = new Map()
  active.forEach(ticket => {
    const key = dayKey(ticket.bookedAt)
    if (!key) return
    const current = salesMap.get(key) || { date: key, tickets: 0, revenue: 0 }
    current.tickets += 1
    current.revenue += ticket.paid === true ? ticketPrice(event, ticket) : 0
    salesMap.set(key, current)
  })

  const salesSeries = [...salesMap.values()].sort((a, b) => a.date.localeCompare(b.date))
  let cumulativeRevenue = 0
  let cumulativeTickets = 0
  salesSeries.forEach(point => {
    cumulativeRevenue += point.revenue
    cumulativeTickets += point.tickets
    point.cumulativeRevenue = cumulativeRevenue
    point.cumulativeTickets = cumulativeTickets
  })

  const uniqueBuyers = new Set(active.map(ticket => ticket.userId).filter(Boolean)).size
  // Remplissage = unités de stock vendues ÷ capacité (cohérent avec « restantes »
  // et avec la fiche événement ; une table = 1). Les billets émis restent un
  // compte de PERSONNES attendues — deux notions distinctes, deux libellés.
  const fillRate = capacity > 0 ? stock.sold / capacity * 100 : null
  const attendanceRate = assignedTickets > 0 ? present / assignedTickets * 100 : null
  const remaining = capacity > 0 ? stock.remaining : null
  const eventDate = new Date(event?.date || 0)
  // Fiabilité du check-in : évaluée sur TOUS les billets de l'événement (pas la
  // vue filtrée) — sinon filtrer sur une catégorie sans scan affichait « check-in
  // pas commencé » alors que des entrées existent déjà.
  const anyCheckedIn = (tickets || []).some(t => isActiveTicket(t) && t.checkedInAt)
  const checkInReliable = anyCheckedIn || (Number.isFinite(eventDate.getTime()) && eventDate.getTime() < now.getTime())

  return {
    tickets: active,
    assignedTickets,
    paidTickets: paidTickets.length,
    freeTickets: freeTickets.length,
    capacity,
    soldUnits: stock.sold,
    fillRate,
    remaining,
    present,
    attendanceRate,
    checkInReliable,
    estimatedRevenue,
    preorderRevenue,
    totalEstimatedRevenue: estimatedRevenue + preorderRevenue,
    preorderItems,
    averageRevenuePerPaidTicket: paidTickets.length ? estimatedRevenue / paidTickets.length : 0,
    uniqueBuyers,
    byPlace: [...byPlaceMap.values()].sort((a, b) => b.count - a.count),
    salesSeries,
  }
}

export function buildEventInsights(stats) {
  const insights = []
  if (stats.fillRate == null) {
    insights.push({ tone: 'gold', text: 'La capacité n’est pas définie : le taux de remplissage ne peut pas être calculé.' })
  } else {
    insights.push({ tone: stats.fillRate >= 80 ? 'teal' : 'gold', text: `${Math.round(stats.fillRate)} % de la capacité est déjà vendue (taux de remplissage).` })
  }

  if (!stats.checkInReliable) {
    insights.push({ tone: 'pink', text: 'Le check-in n’a pas encore commencé. Le taux de présence n’est pas encore fiable.' })
  } else if (stats.attendanceRate != null) {
    insights.push({ tone: stats.attendanceRate >= 75 ? 'teal' : 'gold', text: `${Math.round(stats.attendanceRate)} % des billets émis ont été scannés à l’entrée.` })
  }

  if (stats.assignedTickets === 0) {
    insights.push({ tone: 'muted', text: 'Aucun billet émis pour cette période. Partage la page de l’événement pour lancer les ventes.' })
  } else if (stats.byPlace[0]) {
    insights.push({ tone: 'teal', text: `${stats.byPlace[0].name} est la catégorie la plus demandée avec ${stats.byPlace[0].count} billet${stats.byPlace[0].count > 1 ? 's' : ''}.` })
  }

  insights.push({ tone: 'muted', text: 'Le CA affiché est une estimation billetterie hors remboursements, remises, frais et précommandes.' })
  return insights
}

// ─── Démographie des participants (âge / genre) ───────────────────────────────
// Basée sur le TITULAIRE COURANT de chaque billet (ticket.userId — pour un siège
// de table attribué, c'est l'invité, pas l'acheteur) croisé avec users/{uid}
// (birthYear, gender — renseignés à l'inscription ou dans le profil, OPTIONNELS).
//
// RÈGLES PRODUIT (Chady, 2026-07-10) :
//  - l'âge déclaré ne sert QU'AUX statistiques — jamais à autoriser/bloquer un
//    achat 18+ (donnée modifiable à tout moment, non vérifiable) ;
//  - pour un événement avec limite d'âge (minAge), les tranches commencent à
//    l'âge minimum ; un âge déclaré INFÉRIEUR au minimum est compté dans la
//    première tranche (la personne a forcément l'âge requis à l'entrée) ;
//  - billets sans compte (guestlist non réclamée) ou sans âge/genre renseigné →
//    « Non renseigné », jamais un faux 0 %.
const AGE_BOUNDS = [18, 25, 35, 45] // bornes de tranches standard

export function ageFromBirthYear(birthYear, now = new Date()) {
  const y = Number(birthYear)
  if (!Number.isFinite(y) || y < 1900 || y > now.getFullYear()) return null
  return Math.max(0, now.getFullYear() - y)
}

export function buildAgeBuckets(minAge = 0) {
  const min = Math.max(0, Number(minAge) || 0)
  const bounds = AGE_BOUNDS.filter(b => b > min)
  const buckets = []
  let lower = min
  for (const bound of bounds) {
    buckets.push({ min: lower, max: bound - 1, label: lower === 0 ? `Moins de ${bound} ans` : `${lower}–${bound - 1} ans`, count: 0 })
    lower = bound
  }
  buckets.push({ min: lower, max: null, label: `${lower} ans et +`, count: 0 })
  return buckets
}

export function computeDemographics(tickets, usersById = {}, minAge = 0, now = new Date()) {
  const active = (tickets || []).filter(isActiveTicket)
  const buckets = buildAgeBuckets(minAge)
  const gender = { femme: 0, homme: 0, autre: 0 }
  let ageKnown = 0
  let genderKnown = 0
  let noAccount = 0
  for (const ticket of active) {
    const holder = ticket.userId ? usersById[String(ticket.userId)] : null
    if (!ticket.userId) { noAccount += 1; continue }
    let age = ageFromBirthYear(holder?.birthYear, now)
    if (age != null) {
      // Limite d'âge : un âge déclaré sous le minimum rejoint la première tranche.
      if (minAge > 0 && age < minAge) age = minAge
      const bucket = buckets.find(b => age >= b.min && (b.max == null || age <= b.max))
      if (bucket) { bucket.count += 1; ageKnown += 1 }
    }
    const g = String(holder?.gender || '').toLowerCase()
    if (g === 'femme' || g === 'homme' || g === 'autre') { gender[g] += 1; genderKnown += 1 }
  }
  return {
    total: active.length,
    ageKnown,
    ageUnknown: active.length - ageKnown,
    genderKnown,
    genderUnknown: active.length - genderKnown,
    noAccount,
    buckets,
    gender,
  }
}

export function eventStatsCsvRows(event, stats) {
  return stats.tickets.map(ticket => ({
    ticket_id: ticket.ticketCode || ticket.id || '',
    evenement: event?.name || '',
    categorie: ticket.place || 'Standard',
    prix_estime: ticket.paid === true ? ticketPrice(event, ticket).toFixed(2) : '0.00',
    type: ticket.paid === true ? 'payant' : 'gratuit',
    statut: ticket.checkedInAt ? 'present' : 'attribue',
    acheteur_id: ticket.userId || '',
    date_attribution: ticket.bookedAt || '',
    date_check_in: ticket.checkedInAt || '',
  }))
}

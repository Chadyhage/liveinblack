// Port TypeScript de src/utils/eventStats.js (#7 phase organisateur — page
// statistiques de MesEvenementsPage.jsx). Logique de calcul PURE, portée à
// l'identique ; simplifiée uniquement là où le schéma Mongo est déjà
// canonique (Ticket.preorders a toujours la forme {name,price,qty}, jamais
// les deux formes legacy preorders/preorderSummary+preorderItems).
const DAY_MS = 24 * 60 * 60 * 1000

export const EVENT_STATS_DEFINITIONS = {
  estimatedRevenue: {
    label: 'Recettes billetterie',
    definition: 'Somme des prix payés pour tous les billets vendus (hors invitations gratuites).',
    formula: 'Somme des prix des billets payants',
    limitation: 'Estimation : ne déduit pas encore les remboursements, remises et frais Stripe. Les précommandes (boissons) sont comptées à part.',
  },
  assignedTickets: {
    label: 'Billets émis',
    definition: 'Tous les billets valides existants : ceux payés par les clients ET les invitations gratuites. C’est le nombre de personnes attendues.',
    formula: 'Billets payants + invitations gratuites',
    limitation: 'Ce n’est pas le nombre d’entrées : un billet émis ne devient « présent » qu’une fois scanné à l’entrée.',
  },
  fillRate: {
    label: 'Taux de remplissage',
    definition: 'Quelle proportion des places en vente a déjà trouvé preneur. Répond à : « suis-je bientôt complet ? ». Avec le filtre catégorie, ne concerne que la place sélectionnée.',
    formula: 'Places vendues ÷ capacité × 100 (une table de groupe = 1 place en vente)',
    limitation: 'Compte les unités VENDABLES : une table vendue compte pour 1, même si elle émet plusieurs billets-sièges. Non calculable sans capacité définie.',
  },
  remaining: {
    label: 'Places restantes',
    definition: 'Le stock réel encore en vente — le même chiffre que voient les clients sur la page de l’événement. Avec le filtre catégorie, c’est le stock de la place sélectionnée.',
    formula: 'Stock restant de la place (capacité − vendues)',
    limitation: 'Une table de groupe compte pour 1 place en vente. Une session de paiement en cours réserve la place quelques minutes même si elle n’aboutit pas.',
  },
  toScan: {
    label: 'Restent à scanner',
    definition: 'Billets émis dont le QR n’a pas encore été scanné à l’entrée. C’est le nombre de personnes encore attendues.',
    formula: 'Billets émis − entrées confirmées',
    limitation: 'Un billet non scanné n’est pas forcément un absent : la personne n’est peut-être pas encore arrivée.',
  },
  present: {
    label: 'Entrées confirmées',
    definition: 'Nombre de billets uniques scannés et validés à l’entrée le soir de l’événement.',
    formula: 'Billets distincts avec un check-in valide',
    limitation: 'Les scans en double ou refusés ne sont pas comptés. Reste à 0 tant que le check-in n’a pas commencé.',
  },
  attendanceRate: {
    label: 'Taux de présence',
    definition: 'Parmi les gens qui ont un billet, combien se sont réellement présentés. Répond à : « combien d’absents ? »',
    formula: 'Entrées confirmées ÷ billets émis × 100',
    limitation: 'À ne pas confondre avec le taux de remplissage (qui mesure les ventes). Devient fiable pendant / après le check-in.',
  },
} as const

export interface StatsPlace {
  type: string
  total?: number | null
  available?: number | null
  price?: number | null
}

export interface StatsEvent {
  places?: StatsPlace[] | null
  date?: string | null
  minAge?: number | null
}

export interface StatsTicket {
  ticketCode: string
  place?: string | null
  placePrice?: number | null
  paid?: boolean | null
  checkedInAt?: string | Date | null
  bookedAt?: string | Date | null
  userId?: string | null
  revoked?: boolean | null
  preorders?: { name: string; price?: number | null; qty?: number | null }[] | null
}

export function ticketPrice(event: StatsEvent | null | undefined, ticket: StatsTicket): number {
  const recorded = ticket.placePrice
  if (recorded != null && Number.isFinite(Number(recorded))) return Number(recorded)
  const place = (event?.places || []).find((p) => String(p.type) === String(ticket.place))
  return Number(place?.price ?? 0) || 0
}

export function isActiveTicket(ticket: StatsTicket | null | undefined): boolean {
  return Boolean(ticket) && ticket!.revoked !== true
}

export function eventStock(event: StatsEvent | null | undefined, placeFilter = 'all'): { capacity: number; remaining: number; sold: number } {
  const places = (event?.places || []).filter((p) => placeFilter === 'all' || String(p.type || 'Standard') === String(placeFilter))
  let capacity = 0
  let remaining = 0
  for (const place of places) {
    const total = Math.max(0, Number(place.total) || 0)
    if (!total) continue
    capacity += total
    const avail = place.available != null ? Number(place.available) : total
    remaining += Math.max(0, Math.min(total, avail))
  }
  return { capacity, remaining, sold: Math.max(0, capacity - remaining) }
}

export interface StatsFilters {
  place?: string
  range?: 'all' | '7d' | '30d'
}

export function filterEventTickets(tickets: StatsTicket[] | null | undefined, filters: StatsFilters = {}, now: Date = new Date()): StatsTicket[] {
  const place = filters.place || 'all'
  const range = filters.range || 'all'
  const cutoff = range === '7d' ? now.getTime() - 7 * DAY_MS : range === '30d' ? now.getTime() - 30 * DAY_MS : 0

  return (tickets || []).filter((ticket) => {
    if (!isActiveTicket(ticket)) return false
    if (place !== 'all' && String(ticket.place || 'Standard') !== String(place)) return false
    if (cutoff) {
      const timestamp = new Date(ticket.bookedAt || 0).getTime()
      if (!Number.isFinite(timestamp) || timestamp < cutoff) return false
    }
    return true
  })
}

function dayKey(value: string | Date | null | undefined): string | null {
  const date = new Date(value || 0)
  if (Number.isNaN(date.getTime())) return null
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function ticketPreorderLines(ticket: StatsTicket): { name: string; quantity: number; price: number }[] {
  return (ticket.preorders || [])
    .map((p) => ({ name: p.name, quantity: Number(p.qty) || 0, price: Number(p.price) || 0 }))
    .filter((p) => p.name && p.quantity > 0)
}

export interface EventStatsResult {
  tickets: StatsTicket[]
  assignedTickets: number
  paidTickets: number
  freeTickets: number
  capacity: number
  soldUnits: number
  fillRate: number | null
  remaining: number | null
  present: number
  attendanceRate: number | null
  checkInReliable: boolean
  estimatedRevenue: number
  preorderRevenue: number
  totalEstimatedRevenue: number
  preorderItems: { name: string; quantity: number; revenue: number }[]
  averageRevenuePerPaidTicket: number
  uniqueBuyers: number
  byPlace: { name: string; count: number; paid: number; free: number; revenue: number; present: number }[]
  salesSeries: { date: string; tickets: number; revenue: number; cumulativeRevenue: number; cumulativeTickets: number }[]
}

export function computeEventStats(event: StatsEvent, allTickets: StatsTicket[], options: { now?: Date; filters?: StatsFilters } = {}): EventStatsResult {
  const now = options.now || new Date()
  const active = filterEventTickets(allTickets, options.filters, now)
  const stock = eventStock(event, options.filters?.place || 'all')
  const capacity = stock.capacity
  const assignedTickets = active.length
  const paidTickets = active.filter((t) => t.paid === true)
  const freeTickets = active.filter((t) => t.paid !== true)
  const presentCodes = new Set(active.filter((t) => t.checkedInAt).map((t) => t.ticketCode))
  const present = presentCodes.size
  const estimatedRevenue = paidTickets.reduce((sum, t) => sum + ticketPrice(event, t), 0)

  const preorderMap = new Map<string, { name: string; quantity: number; revenue: number }>()
  for (const ticket of active) {
    for (const line of ticketPreorderLines(ticket)) {
      const current = preorderMap.get(line.name) || { name: line.name, quantity: 0, revenue: 0 }
      current.quantity += line.quantity
      current.revenue += line.quantity * line.price
      preorderMap.set(line.name, current)
    }
  }
  const preorderItems = [...preorderMap.values()].sort((a, b) => b.revenue - a.revenue)
  const preorderRevenue = preorderItems.reduce((sum, item) => sum + item.revenue, 0)

  const byPlaceMap = new Map<string, { name: string; count: number; paid: number; free: number; revenue: number; present: number }>()
  for (const ticket of active) {
    const name = ticket.place || 'Standard'
    const current = byPlaceMap.get(name) || { name, count: 0, paid: 0, free: 0, revenue: 0, present: 0 }
    current.count += 1
    current.paid += ticket.paid === true ? 1 : 0
    current.free += ticket.paid === true ? 0 : 1
    current.revenue += ticket.paid === true ? ticketPrice(event, ticket) : 0
    current.present += ticket.checkedInAt && presentCodes.has(ticket.ticketCode) ? 1 : 0
    byPlaceMap.set(name, current)
  }

  const salesMap = new Map<string, { date: string; tickets: number; revenue: number }>()
  for (const ticket of active) {
    const key = dayKey(ticket.bookedAt)
    if (!key) continue
    const current = salesMap.get(key) || { date: key, tickets: 0, revenue: 0 }
    current.tickets += 1
    current.revenue += ticket.paid === true ? ticketPrice(event, ticket) : 0
    salesMap.set(key, current)
  }
  const salesSeries = [...salesMap.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .reduce<EventStatsResult['salesSeries']>((acc, point) => {
      const prevRevenue = acc.length ? acc[acc.length - 1].cumulativeRevenue : 0
      const prevTickets = acc.length ? acc[acc.length - 1].cumulativeTickets : 0
      acc.push({ ...point, cumulativeRevenue: prevRevenue + point.revenue, cumulativeTickets: prevTickets + point.tickets })
      return acc
    }, [])

  const uniqueBuyers = new Set(active.map((t) => t.userId).filter(Boolean)).size
  const fillRate = capacity > 0 ? (stock.sold / capacity) * 100 : null
  const attendanceRate = assignedTickets > 0 ? (present / assignedTickets) * 100 : null
  const remaining = capacity > 0 ? stock.remaining : null
  const eventDate = new Date(event.date || 0)
  const anyCheckedIn = allTickets.some((t) => isActiveTicket(t) && t.checkedInAt)
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

export interface EventInsight {
  tone: 'gold' | 'teal' | 'pink' | 'muted'
  text: string
}

export function buildEventInsights(stats: EventStatsResult): EventInsight[] {
  const insights: EventInsight[] = []
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
const AGE_BOUNDS = [18, 25, 35, 45]

export function ageFromBirthYear(birthYear: number | null | undefined, now: Date = new Date()): number | null {
  const y = Number(birthYear)
  if (!Number.isFinite(y) || y < 1900 || y > now.getFullYear()) return null
  return Math.max(0, now.getFullYear() - y)
}

export interface AgeBucket {
  min: number
  max: number | null
  label: string
  count: number
}

export function buildAgeBuckets(minAge = 0): AgeBucket[] {
  const min = Math.max(0, Number(minAge) || 0)
  const bounds = AGE_BOUNDS.filter((b) => b > min)
  const buckets: AgeBucket[] = []
  let lower = min
  for (const bound of bounds) {
    buckets.push({ min: lower, max: bound - 1, label: lower === 0 ? `Moins de ${bound} ans` : `${lower}–${bound - 1} ans`, count: 0 })
    lower = bound
  }
  buckets.push({ min: lower, max: null, label: `${lower} ans et +`, count: 0 })
  return buckets
}

export interface DemographicsResult {
  total: number
  ageKnown: number
  ageUnknown: number
  genderKnown: number
  genderUnknown: number
  noAccount: number
  buckets: AgeBucket[]
  gender: { femme: number; homme: number; autre: number }
}

export function computeDemographics(
  tickets: StatsTicket[],
  usersById: Record<string, { birthYear?: number | null; gender?: string | null }>,
  minAge = 0,
  now: Date = new Date()
): DemographicsResult {
  const active = (tickets || []).filter(isActiveTicket)
  const buckets = buildAgeBuckets(minAge)
  const gender = { femme: 0, homme: 0, autre: 0 }
  let ageKnown = 0
  let genderKnown = 0
  let noAccount = 0
  for (const ticket of active) {
    if (!ticket.userId) {
      noAccount += 1
      continue
    }
    const holder = usersById[String(ticket.userId)]
    let age = ageFromBirthYear(holder?.birthYear, now)
    if (age != null) {
      if (minAge > 0 && age < minAge) age = minAge
      const bucket = buckets.find((b) => age! >= b.min && (b.max == null || age! <= b.max))
      if (bucket) {
        bucket.count += 1
        ageKnown += 1
      }
    }
    const g = String(holder?.gender || '').toLowerCase()
    if (g === 'femme' || g === 'homme' || g === 'autre') {
      gender[g] += 1
      genderKnown += 1
    }
  }
  return { total: active.length, ageKnown, ageUnknown: active.length - ageKnown, genderKnown, genderUnknown: active.length - genderKnown, noAccount, buckets, gender }
}

export function eventStatsCsvRows(event: StatsEvent, stats: EventStatsResult): Record<string, string>[] {
  return stats.tickets.map((ticket) => ({
    ticket_id: ticket.ticketCode || '',
    categorie: ticket.place || 'Standard',
    prix_estime: ticket.paid === true ? ticketPrice(event, ticket).toFixed(2) : '0.00',
    type: ticket.paid === true ? 'payant' : 'gratuit',
    statut: ticket.checkedInAt ? 'present' : 'attribue',
    acheteur_id: ticket.userId || '',
    date_attribution: ticket.bookedAt ? new Date(ticket.bookedAt).toISOString() : '',
    date_check_in: ticket.checkedInAt ? new Date(ticket.checkedInAt).toISOString() : '',
  }))
}

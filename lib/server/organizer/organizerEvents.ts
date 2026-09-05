import { getDb } from '@/lib/db/mongoose'
import Application from '@/lib/models/Application'
import Event, { type EventDoc } from '@/lib/models/Event'
import OrganizerProfile from '@/lib/models/OrganizerProfile'
import Order from '@/lib/models/Order'
import Ticket from '@/lib/models/Ticket'
import { loadEventContext } from '../events/eventOrders'
import { regionToCurrency, eventCurrency } from '@/lib/shared/money'
import { getRegionByName, regions } from '@/lib/shared/regions'
import { normalizeRegionId } from '@/lib/shared/locations'
import { notifyNewEvent } from './organizerFollowNotifications'
import { type ShowOption } from '@/lib/shared/showOptions'
import { notifyUserById } from '@/lib/server/emails/notify'
import { eventPublishedEmail, eventRecapBeforeEventEmail } from '@/lib/server/emails'
import EventStaff from '@/lib/models/EventStaff'
import { eventStartMs } from '@/lib/shared/event-time'
import { revalidateTag } from 'next/cache'
import {
  assignStablePlaceIds,
  normalizeMenuItems,
  placeConsumed,
  parseBeninLocalDateTime,
  RECAP_WINDOW_END_MS,
  shouldSendEventRecap,
  toEventDates,
  validatePlaces,
} from './organizerEventUtils'

const SITE = process.env.PUBLIC_SITE_URL || 'https://liveinblack.com'

// Port de la partie CRÉATION/ÉDITION de src/pages/MesEvenementsPage.jsx (#7
// phase organisateur — wizard 5 étapes). Contrairement au legacy (verrouillage
// des champs post-vente PUREMENT côté UI — le research l'a explicitement
// signalé comme une lacune : "rien n'empêche un client malveillant de POSTer
// un payload direct avec les champs verrouillés changés quand même"), CE
// FICHIER revérifie et RE-APPLIQUE chaque règle de verrouillage côté serveur,
// à partir des VRAIS compteurs de stock de l'événement (jamais du nombre
// envoyé par le client) — un appel qui tente de changer un champ verrouillé voit
// simplement sa valeur ignorée (silencieusement restaurée à l'ancienne),
// jamais une erreur bloquante : c'est la même sensation UX que le legacy
// (champ visuellement désactivé), avec la vraie frontière de sécurité en plus.

export interface OrganizerEventCaller {
  id: string
}

type ErrResult = { ok: false; status: number; error: string }

export async function getInitialOrganizerEventRegion(caller: OrganizerEventCaller): Promise<string> {
  await getDb()

  const profile = await OrganizerProfile.findOne({ userId: caller.id }).select('regionId country').lean()
  const profileRegionId = normalizeRegionId(profile?.regionId || profile?.country || '')
  const profileRegion = regions.find((region) => region.id === profileRegionId)
  if (profileRegion) return profileRegion.name

  const application = await Application.findOne({ userId: caller.id, type: 'organisateur' }).select('formData').lean()
  const formData = (application?.formData as Record<string, unknown> | undefined) ?? {}
  const applicationRegionId = normalizeRegionId(String(formData.pays || ''))
  const applicationRegion = regions.find((region) => region.id === applicationRegionId)
  return applicationRegion?.name || ''
}

export interface PlaceInput {
  id: string
  type: string
  price: number
  total: number
  icon?: string
  maxPerAccount?: number
  groupType?: 'solo' | 'group'
  groupMin?: number
  groupMax?: number
  cancellationOptionEnabled?: boolean
  photos?: string[]
  included?: { name: string; qty: number }[]
}

export interface MenuItemInput {
  name: string
  emoji?: string
  imageUrl?: string | null
  price?: number
  category?: string
  description?: string
  available?: boolean
  hasShow?: boolean
  showOptions?: Array<ShowOption | string>
  excludedPlaces?: string[]
}

export interface ArtistInput {
  name: string
  role?: string
  // Lien optionnel vers un vrai profil prestataire (#E7) — voir
  // lib/models/Event.ts::artistSchema.providerId.
  providerId?: string | null
}

export interface EventFormInput {
  name: string
  subtitle?: string
  description?: string
  category?: string
  tags?: string[]
  eventType?: string
  musicStyles?: string[]
  ambiances?: string[]
  date: string
  dateDisplay?: string
  time?: string
  endTime?: string
  location?: string
  city: string
  region: string
  imageUrl?: string | null
  videoUrl?: string | null
  color?: string
  accentColor?: string
  places: PlaceInput[]
  playlist?: boolean
  preorder?: boolean
  menu?: MenuItemInput[] | null
  artists?: ArtistInput[]
  dj?: string
  performers?: string[]
  minAge?: number
  publishAt?: string | null
  closingDate?: string | null
  currency?: 'EUR' | 'XOF'
}

export interface OrganizerEventView {
  id: string
  name: string
  date: string
  dateDisplay: string
  time: string
  cancelled: boolean
  postponed: boolean
  publishAt: string | null
  imageUrl: string | null
  videoUrl: string | null
  city: string
  region: string
  currency: 'EUR' | 'XOF'
  soldCount: number
  totalCapacity: number
  ticketCount: number
  revenue: number
}

export type CreateEventResult = ErrResult | { ok: true; eventId: string }
export type UpdateEventResult = ErrResult | { ok: true }
export type ListMyEventsResult = { ok: true; events: OrganizerEventView[] }

// ──────────────────────────────── createOrganizerEvent ──────────────────────

export async function createOrganizerEvent(caller: OrganizerEventCaller, callerName: string, input: EventFormInput): Promise<CreateEventResult> {
  await getDb()

  if (!input.name?.trim()) return { ok: false, status: 400, error: 'name_required' }
  if (!input.date) return { ok: false, status: 400, error: 'date_required' }
  if (!input.city?.trim()) return { ok: false, status: 400, error: 'city_required' }
  if (!input.region?.trim()) return { ok: false, status: 400, error: 'region_required' }

  const region = getRegionByName(input.region)
  if (region.id !== 'benin') return { ok: false, status: 400, error: 'benin_launch_region_required' }
  const currency = regionToCurrency(region.name)

  const placesError = validatePlaces(input.places || [])
  if (placesError) return { ok: false, status: 400, error: placesError }
  const places = assignStablePlaceIds(input.places || [])

  const event = await Event.create({
    name: input.name.trim(),
    subtitle: input.subtitle || '',
    description: input.description || '',
    category: input.category || '',
    tags: input.tags || [],
    eventType: input.eventType || '',
    musicStyles: input.musicStyles || [],
    ambiances: input.ambiances || [],
    date: input.date,
    dateDisplay: input.dateDisplay || toEventDates(input.date),
    time: input.time || '22:00',
    endTime: input.endTime || '05:00',
    publishAt: input.publishAt ? parseBeninLocalDateTime(input.publishAt) : null,
    publishedAt: input.publishAt ? null : new Date(),
    closingDate: input.closingDate ? parseBeninLocalDateTime(input.closingDate) : null,
    location: input.location || '',
    city: input.city.trim(),
    region: region.name,
    currency,
    imageUrl: input.imageUrl || null,
    videoUrl: input.videoUrl || null,
    color: '#2a2a2f',
    accentColor: '#f53d8d',
    places,
    playlist: Boolean(input.playlist),
    preorder: Boolean(input.preorder),
    // Le menu reste nécessaire quand une consommation est incluse dans une
    // place, même si la précommande payante est désactivée.
    menu: input.menu ? normalizeMenuItems(input.menu) : null,
    artists: input.artists || [],
    dj: input.dj || '',
    performers: input.performers || [],
    minAge: input.minAge ?? 18,
    userCreated: true,
    createdBy: caller.id,
    organizerId: caller.id,
    organizerName: callerName,
    organizer: callerName,
  })

  // Alerte `newEvent` aux abonnés — port de old/api/send-email.js:
  // notifyFollowers : un événement à publication DIFFÉRÉE (publishAt futur)
  // ne notifie pas à l'instant de la création — seule une publication
  // IMMÉDIATE déclenche l'email ici. Ne doit jamais faire échouer la
  // création de l'événement : erreur avalée, jamais propagée.
  if (!event.publishAt) {
    try {
      await notifyNewEvent(caller.id, callerName, {
        id: String(event._id),
        name: event.name,
        dateDisplay: event.dateDisplay,
        date: event.date,
        time: event.time,
        location: event.location,
        city: event.city,
      })
    } catch (err) {
      console.error('[organizerEvents] notifyNewEvent failed:', err)
    }
    await notifyUserById(caller.id, () => eventPublishedEmail(event.name, `${SITE}/events/${String(event._id)}`, SITE))
  }
  revalidateTag('public-events', 'default')
  revalidateTag('public-organizers', 'default')
  // Publication différée (publishAt futur) : aucun cron ne bascule
  // aujourd'hui le statut au moment venu (vérifié seulement à la LECTURE,
  // voir orders.ts/organizers.ts) — E23 ne part donc que sur publication
  // immédiate, limitation connue, signalée plutôt que devinée.

  return { ok: true, eventId: String(event._id) }
}

// ──────────────────────────────── updateOrganizerEvent ──────────────────────

export async function updateOrganizerEvent(caller: OrganizerEventCaller, eventId: string, input: Partial<EventFormInput>): Promise<UpdateEventResult> {
  await getDb()

  const ctxResult = await loadEventContext(eventId, caller.id)
  if (!ctxResult.ok) return ctxResult
  const { event, rank } = ctxResult.ctx
  // Seul le propriétaire (rang 3, cf. eventOrders.ts:computeAuthContext) peut
  // éditer un événement — jamais un simple membre d'équipe (manager compris :
  // "manager" au sens EventStaff est un rang d'équipe SUR PLACE, pas
  // l'organisateur lui-même ; seul `organizerId===caller.id` doit passer ici).
  if (event.organizerId !== caller.id && event.createdBy !== caller.id) return { ok: false, status: 403, error: 'forbidden' }
  void rank

  // Un événement annulé est intégralement figé (Gap "isReadOnly" du research)
  // — aucune mutation, quelle qu'elle soit.
  if (event.cancelled) return { ok: false, status: 409, error: 'event_cancelled' }

  const totalSold = event.places.reduce((sum, p) => sum + placeConsumed(p), 0)
  const locked = totalSold > 0

  // Champs toujours éditables, même verrouillé (description, affiche, vidéo,
  // artistes, date de clôture) — jamais bloqués par `locked`.
  if (input.name?.trim()) event.name = input.name.trim()
  if (input.description !== undefined) event.description = input.description
  if (input.imageUrl !== undefined) event.imageUrl = input.imageUrl
  if (input.videoUrl !== undefined) event.videoUrl = input.videoUrl
  if (input.artists !== undefined) event.artists = input.artists as typeof event.artists
  if (input.dj !== undefined) event.dj = input.dj
  if (input.performers !== undefined) event.performers = input.performers
  if (input.closingDate !== undefined) event.closingDate = input.closingDate ? parseBeninLocalDateTime(input.closingDate) : null
  if (input.subtitle !== undefined) event.subtitle = input.subtitle
  if (input.category !== undefined) event.category = input.category
  if (input.tags !== undefined) event.tags = input.tags
  if (input.musicStyles !== undefined) event.musicStyles = input.musicStyles
  if (input.ambiances !== undefined) event.ambiances = input.ambiances
  event.color = '#2a2a2f'
  event.accentColor = '#f53d8d'

  // Champs verrouillés dès la première vente — ignorés silencieusement (pas
  // d'erreur) si `locked`, exactement fidèle à la désactivation visuelle du
  // formulaire legacy.
  if (!locked) {
    if (input.date !== undefined) event.date = input.date
    if (input.dateDisplay !== undefined) event.dateDisplay = input.dateDisplay
    if (input.time !== undefined) event.time = input.time
    if (input.endTime !== undefined) event.endTime = input.endTime
    if (input.eventType !== undefined) event.eventType = input.eventType
    if (input.minAge !== undefined) event.minAge = input.minAge
    if (input.location !== undefined) event.location = input.location
    if (input.city !== undefined) event.city = input.city
    if (input.playlist !== undefined) event.playlist = input.playlist
    if (input.preorder !== undefined) event.preorder = input.preorder
    if (input.publishAt !== undefined) event.publishAt = input.publishAt ? new Date(input.publishAt) : null
    // Région : jamais recalculée depuis une région déjà différente si des
    // ventes existent (fige aussi la devise, cf. Gap "devise #2" du research
    // — la devise, elle, n'est JAMAIS recalculée ici, seulement à la
    // création).
    if (input.region !== undefined) event.region = getRegionByName(input.region).name
  }

  // Menu : verrouillé dès qu'une vente quelconque existe sur l'événement
  // (approximation volontaire de "précommande réelle passée" — un contrôle
  // plus fin par item nécessiterait de croiser EventOrder, hors périmètre de
  // cette passe).
  if (!locked && input.menu !== undefined) event.menu = (input.menu ? normalizeMenuItems(input.menu) : null) as typeof event.menu

  // Places : fusion par id STABLE, jamais par index ni par nom — une place
  // avec des ventes garde type/prix/plancher-de-quantité/groupe verrouillés ;
  // ses photos et items inclus restent éditables. Une place SANS vente est
  // entièrement remplacée par la valeur envoyée. Toute place réellement
  // supprimée côté client mais ayant des ventes est CONSERVÉE (jamais perdue)
  // — l'historique de vente doit toujours pouvoir se rattacher à une place.
  if (input.places) {
    const placesError = validatePlaces(input.places)
    if (placesError) return { ok: false, status: 400, error: placesError }
    const incomingById = new Map(assignStablePlaceIds(input.places).map((p) => [p.id, p]))
    const nextPlaces = event.places.map((existing) => {
      const sold = placeConsumed(existing)
      const incoming = incomingById.get(existing.id)
      incomingById.delete(existing.id)
      if (!incoming) return sold > 0 ? existing : null // supprimée : gardée seulement si vendue
      if (sold > 0) {
        // Verrouillé : seuls photos/included/total (jamais en dessous du
        // vendu) changent — `available` suit le DELTA de total pour ne
        // jamais effacer la consommation déjà enregistrée (Order ou
        // guestlist confondus).
        const newTotal = Math.max(incoming.total ?? existing.total, sold)
        const delta = newTotal - (existing.total ?? 0)
        return {
          ...existing.toObject(),
          total: newTotal,
          available: (existing.available ?? 0) + delta,
          photos: incoming.photos ?? existing.photos,
          included: incoming.included ?? existing.included,
          cancellationOptionEnabled: Boolean(incoming.cancellationOptionEnabled),
        }
      }
      return { ...incoming }
    })
    for (const [, incoming] of incomingById) nextPlaces.push({ ...incoming }) // nouvelles places
    event.places = nextPlaces.filter(Boolean) as typeof event.places
  }

  await event.save()
  revalidateTag('public-events', 'default')
  revalidateTag('public-organizers', 'default')
  return { ok: true }
}

// ──────────────────────────────── listMyOrganizerEvents ─────────────────────

export async function listMyOrganizerEvents(caller: OrganizerEventCaller): Promise<ListMyEventsResult> {
  await getDb()

  const events = await Event.find({ $or: [{ organizerId: caller.id }, { createdBy: caller.id }] })
    .sort({ date: -1 })
    .lean()
  if (events.length === 0) return { ok: true, events: [] }

  const eventIds = events.map((e) => String(e._id))
  const soldRows = await Order.aggregate([
    { $match: { eventId: { $in: eventIds }, status: 'paid' } },
    { $group: { _id: '$eventId', sold: { $sum: '$qty' } } },
  ])
  const soldByEventId = new Map(soldRows.map((row) => [row._id as string, row.sold as number]))
  // Revenu/nombre de billets affichés sur les lignes "Terminé" du tableau de
  // bord — agrégé depuis Ticket (source canonique des ventes RÉELLES, y
  // compris précommandes), pas depuis Order (qui ne verrait pas certains
  // ajustements post-vente). Billets révoqués exclus, gratuits/guestlist
  // comptés dans ticketCount mais à 0 € dans revenue (déjà le cas car
  // totalPrice vaut 0 pour eux).
  const ticketRows = await Ticket.aggregate([
    { $match: { eventId: { $in: eventIds }, revoked: { $ne: true } } },
    { $group: { _id: '$eventId', ticketCount: { $sum: 1 }, revenue: { $sum: '$totalPrice' } } },
  ])
  const ticketStatsByEventId = new Map(ticketRows.map((r) => [r._id as string, { ticketCount: r.ticketCount as number, revenue: r.revenue as number }]))

  return {
    ok: true,
    events: events.map((e) => {
      const ticketStats = ticketStatsByEventId.get(String(e._id))
      return {
        id: String(e._id),
        name: e.name,
        date: e.date,
        dateDisplay: e.dateDisplay ?? '',
        time: e.time ?? '',
        cancelled: Boolean(e.cancelled),
        postponed: Boolean(e.postponedFrom),
        publishAt: e.publishAt ? new Date(e.publishAt).toISOString() : null,
        imageUrl: e.imageUrl ?? null,
        videoUrl: e.videoUrl ?? null,
        city: e.city ?? '',
        region: e.region ?? '',
        currency: eventCurrency(e),
        soldCount: ticketStats?.ticketCount ?? soldByEventId.get(String(e._id)) ?? 0,
        totalCapacity: (e.places || []).reduce((sum, place) => sum + Math.max(0, place.total ?? 0), 0),
        ticketCount: ticketStats?.ticketCount ?? 0,
        revenue: ticketStats?.revenue ?? 0,
      }
    }),
  }
}

// ────────────────────────────── getMyOrganizerEventDetail ───────────────────

export interface OrganizerEventDetailPlace {
  id: string
  type: string
  price: number
  total: number
  available: number
  sold: number
  icon: string
  maxPerAccount: number
  groupType: 'solo' | 'group'
  groupMin: number
  groupMax: number
  cancellationOptionEnabled: boolean
  photos: string[]
  included: { name: string; qty: number }[]
}

export interface OrganizerEventDetailView {
  id: string
  name: string
  subtitle: string
  description: string
  category: string
  tags: string[]
  eventType: string
  musicStyles: string[]
  ambiances: string[]
  date: string
  dateDisplay: string
  time: string
  endTime: string
  location: string
  city: string
  region: string
  currency: 'EUR' | 'XOF'
  imageUrl: string | null
  videoUrl: string | null
  color: string
  accentColor: string
  places: OrganizerEventDetailPlace[]
  playlist: boolean
  preorder: boolean
  menu: MenuItemInput[] | null
  artists: ArtistInput[]
  dj: string
  performers: string[]
  minAge: number
  publishAt: string | null
  closingDate: string | null
  cancelled: boolean
  postponedFrom: { date: string; time: string } | null
  locked: boolean
  totalSold: number
}

export type GetEventDetailResult = ErrResult | { ok: true; event: OrganizerEventDetailView }

// Vue COMPLÈTE d'un événement pour le wizard d'édition — jamais utilisée
// pour un affichage public. `locked` et `sold` par place sont des
// indications de present PURE UI (griser les champs) — la vraie frontière
// de verrouillage reste updateOrganizerEvent, re-vérifiée serveur à chaque
// sauvegarde, jamais dérivée de ce que le client renvoie ici.
export async function getMyOrganizerEventDetail(caller: OrganizerEventCaller, eventId: string): Promise<GetEventDetailResult> {
  await getDb()

  const event = await Event.findById(eventId).lean()
  if (!event) return { ok: false, status: 404, error: 'event_not_found' }
  if (event.organizerId !== caller.id && event.createdBy !== caller.id) return { ok: false, status: 403, error: 'forbidden' }

  const totalSold = (event.places || []).reduce((sum, p) => sum + placeConsumed(p), 0)

  return {
    ok: true,
    event: {
      id: String(event._id),
      name: event.name,
      subtitle: event.subtitle ?? '',
      description: event.description ?? '',
      category: event.category ?? '',
      tags: event.tags ?? [],
      eventType: event.eventType ?? '',
      musicStyles: event.musicStyles ?? [],
      ambiances: event.ambiances ?? [],
      date: event.date,
      dateDisplay: event.dateDisplay ?? '',
      time: event.time ?? '',
      endTime: event.endTime ?? '',
      location: event.location ?? '',
      city: event.city ?? '',
      region: event.region ?? '',
      currency: eventCurrency(event),
      imageUrl: event.imageUrl ?? null,
      videoUrl: event.videoUrl ?? null,
      color: event.color ?? '#2a2a2f',
      accentColor: event.accentColor ?? '#f53d8d',
      places: (event.places || []).map((p) => ({
        id: p.id,
        type: p.type,
        price: p.price ?? 0,
        total: p.total ?? 0,
        available: p.available ?? 0,
        sold: placeConsumed(p),
        icon: p.icon ?? '',
        maxPerAccount: p.maxPerAccount ?? 0,
        groupType: (p.groupType as 'solo' | 'group') ?? 'solo',
        groupMin: p.groupMin ?? 0,
        groupMax: p.groupMax ?? 0,
        cancellationOptionEnabled: Boolean(p.cancellationOptionEnabled),
        photos: p.photos ?? [],
        included: p.included ?? [],
      })),
      playlist: Boolean(event.playlist),
      preorder: Boolean(event.preorder),
      menu: event.menu ? normalizeMenuItems(event.menu as MenuItemInput[]) : null,
      artists: event.artists ?? [],
      dj: event.dj ?? '',
      performers: event.performers ?? [],
      minAge: event.minAge ?? 18,
      publishAt: event.publishAt ? new Date(event.publishAt).toISOString() : null,
      closingDate: event.closingDate ? new Date(event.closingDate).toISOString() : null,
      cancelled: Boolean(event.cancelled),
      postponedFrom: event.postponedFrom ?? null,
      locked: totalSold > 0,
      totalSold,
    },
  }
}

export type { EventDoc }

// ─────────────────────────── sendEventRecapReminders ────────────────────────
// Récap organisateur "c'est dans 2 jours" — voir
// app/api/cron/event-recap/route.ts. `recapEmailSentAt` garantit un seul
// envoi par événement (réinitialisé par postponeOrganizerEvent si la date
// change, voir lib/server/organizerEventLifecycle.ts). Fenêtre large (24h)
// pour absorber un cron qui ne tournerait pas exactement toutes les heures.
export async function sendEventRecapReminders(): Promise<{ reminded: number }> {
  await getDb()
  const now = Date.now()
  // Pré-filtre grossier sur `date` (string 'YYYY-MM-DD') pour éviter de
  // charger tous les événements à venir — la fenêtre exacte est ensuite
  // vérifiée avec eventStartMs (fuseau horaire correct).
  const from = new Date(now).toISOString().slice(0, 10)
  const to = new Date(now + RECAP_WINDOW_END_MS + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const candidates = await Event.find({ date: { $gte: from, $lte: to }, cancelled: false, recapEmailSentAt: null })

  let reminded = 0
  for (const event of candidates) {
    const startMs = eventStartMs(event)
    if (!shouldSendEventRecap(startMs, now)) continue

    const claimed = await Event.updateOne({ _id: event._id, recapEmailSentAt: null }, { $set: { recapEmailSentAt: new Date() } })
    if (claimed.modifiedCount !== 1) continue

    const [ticketsSold, staffDoc] = await Promise.all([
      Ticket.countDocuments({ eventId: String(event._id), revoked: { $ne: true } }),
      EventStaff.findOne({ eventId: String(event._id) }).lean(),
    ])
    const staffCount = staffDoc?.roster ? Object.keys(staffDoc.roster instanceof Map ? Object.fromEntries(staffDoc.roster) : staffDoc.roster).length : 0

    await notifyUserById(event.organizerId, () =>
      eventRecapBeforeEventEmail(
        { eventName: event.name, eventWhen: [event.dateDisplay || event.date, event.time].filter(Boolean).join(' · '), ticketsSold, staffCount, dashboardUrl: `${SITE}/spaces/organizer/${String(event._id)}` },
        SITE
      )
    )
    reminded += 1
  }
  return { reminded }
}

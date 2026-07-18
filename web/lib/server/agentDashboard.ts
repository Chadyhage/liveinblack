import { getDb } from '../db/mongoose'
import User from '../models/User'
import Application from '../models/Application'
import Event from '../models/Event'
import Order from '../models/Order'
import Ticket from '../models/Ticket'
import Boost from '../models/Boost'
import { getEventEndTimestamp } from '../shared/eventUrgency'
import type { EventLike } from '../shared/event-types'

// Port de l'onglet « Tableau de bord » de src/pages/AgentPage.jsx
// (tab === 'dashboard', #101 phase agent/admin). Reproduit les métriques
// « Métriques business » et « Communauté » du legacy — PAS les sections
// « Emails non vérifiés » et « Doublons » (actions de modération de comptes,
// hors périmètre : elles appartiennent à la gestion de comptes, #99), ni la
// liste « Inscriptions récentes » (même raison : lister des comptes avec
// détail/clic est le terrain de #99, pas d'un panneau de stats en lecture
// seule).
//
// Sources de vérité, différentes du legacy par nécessité de schéma :
// - Le legacy agrégeait tout depuis `bookings/{id}` (un doc Firestore par
//   commande, avec `tickets[]` et `amountTotalCents/amountTotal` déjà
//   calculés par le webhook). Cette migration a scindé cette notion en deux
//   modèles : `Order` (paiement, prix figé, frais — lib/models/Order.ts) et
//   `Ticket` (un document par billet réellement émis — lib/models/Ticket.ts).
//   Le calcul GMV/frais tourne donc sur `Order` (même formule que
//   `fulfillOrder.ts:expectedTotalMinor` — prix unitaire × sièges + précommandes
//   + frais), et le comptage de billets tourne directement sur `Ticket`
//   (source plus fiable qu'un `qty` recompté, et qui exclut nativement les
//   billets gratuits/guestlist, `paid:false`, comme le legacy qui ne lisait
//   que des bookings issus des webhooks).
// - `isUserOnline` legacy comparait `lastSeen` à une fenêtre de 5 min, calée
//   sur la cadence de présence Firestore d'alors. Cette migration n'a plus de
//   canal de présence : `lastSeenAt` est mis à jour par le heartboard client
//   toutes les ~20s (lib/server/presence.ts), donc une fenêtre de 45s (même
//   valeur que `ONLINE_WINDOW_MS` dans presence.ts) reflète mieux « en ligne
//   maintenant » que les 5 minutes historiques.
// - Il n'existe plus de collection « demandes de rôle » séparée (le legacy
//   distinguait applications et roleRequests) : toute demande, nouvelle
//   candidature ou rôle additionnel, passe par le même modèle `Application`
//   (voir lib/server/applications.ts) — le compte de dossiers en attente est
//   donc une seule requête, pas une somme de deux collections.

const PENDING_APPLICATION_STATUSES = ['submitted', 'under_review', 'resubmitted'] as const
const ONLINE_WINDOW_MS = 45_000
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

const DASHBOARD_ROLES = ['client', 'organisateur', 'prestataire'] as const
type DashboardRole = (typeof DASHBOARD_ROLES)[number]

export interface DashboardStats {
  revenue: {
    platformRevenueEUR: number
    ticketFeeRevenueEUR: number
    ticketFeeRevenueXOF: number
    gmvBoosts: number
    gmvTicketsEUR: number
    gmvTicketsXOF: number
  }
  tickets: {
    totalSold: number
    recentSold30d: number
  }
  events: {
    totalPublished: number
    upcoming: number
  }
  community: {
    totalUsers: number
    totalOnline: number
    totalPrestataires: number
    totalOrganisateurs: number
    pendingDossiers: number
    newAccountsThisMonth: number
  }
  signupsLast30Days: { date: string; count: number }[]
  roleBreakdown: { role: DashboardRole; count: number }[]
  updatedAt: string
}

function bucketSignupsByDay(dates: Date[], now: number): { date: string; count: number }[] {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const startOfToday = today.getTime()

  const counts = new Array<number>(30).fill(0)
  for (const d of dates) {
    // Comparer des débuts de jour (pas des horodatages bruts) : sinon un
    // signup "aujourd'hui" donne une différence négative non multiple de
    // DAY_MS, `Math.floor` arrondit vers -1 jour et le bucket "aujourd'hui"
    // (index 29) est systématiquement vide.
    const dayStart = new Date(d.getTime())
    dayStart.setHours(0, 0, 0, 0)
    const daysAgo = Math.round((startOfToday - dayStart.getTime()) / DAY_MS)
    const dayIndex = 29 - daysAgo
    if (dayIndex >= 0 && dayIndex < 30) counts[dayIndex] += 1
  }

  const days: { date: string; count: number }[] = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(startOfToday - i * DAY_MS)
    days.push({ date: d.toISOString().slice(0, 10), count: counts[29 - i] })
  }
  return days
}

export async function getAgentDashboardStats(now: number = Date.now()): Promise<DashboardStats> {
  await getDb()

  const thirtyDaysAgo = new Date(now - THIRTY_DAYS_MS)
  const onlineSince = new Date(now - ONLINE_WINDOW_MS)

  const [
    totalUsers,
    totalOnline,
    totalPrestataires,
    totalOrganisateurs,
    newAccountsThisMonth,
    pendingDossiers,
    totalEventsPublished,
    totalTicketsSold,
    recentSold30d,
    revenueByCurrencyRaw,
    boostAggRaw,
    roleCountsRaw,
    recentSignups,
    activeEventsForTiming,
  ] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ lastSeenAt: { $gte: onlineSince } }),
    User.countDocuments({ activeRole: 'prestataire' }),
    User.countDocuments({ activeRole: 'organisateur' }),
    User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
    Application.countDocuments({ status: { $in: PENDING_APPLICATION_STATUSES } }),
    Event.countDocuments({}),
    Ticket.countDocuments({ paid: true }),
    Ticket.countDocuments({ paid: true, bookedAt: { $gte: thirtyDaysAgo } }),
    Order.aggregate([
      { $match: { paid: true } },
      {
        $project: {
          currency: 1,
          unitPriceMinor: 1,
          feeMinor: 1,
          seatCount: { $cond: ['$isTable', 1, '$qty'] },
          preorderTotal: {
            $sum: {
              $map: { input: '$preorders', as: 'p', in: { $multiply: ['$$p.price', '$$p.qty'] } },
            },
          },
        },
      },
      {
        $group: {
          _id: '$currency',
          feeMinor: { $sum: '$feeMinor' },
          gmvMinor: { $sum: { $add: [{ $multiply: ['$unitPriceMinor', '$seatCount'] }, '$preorderTotal', '$feeMinor'] } },
        },
      },
    ]),
    Boost.aggregate([{ $match: { status: { $nin: ['refunded_conflict', 'cancelled'] } } }, { $group: { _id: null, total: { $sum: '$price' } } }]),
    User.aggregate([{ $match: { activeRole: { $in: DASHBOARD_ROLES as unknown as string[] } } }, { $group: { _id: '$activeRole', count: { $sum: 1 } } }]),
    User.find({ createdAt: { $gte: thirtyDaysAgo } }).select('createdAt').lean(),
    Event.find({ cancelled: { $ne: true } }).select('date time endTime cancelled').lean(),
  ])

  const revenueByCurrency = revenueByCurrencyRaw as { _id: string; feeMinor: number; gmvMinor: number }[]
  const eurRow = revenueByCurrency.find((r) => String(r._id).toUpperCase() === 'EUR')
  const xofRow = revenueByCurrency.find((r) => String(r._id).toUpperCase() === 'XOF')

  const ticketFeeRevenueEUR = (eurRow?.feeMinor ?? 0) / 100
  const ticketFeeRevenueXOF = xofRow?.feeMinor ?? 0
  const gmvTicketsEUR = (eurRow?.gmvMinor ?? 0) / 100
  const gmvTicketsXOF = xofRow?.gmvMinor ?? 0
  const gmvBoosts = (boostAggRaw as { total: number }[])[0]?.total ?? 0
  const platformRevenueEUR = ticketFeeRevenueEUR + gmvBoosts

  const upcoming = (activeEventsForTiming as EventLike[]).filter((ev) => {
    const end = getEventEndTimestamp(ev)
    return end > 0 && end > now
  }).length

  const roleCountByRole = new Map<string, number>()
  for (const row of roleCountsRaw as { _id: string; count: number }[]) roleCountByRole.set(row._id, row.count)
  const roleBreakdown = DASHBOARD_ROLES.map((role) => ({ role, count: roleCountByRole.get(role) ?? 0 }))

  const signupsLast30Days = bucketSignupsByDay(
    (recentSignups as { createdAt?: Date }[]).map((u) => u.createdAt).filter((d): d is Date => Boolean(d)),
    now
  )

  return {
    revenue: {
      platformRevenueEUR,
      ticketFeeRevenueEUR,
      ticketFeeRevenueXOF,
      gmvBoosts,
      gmvTicketsEUR,
      gmvTicketsXOF,
    },
    tickets: {
      totalSold: totalTicketsSold,
      recentSold30d: recentSold30d,
    },
    events: {
      totalPublished: totalEventsPublished,
      upcoming,
    },
    community: {
      totalUsers,
      totalOnline,
      totalPrestataires,
      totalOrganisateurs,
      pendingDossiers,
      newAccountsThisMonth,
    },
    signupsLast30Days,
    roleBreakdown,
    updatedAt: new Date(now).toISOString(),
  }
}

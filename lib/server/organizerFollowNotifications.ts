import { getDb } from '../db/mongoose'
import OrganizerFollow from '../models/OrganizerFollow'
import User from '../models/User'
import { sendEmail } from './email'
import { organizerNewEventEmail, organizerScheduleChangeEmail, type FollowedEventSummary } from './email-templates'

// LIVRAISON email des alertes d'abonnement organisateur — précédemment hors
// périmètre (voir l'ancien en-tête de lib/server/organizerFollows.ts, qui
// documentait explicitement ce manque). Le legacy (src/utils/organizers.js:
// startOrganizerNotificationBridge) ne déclenchait que des notifications
// IN-APP côté client à partir d'un listener temps réel Firestore + Firebase
// Cloud Messaging pour le push ; ni l'un ni l'autre n'existe dans cette
// migration (temps réel = polling only, jamais de push/WebSocket, cf.
// AGENTS.md/CLAUDE.md). Email est donc ici le SEUL canal de livraison — comme
// pour les rappels d'abonnement prestataire (lib/server/providerSubscriptions.ts).
//
// Portée de CE module : le fan-out « abonnés d'un organisateur qui ont
// l'alerte X activée → un email chacun », rien d'autre. Les points de
// déclenchement (quand appeler quoi) vivent dans le code métier concerné
// (lib/server/organizerEvents.ts, lib/server/organizerEventLifecycle.ts).
//
// Alertes SANS déclencheur câblé pour l'instant, documenté ici plutôt que de
// forcer un hook fragile (cf. limite explicitement acceptée dans la tâche) :
//  - `ticketing` (« ouverture billetterie ») : jamais câblée non plus côté
//    legacy — la préférence existe dans FollowedOrganizersPage.jsx mais aucun
//    code (client ou serveur) ne la déclenche jamais dans old/src ou old/api.
//    Cette migration n'a pas non plus de transition d'état "billetterie
//    ouverte" distincte de la création/publication de l'événement (déjà
//    couverte par `newEvent`) — rien à câbler sans inventer un nouveau concept.
//  - `almostFull` : câblée côté legacy uniquement dans le bridge IN-APP client
//    (recalcul du ratio restant/total à chaque snapshot Firestore reçu, avec
//    marqueur anti-doublon local). Le pendant serveur nécessiterait un calcul
//    de franchissement de seuil (85% vendu) déclenché à CHAQUE vente
//    (lib/server/orders.ts / guestlist.ts), avec sa propre idempotence
//    (« déjà notifié pour cet event ») — non-trivial et hors du périmètre
//    réaliste de cette passe ; laissé pour une phase dédiée au stock.
//  - `newMedia` : un point d'accroche propre EXISTE (uploadOrganizerProfileMedia
//    dans lib/server/organizerProfile.ts), mais il est hors périmètre de cette
//    tâche (qui cible organizerEvents.ts / lifecycle événement) — non câblé
//    ici pour rester sur les 2-3 déclencheurs bien définis demandés.
//  - `importantAnnouncements` : aucune fonctionnalité « annonce organisateur »
//    n'existe ni côté legacy (grep old/src et old/api : aucune occurrence hors
//    du toggle de préférence lui-même) ni dans ce port — rien à câbler.

export type OrganizerFollowAlertType =
  | 'newEvent'
  | 'ticketing'
  | 'almostFull'
  | 'scheduleChanges'
  | 'newMedia'
  | 'importantAnnouncements'

export interface NotifyOrganizerFollowersResult {
  matched: number
  sent: number
}

async function fanOutToFollowers(
  organizerId: string,
  alertType: OrganizerFollowAlertType,
  buildEmail: () => { subject: string; html: string }
): Promise<NotifyOrganizerFollowersResult> {
  await getDb()

  // `notificationsEnabled` = bascule maîtresse (coupe tout), `alerts.<type>`
  // = préférence fine — les DEUX doivent être vraies, exactement comme le
  // bridge legacy (`f.notificationsEnabled !== false && follow.notification
  // Settings?.<type> !== false`).
  const follows = await OrganizerFollow.find({
    organizerId,
    notificationsEnabled: true,
    [`alerts.${alertType}`]: true,
  })
    .select('userId')
    .lean()

  if (follows.length === 0) return { matched: 0, sent: 0 }

  const userIds = [...new Set(follows.map((f) => f.userId))]
  const users = await User.find({ _id: { $in: userIds } })
    .select('email')
    .lean()

  const email = buildEmail()
  let sent = 0
  for (const user of users) {
    if (!user.email) continue
    const result = await sendEmail(user.email, email)
    if (result.ok) sent++
  }

  return { matched: follows.length, sent }
}

// ────────────────────────────── notifyNewEvent ───────────────────────────────
// Port de old/api/send-email.js:notifyFollowers — mêmes exclusions (événement
// privé, publication différée non encore atteinte) reproduites par
// l'APPELANT (lib/server/organizerEvents.ts) avant d'invoquer cette fonction,
// puisqu'elles dépendent de champs du formulaire de création, pas de ce module.
export async function notifyNewEvent(
  organizerId: string,
  organizerName: string,
  event: FollowedEventSummary
): Promise<NotifyOrganizerFollowersResult> {
  return fanOutToFollowers(organizerId, 'newEvent', () => organizerNewEventEmail(event, organizerName))
}

// ─────────────────────────── notifyScheduleChange ────────────────────────────
// `scheduleChanges` couvre à la fois l'annulation et le report — même garde
// combiné que le bridge legacy (event.cancelled OU event.postponed toutes
// deux mappées sur CE type d'alerte unique, cf. src/utils/organizers.js). Ne
// JAMAIS scinder en deux alertes distinctes : ce serait un écart de fidélité,
// pas une amélioration.
export async function notifyScheduleChange(
  organizerId: string,
  organizerName: string,
  event: FollowedEventSummary,
  kind: 'cancelled' | 'postponed',
  extra: { previousWhen?: string; newWhen?: string } = {}
): Promise<NotifyOrganizerFollowersResult> {
  return fanOutToFollowers(organizerId, 'scheduleChanges', () => organizerScheduleChangeEmail(event, organizerName, kind, extra))
}

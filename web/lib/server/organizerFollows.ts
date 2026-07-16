import mongoose from 'mongoose'
import { getDb } from '../db/mongoose'
import OrganizerFollow from '../models/OrganizerFollow'
import OrganizerProfile from '../models/OrganizerProfile'

// Abonnement (ASYMÉTRIQUE) d'un utilisateur à un profil PUBLIC d'organisateur
// — voir l'en-tête de lib/models/OrganizerFollow.ts pour ce que ça remplace
// côté Firestore et pourquoi c'est un modèle DISTINCT des demandes d'ami
// (FriendRequest/Friendship, symétriques entre deux comptes pairs, cf.
// lib/server/friends.ts). Portée de CE fichier : uniquement la relation
// follow/unfollow, les préférences d'alerte par type, et le compteur
// `OrganizerProfile.followersCount` — la LIVRAISON des notifications (email,
// enregistrement dans un futur modèle Notification…) est explicitement HORS
// PÉRIMÈTRE de cette tâche (phase ultérieure) ; seules les données déjà
// prévues pour cette phase future (les booléens `alerts.*`, déjà dans le
// schéma) sont capturées correctement ici.
//
// `organizerId` désigne partout dans ce module l'ID utilisateur PROPRE à
// l'organisateur (`OrganizerProfile.userId`), exactement comme `Event.organizerId`
// ailleurs dans le codebase (cf. lib/server/eventOrders.ts:computeAuthContext,
// lib/server/organizers.ts:getPublicOrganizerByUserId/getOrganizerEvents) —
// jamais le `_id` Mongo du document OrganizerProfile lui-même.

export interface FollowCaller {
  id: string
}

export interface OrganizerIdInput {
  organizerId: string
}

export interface AlertSettings {
  newEvent: boolean
  cancelled: boolean
  almostFull: boolean
  newMedia: boolean
}

export interface UpdateFollowAlertsInput {
  organizerId: string
  alerts: Partial<AlertSettings>
}

export interface FollowedOrganizerView {
  organizerId: string
  alerts: AlertSettings
  organizerName: string
  organizerSlug: string
  organizerAvatarUrl: string | null
}

type ErrResult = { ok: false; status: number; error: string }

export type FollowResult = ErrResult | { ok: true; alreadyFollowing: boolean }
export type UnfollowResult = ErrResult | { ok: true; wasFollowing: boolean }
export type UpdateFollowAlertsResult = ErrResult | { ok: true; alerts: AlertSettings }
export type ListFollowedOrganizersResult = ErrResult | { ok: true; follows: FollowedOrganizerView[] }
export type IsFollowingResult = { ok: true; following: boolean }

function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000
}

type AlertsLike = { newEvent?: boolean | null; cancelled?: boolean | null; almostFull?: boolean | null; newMedia?: boolean | null } | null | undefined

// Les defaults du schéma (`alertSettingsSchema`) sont TOUJOURS appliqués par
// Mongoose à la création du document — ces fallbacks ne servent qu'à
// satisfaire TypeScript (`InferSchemaType` type les champs à default comme
// potentiellement absents) et à couvrir un éventuel document créé hors de ce
// module (script, migration).
function toAlertSettings(alerts: AlertsLike): AlertSettings {
  return {
    newEvent: alerts?.newEvent ?? true,
    cancelled: alerts?.cancelled ?? true,
    almostFull: alerts?.almostFull ?? true,
    newMedia: alerts?.newMedia ?? false,
  }
}

// ────────────────────────────── followOrganizer ─────────────────────────────

export async function followOrganizer(caller: FollowCaller, input: OrganizerIdInput): Promise<FollowResult> {
  await getDb()

  const organizerId = input.organizerId?.trim()
  if (!organizerId) return { ok: false, status: 400, error: 'invalid_organizer_id' }

  // status:'public' obligatoire ici, comme sur TOUS les autres chemins de
  // lecture organisateur du codebase (cf. lib/server/organizers.ts —
  // listPublicOrganizers/getOrganizerBySlug/getPublicOrganizerByUserId) : un
  // profil encore 'draft'/'pending_review'/'hidden'/'suspended' doit renvoyer
  // le même 404 que "profil inexistant", sans quoi (a) n'importe quel
  // utilisateur authentifié connaissant un userId peut suivre et déclencher
  // des alertes sur un profil pas encore/plus public, et (b) la distinction
  // 404 vs 400/200 devient un oracle d'énumération des userId ayant un
  // OrganizerProfile, indépendamment de son état de modération.
  const profile = await OrganizerProfile.findOne({ userId: organizerId, status: 'public' })
  if (!profile) return { ok: false, status: 404, error: 'organizer_not_found' }
  if (profile.userId === caller.id) return { ok: false, status: 400, error: 'cannot_follow_self' }

  // Pré-vérification non-transactionnelle : évite d'ouvrir une transaction
  // pour le cas déjà largement majoritaire (ré-appel idempotent depuis un
  // bouton Follow déjà actif). La garde RÉELLE contre la course (deux appels
  // concurrents pour la même paire) est l'index unique {userId, organizerId}
  // — cette pré-vérification n'est qu'une optimisation, jamais la seule
  // protection.
  const existing = await OrganizerFollow.findOne({ userId: caller.id, organizerId })
  if (existing) return { ok: true, alreadyFollowing: true }

  const session = await mongoose.startSession()
  let created = true
  try {
    try {
      await session.withTransaction(async (): Promise<void> => {
        // Important : ne JAMAIS catcher l'erreur de duplicate key ICI, À
        // L'INTÉRIEUR du callback — un `insertOne` en échec fait passer la
        // transaction en état ABORTED côté serveur MongoDB ; si le callback
        // avale l'erreur et se termine "normalement", `withTransaction`
        // tente ensuite un `commitTransaction()` sur une transaction déjà
        // avortée, qui échoue à son tour et déclenche une RETENTATIVE
        // COMPLÈTE du callback — indéfiniment, puisque le duplicate key est
        // déterministe (l'autre document existe déjà pour de bon). Laisser
        // l'erreur se propager permet à `withTransaction` d'avorter proprement
        // sans jamais retenter, et de la retraduire APRÈS coup, hors
        // transaction.
        await OrganizerFollow.create([{ userId: caller.id, organizerId }], { session })
        await OrganizerProfile.updateOne({ userId: organizerId }, { $inc: { followersCount: 1 } }, { session })
      })
    } catch (err) {
      // Index unique {userId, organizerId} : un appel concurrent a gagné la
      // course entre la pré-vérification ci-dessus et l'ouverture de cette
      // transaction — no-op, ne JAMAIS incrémenter une seconde fois pour la
      // même relation.
      if (isDuplicateKeyError(err)) {
        created = false
      } else {
        throw err
      }
    }
  } finally {
    await session.endSession()
  }

  return { ok: true, alreadyFollowing: !created }
}

// ───────────────────────────── unfollowOrganizer ────────────────────────────

export async function unfollowOrganizer(caller: FollowCaller, input: OrganizerIdInput): Promise<UnfollowResult> {
  await getDb()

  const organizerId = input.organizerId?.trim()
  if (!organizerId) return { ok: false, status: 400, error: 'invalid_organizer_id' }

  const session = await mongoose.startSession()
  let wasFollowing: boolean
  try {
    wasFollowing = await session.withTransaction(async (): Promise<boolean> => {
      const deleted = await OrganizerFollow.findOneAndDelete({ userId: caller.id, organizerId }, { session })
      if (!deleted) return false

      // Pipeline d'update (pas un simple `$inc: -1`) pour que le compteur ne
      // puisse JAMAIS passer sous 0, même en cas de dérive hypothétique (un
      // document follow existant alors que le compteur était déjà à 0, par
      // exemple après une migration ou un correctif manuel) — clampé
      // atomiquement côté serveur Mongo, plutôt qu'en relisant puis en
      // réécrivant depuis Node (ce qui rouvrirait une fenêtre de course).
      await OrganizerProfile.updateOne(
        { userId: organizerId },
        [{ $set: { followersCount: { $max: [{ $subtract: ['$followersCount', 1] }, 0] } } }],
        { session, updatePipeline: true }
      )
      return true
    })
  } finally {
    await session.endSession()
  }

  return { ok: true, wasFollowing }
}

// ──────────────────────────── updateFollowAlerts ────────────────────────────

export async function updateFollowAlerts(caller: FollowCaller, input: UpdateFollowAlertsInput): Promise<UpdateFollowAlertsResult> {
  await getDb()

  const organizerId = input.organizerId?.trim()
  if (!organizerId) return { ok: false, status: 400, error: 'invalid_organizer_id' }

  const follow = await OrganizerFollow.findOne({ userId: caller.id, organizerId })
  if (!follow) return { ok: false, status: 404, error: 'not_following' }

  const { alerts } = input
  const setFields: Record<string, boolean> = {}
  if (alerts.newEvent !== undefined) setFields['alerts.newEvent'] = alerts.newEvent
  if (alerts.cancelled !== undefined) setFields['alerts.cancelled'] = alerts.cancelled
  if (alerts.almostFull !== undefined) setFields['alerts.almostFull'] = alerts.almostFull
  if (alerts.newMedia !== undefined) setFields['alerts.newMedia'] = alerts.newMedia

  if (Object.keys(setFields).length === 0) {
    // Corps vide : la route rejette déjà ce cas en 400 avant d'appeler cette
    // fonction. Un appelant direct (tests, futur usage interne) obtient
    // simplement les préférences actuelles, inchangées.
    return { ok: true, alerts: toAlertSettings(follow.alerts) }
  }

  const updated = await OrganizerFollow.findOneAndUpdate({ _id: follow._id }, { $set: setFields }, { new: true })
  if (!updated) return { ok: false, status: 404, error: 'not_following' }

  return { ok: true, alerts: toAlertSettings(updated.alerts) }
}

// ────────────────────────── listMyFollowedOrganizers ────────────────────────

export async function listMyFollowedOrganizers(caller: FollowCaller): Promise<ListFollowedOrganizersResult> {
  await getDb()

  const follows = await OrganizerFollow.find({ userId: caller.id }).sort({ createdAt: -1 }).lean()
  if (follows.length === 0) return { ok: true, follows: [] }

  // Batch unique (pas de N+1) : un seul `$in` pour résoudre tous les profils
  // organisateur des abonnements de l'appelant.
  // status:'public' ici aussi : un OrganizerFollow ne devrait plus jamais
  // pointer vers un profil non-public (followOrganizer l'exige désormais à la
  // création), mais si un profil devient hidden/suspended APRÈS avoir été
  // suivi, on ne doit pas pour autant fuiter son nom/slug/avatar au follower —
  // le fallback `profile?.` ci-dessous retombe alors sur des champs vides,
  // exactement comme pour un profil introuvable.
  const organizerIds = [...new Set(follows.map((f) => f.organizerId))]
  const profiles = await OrganizerProfile.find({ userId: { $in: organizerIds }, status: 'public' }).lean()
  const profileByUserId = new Map(profiles.map((p) => [p.userId, p]))

  const views: FollowedOrganizerView[] = follows.map((f) => {
    const profile = profileByUserId.get(f.organizerId)
    return {
      organizerId: f.organizerId,
      alerts: toAlertSettings(f.alerts),
      organizerName: profile?.publicName ?? '',
      organizerSlug: profile?.slug ?? '',
      organizerAvatarUrl: profile?.avatarUrl ?? null,
    }
  })

  return { ok: true, follows: views }
}

// ─────────────────────────────── isFollowing ────────────────────────────────

// Vérification simple, sans effet de bord — utilisée pour l'état initial
// d'un bouton Follow/Unfollow sur une page publique d'organisateur.
export async function isFollowing(caller: FollowCaller, input: OrganizerIdInput): Promise<IsFollowingResult> {
  await getDb()

  const organizerId = input.organizerId?.trim()
  if (!organizerId) return { ok: true, following: false }

  const exists = await OrganizerFollow.exists({ userId: caller.id, organizerId })
  return { ok: true, following: Boolean(exists) }
}

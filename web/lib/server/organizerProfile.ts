import crypto from 'node:crypto'
import { getDb } from '../db/mongoose'
import OrganizerProfile, { type OrganizerProfileDoc } from '../models/OrganizerProfile'
import Application from '../models/Application'
import User from '../models/User'
import Event from '../models/Event'
import { uploadDataUri } from './cloudinary'
import { slugifyOrganizer, validateOrganizerSlugFormat, RESERVED_ORGANIZER_SLUGS } from '../shared/organizerProfileValidation'
import { normalizeRegionId, normalizeRegionIds } from '../shared/locations'
import type { SocialNetworkKey } from '../shared/social'

// Port de la partie ÉCRITURE de OrganizerPublicStudio.jsx (#7 phase
// organisateur — "Ma page publique"). La lecture publique vit déjà dans
// lib/server/organizers.ts (phase 2) ; ce fichier est le pendant "propriétaire"
// (auto-édition de son propre profil, jamais d'un autre — voir chaque
// fonction ci-dessous, toutes filtrées sur `userId: caller.id`).
//
// Différence volontaire avec le legacy : `firestore.rules` autorisait en plus
// un visiteur connecté quelconque à modifier UNIQUEMENT un des trois compteurs
// (`followersCount`/`viewsCount`/`eventClicksCount`) de ±1 sur un profil
// `status:'public'` — ce chemin est délibérément HORS PÉRIMÈTRE de ce fichier
// (follow/unfollow gère déjà `followersCount` dans organizerFollows.ts ; le
// tracking vues/clics n'a pas d'équivalent construit dans cette migration).

export interface ProfileCaller {
  id: string
}

type ErrResult = { ok: false; status: number; error: string }

export interface OrganizerProfileView {
  publicName: string
  slug: string
  city: string
  country: string
  regionId: string
  shortDescription: string
  socialLinks: Record<SocialNetworkKey, string>
  zonesIntervention: string[]
  avatarUrl: string | null
  bannerUrl: string | null
  status: string
  isVerified: boolean
  followersCount: number
  totalEventsCount: number
  viewsCount: number
  media: Array<{
    id: string
    url: string
    type: string
    title: string
    description: string
    eventId: string | null
    visibility: string
    displayOrder: number
  }>
}

function toProfileView(profile: OrganizerProfileDoc): OrganizerProfileView {
  return {
    publicName: profile.publicName,
    slug: profile.slug,
    city: profile.city ?? '',
    country: profile.country ?? '',
    regionId: profile.regionId ?? '',
    shortDescription: profile.shortDescription ?? '',
    socialLinks: (profile.socialLinks ?? {}) as Record<SocialNetworkKey, string>,
    zonesIntervention: profile.zonesIntervention ?? [],
    avatarUrl: profile.avatarUrl ?? null,
    bannerUrl: profile.bannerUrl ?? null,
    status: profile.status ?? 'draft',
    isVerified: Boolean(profile.isVerified),
    followersCount: profile.followersCount ?? 0,
    totalEventsCount: profile.totalEventsCount ?? 0,
    viewsCount: profile.viewsCount ?? 0,
    media: (profile.media ?? []).map((m) => ({
      id: m.id,
      url: m.url,
      type: m.type ?? 'image',
      title: m.title ?? '',
      description: m.description ?? '',
      eventId: m.eventId ?? null,
      visibility: m.visibility ?? 'public',
      displayOrder: m.displayOrder ?? 0,
    })),
  }
}

function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000
}

async function makeUniqueSlug(base: string, excludeUserId: string): Promise<string> {
  let root = slugifyOrganizer(base) || 'organisateur'
  if (RESERVED_ORGANIZER_SLUGS.has(root)) root = `${root}-events`
  let slug = root
  let i = 2
  // Boucle bornée par construction (une base de compte existant, jamais un
  // input adverse illimité) — même idée que makeUniqueOrganizerSlug côté
  // legacy, mais vérifiée contre la vraie base plutôt qu'un cache local.
  while (await OrganizerProfile.exists({ slug, userId: { $ne: excludeUserId } })) {
    slug = `${root}-${i++}`
  }
  return slug
}

// ────────────────────────── getOrCreateMyOrganizerProfile ───────────────────

export type GetOrCreateResult = ErrResult | { ok: true; profile: OrganizerProfileView }

// Contrairement au legacy (seed tenu en mémoire React tant que "Enregistrer"
// n'est pas cliqué), on persiste immédiatement le profil "brouillon" créé au
// premier accès au studio : sans cache localStorage-first dans cette
// migration, un profil qui n'existe qu'en mémoire serait invisible à tout
// autre chemin serveur (ex. le prochain GET, ou un futur suivi/statistiques).
export async function getOrCreateMyOrganizerProfile(caller: ProfileCaller): Promise<GetOrCreateResult> {
  await getDb()

  const existing = await OrganizerProfile.findOne({ userId: caller.id })
  if (existing) return { ok: true, profile: toProfileView(existing) }

  const user = await User.findById(caller.id).lean()
  if (!user) return { ok: false, status: 404, error: 'user_not_found' }

  // Le dossier de candidature organisateur (déjà rempli à l'onboarding, #7
  // tâche #63) est la meilleure source de départ pour la fiche publique — à
  // défaut on retombe sur les champs de compte, jamais un profil totalement
  // vide.
  const application = await Application.findOne({ userId: caller.id, type: 'organisateur' }).lean()
  const formData = (application?.formData as Record<string, unknown>) ?? {}

  const publicName = (String(formData.nomCommercial || '').trim() || [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || 'Organisateur')
  const regionId = normalizeRegionId(String(formData.pays || ''))
  const slug = await makeUniqueSlug(publicName, caller.id)

  const created = await OrganizerProfile.create({
    userId: caller.id,
    publicName,
    slug,
    shortDescription: String(formData.description || '').trim().slice(0, 500),
    city: String(formData.ville || '').trim(),
    country: String(formData.pays || '').trim(),
    regionId,
    avatarUrl: user.avatarUrl ?? null,
    status: 'draft',
    zonesIntervention: regionId ? [regionId] : [],
  })

  return { ok: true, profile: toProfileView(created) }
}

// ──────────────────────────── updateOrganizerProfile ────────────────────────

export interface UpdateProfileInput {
  publicName?: string
  slug?: string
  city?: string
  zonesIntervention?: string[]
  shortDescription?: string
  socialLinks?: Partial<Record<SocialNetworkKey, string>>
  status?: 'draft' | 'public'
}

export type UpdateProfileResult = ErrResult | { ok: true; profile: OrganizerProfileView }

export async function updateOrganizerProfile(caller: ProfileCaller, input: UpdateProfileInput): Promise<UpdateProfileResult> {
  await getDb()

  const profile = await OrganizerProfile.findOne({ userId: caller.id })
  if (!profile) return { ok: false, status: 404, error: 'profile_not_found' }

  // Le nom public est obligatoire — même garde que save() côté studio
  // (`if (!profile.publicName?.trim())`).
  const nextPublicName = input.publicName !== undefined ? input.publicName.trim() : profile.publicName
  if (!nextPublicName) return { ok: false, status: 400, error: 'name_required' }

  // Slug : format d'abord (léger, pas de requête), puis unicité réelle en
  // base — jamais d'auto-suffixe silencieux ici (contrairement à la création
  // seed) : un slug pris par un AUTRE profil doit bloquer l'enregistrement
  // avec un message explicite, exactement comme slugCheck côté studio.
  let nextSlug = profile.slug
  if (input.slug !== undefined) {
    const format = validateOrganizerSlugFormat(input.slug)
    if (!format.ok) return { ok: false, status: 400, error: format.error }
    nextSlug = format.slug
    if (nextSlug !== profile.slug) {
      const taken = await OrganizerProfile.exists({ slug: nextSlug, userId: { $ne: caller.id } })
      if (taken) return { ok: false, status: 409, error: 'slug_taken' }
    }
  }

  profile.publicName = nextPublicName
  profile.slug = nextSlug

  if (input.city !== undefined) profile.city = input.city.trim()

  if (input.zonesIntervention !== undefined) {
    // Zones d'intervention = marketing (multi-pays où l'organisateur
    // communique) — TOTALEMENT séparées de regionId (ancre devise/paiement,
    // figée à l'onboarding, jamais recalculée ici). On garantit que regionId
    // reste toujours présent dans la liste, sinon un organisateur pourrait
    // « intervenir » partout sauf dans sa propre zone de facturation.
    const zones = normalizeRegionIds(input.zonesIntervention)
    profile.zonesIntervention = (
      zones.includes('international') ? ['international'] : profile.regionId && !zones.includes(profile.regionId) ? [profile.regionId, ...zones] : zones
    ) as typeof profile.zonesIntervention
  }

  if (input.shortDescription !== undefined) {
    // Écrire la description courte efface TOUJOURS l'ancienne description
    // longue — fidèle au studio legacy où les deux champs partagent le même
    // gestionnaire onChange.
    profile.shortDescription = input.shortDescription.trim().slice(0, 500)
    profile.longDescription = ''
  }

  if (input.socialLinks !== undefined) {
    profile.socialLinks = { ...(profile.socialLinks ?? {}), ...input.socialLinks } as typeof profile.socialLinks
  }

  if (input.status !== undefined) profile.status = input.status

  // Plafond haut historique du nombre d'événements créés — jamais décroissant
  // même si des événements sont supprimés depuis, fidèle à
  // `Math.max(profile.totalEventsCount||0, events.length)` côté studio.
  const ownedEventsCount = await Event.countDocuments({ $or: [{ organizerId: caller.id }, { createdBy: caller.id }] })
  profile.totalEventsCount = Math.max(profile.totalEventsCount ?? 0, ownedEventsCount)

  try {
    await profile.save()
  } catch (err) {
    if (isDuplicateKeyError(err)) return { ok: false, status: 409, error: 'slug_taken' }
    throw err
  }

  return { ok: true, profile: toProfileView(profile) }
}

// ─────────────────────────── uploadOrganizerProfileMedia ────────────────────

export type MediaKind = 'avatar' | 'banner' | 'gallery'

export interface UploadMediaInput {
  kind: MediaKind
  dataUri: string
}

export type UploadMediaResult = ErrResult | { ok: true; profile: OrganizerProfileView }

// Persistance IMMÉDIATE (pas d'attente du bouton "Enregistrer") — même
// intention que le commentaire legacy : un média uploadé ne doit jamais se
// perdre si l'utilisateur quitte la page juste après.
export async function uploadOrganizerProfileMedia(caller: ProfileCaller, input: UploadMediaInput): Promise<UploadMediaResult> {
  await getDb()

  const profile = await OrganizerProfile.findOne({ userId: caller.id })
  if (!profile) return { ok: false, status: 404, error: 'profile_not_found' }

  const uploaded = await uploadDataUri(input.dataUri, `organizer-media/${caller.id}/${input.kind}`)
  if (!uploaded.ok) return { ok: false, status: 400, error: uploaded.error }

  if (input.kind === 'avatar') {
    profile.avatarUrl = uploaded.url
  } else if (input.kind === 'banner') {
    profile.bannerUrl = uploaded.url
  } else {
    const isVideo = input.dataUri.startsWith('data:video')
    profile.media.push({
      id: `org-media-${crypto.randomBytes(6).toString('hex')}`,
      url: uploaded.url,
      type: isVideo ? 'video' : 'image',
      title: '',
      description: '',
      eventId: null,
      visibility: 'public',
      displayOrder: profile.media.length,
    } as (typeof profile.media)[number])
  }

  await profile.save()
  return { ok: true, profile: toProfileView(profile) }
}

// ──────────────────────────── updateOrganizerMediaItem ──────────────────────

export interface MediaPatchInput {
  title?: string
  eventId?: string | null
  visibility?: 'public' | 'hidden'
}

export type MediaPatchResult = ErrResult | { ok: true; profile: OrganizerProfileView }

export async function updateOrganizerMediaItem(caller: ProfileCaller, mediaId: string, patch: MediaPatchInput): Promise<MediaPatchResult> {
  await getDb()

  const profile = await OrganizerProfile.findOne({ userId: caller.id })
  if (!profile) return { ok: false, status: 404, error: 'profile_not_found' }

  const item = profile.media.find((m) => m.id === mediaId)
  if (!item) return { ok: false, status: 404, error: 'media_not_found' }

  if (patch.title !== undefined) item.title = patch.title
  if (patch.eventId !== undefined) item.eventId = patch.eventId
  if (patch.visibility !== undefined) item.visibility = patch.visibility

  await profile.save()
  return { ok: true, profile: toProfileView(profile) }
}

// ─────────────────────────────── removeOrganizerMedia ───────────────────────

export async function removeOrganizerMedia(caller: ProfileCaller, mediaId: string): Promise<MediaPatchResult> {
  await getDb()

  const profile = await OrganizerProfile.findOne({ userId: caller.id })
  if (!profile) return { ok: false, status: 404, error: 'profile_not_found' }

  const next = profile.media.filter((m) => m.id !== mediaId)
  if (next.length === profile.media.length) return { ok: false, status: 404, error: 'media_not_found' }

  next.forEach((m, i) => {
    m.displayOrder = i
  })
  profile.media = next as typeof profile.media

  await profile.save()
  return { ok: true, profile: toProfileView(profile) }
}

// ─────────────────────────────── reorderOrganizerMedia ──────────────────────

// Le client envoie l'ordre COMPLET des ids souhaité (pas juste "monter/descendre
// un cran") — plus simple à raisonner côté serveur, et équivalent au
// swap-puis-renumérote de moveMedia() côté studio.
export async function reorderOrganizerMedia(caller: ProfileCaller, order: string[]): Promise<MediaPatchResult> {
  await getDb()

  const profile = await OrganizerProfile.findOne({ userId: caller.id })
  if (!profile) return { ok: false, status: 404, error: 'profile_not_found' }

  const byId = new Map(profile.media.map((m) => [m.id, m]))
  if (order.length !== profile.media.length || order.some((id) => !byId.has(id))) {
    return { ok: false, status: 400, error: 'invalid_order' }
  }

  const reordered = order.map((id) => byId.get(id)!)
  reordered.forEach((m, i) => {
    m.displayOrder = i
  })
  profile.media = reordered as typeof profile.media

  await profile.save()
  return { ok: true, profile: toProfileView(profile) }
}

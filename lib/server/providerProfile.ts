import crypto from 'node:crypto'
import { getDb } from '../db/mongoose'
import ProviderProfile, { type ProviderProfileDoc } from '../models/ProviderProfile'
import Application from '../models/Application'
import User from '../models/User'
import { IMAGE_MIME_TYPES, VIDEO_MIME_TYPES, uploadDataUri } from './cloudinary'
import { getProviderBillingContext } from './providerBilling'
import { normalizeRegionId, normalizeRegionIds, getRegionName } from '../shared/locations'
import { normalizeProviderTypes, getPrimaryProviderType } from '../shared/providerCategories'
import { SOCIAL_NETWORKS, socialUrl, type SocialNetworkKey } from '../shared/social'
import { verifyPublicMediaUploadReference } from './publicMediaUpload'
import type { PublicMediaUploadReference } from '../shared/publicMediaUploads'

// Remplace la partie ÉCRITURE de ProposerServicesPage.jsx (#8 phase
// prestataire — profil + catalogue). Miroir volontaire de
// lib/server/organizerProfile.ts : même création paresseuse au premier accès,
// même reconstruction "plain object" avant de traverser en Server Component.
//
// Contrairement à l'organisateur, il n'y a PAS de statut brouillon/public ni
// de slug ici — la visibilité publique dépend UNIQUEMENT de
// `subscriptionActive` (voir lib/server/providerSubscriptions.ts), jamais
// d'une action manuelle de ce module.

export interface ProfileCaller {
  id: string
}

type ErrResult = { ok: false; status: number; error: string }

export interface CatalogItemView {
  id: string
  name: string
  description: string
  price: number | null
  currency: 'EUR' | 'XOF'
  unit: string
  category: string
  available: boolean
  media: Array<{ url: string; type: string }>
  createdAt: string
}

export interface ProviderProfileView {
  userId: string
  name: string
  headline: string
  description: string
  city: string
  regionId: string
  country: string
  zonesIntervention: string[]
  website: string
  socialLinks: Record<SocialNetworkKey, string>
  photoUrl: string | null
  coverUrl: string | null
  prestataireType: string
  prestataireTypes: string[]
  phone: string
  catalogCurrency: 'EUR' | 'XOF'
  subscriptionActive: boolean
  subscriptionStatus: string
  subscriptionExpiresAt: string | null
  gracePeriodEndsAt: string | null
  ratingAvg: number
  ratingCount: number
  catalog: CatalogItemView[]
}

// Même prudence que organizerProfile.ts : un sous-document Mongoose (ou un
// tableau Mongoose de sous-documents) contient des références circulaires
// ($__parent) qui font planter la sérialisation React Server Components dès
// qu'il traverse vers un composant client — tout est reconstruit champ par
// champ, jamais retourné/spread tel quel.
function toSocialLinks(links: unknown): Record<SocialNetworkKey, string> {
  const source = (links ?? {}) as Partial<Record<SocialNetworkKey, string>>
  const result = {} as Record<SocialNetworkKey, string>
  for (const net of SOCIAL_NETWORKS) result[net.key] = source[net.key] ?? ''
  return result
}

function toCatalogView(catalog: ProviderProfileDoc['catalog']): CatalogItemView[] {
  return (catalog ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description ?? '',
    price: item.price ?? null,
    currency: (item.currency as 'EUR' | 'XOF') ?? 'EUR',
    unit: item.unit ?? '',
    category: item.category ?? '',
    available: item.available !== false,
    media: (item.media ?? []).map((m) => ({ url: m.url, type: m.type ?? 'image' })),
    createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : new Date().toISOString(),
  }))
}

function toProfileView(profile: ProviderProfileDoc): ProviderProfileView {
  return {
    userId: profile.userId,
    name: profile.name,
    headline: profile.headline ?? '',
    description: profile.description ?? '',
    city: profile.city ?? '',
    regionId: profile.regionId ?? '',
    country: profile.country ?? '',
    zonesIntervention: [...(profile.zonesIntervention ?? [])],
    website: profile.website ?? '',
    socialLinks: toSocialLinks(profile.socialLinks),
    photoUrl: profile.photoUrl ?? null,
    coverUrl: profile.coverUrl ?? null,
    prestataireType: profile.prestataireType ?? 'autre',
    prestataireTypes: [...(profile.prestataireTypes ?? [])],
    phone: profile.phone ?? '',
    catalogCurrency: (profile.catalogCurrency as 'EUR' | 'XOF') ?? 'EUR',
    subscriptionActive: Boolean(profile.subscriptionActive),
    subscriptionStatus: profile.subscriptionStatus ?? 'none',
    subscriptionExpiresAt: profile.subscriptionExpiresAt ? new Date(profile.subscriptionExpiresAt).toISOString() : null,
    gracePeriodEndsAt: profile.gracePeriodEndsAt ? new Date(profile.gracePeriodEndsAt).toISOString() : null,
    ratingAvg: profile.ratingAvg ?? 0,
    ratingCount: profile.ratingCount ?? 0,
    catalog: toCatalogView(profile.catalog),
  }
}

// ────────────────────────── getOrCreateMyProviderProfile ────────────────────

export type GetOrCreateResult = ErrResult | { ok: true; profile: ProviderProfileView }

export async function getOrCreateMyProviderProfile(caller: ProfileCaller): Promise<GetOrCreateResult> {
  await getDb()

  const existing = await ProviderProfile.findOne({ userId: caller.id })
  if (existing) return { ok: true, profile: toProfileView(existing) }

  const user = await User.findById(caller.id).lean()
  if (!user) return { ok: false, status: 404, error: 'user_not_found' }

  // Le dossier de candidature prestataire (déjà rempli à l'onboarding, #86)
  // est la meilleure source de départ pour la fiche — à défaut on retombe sur
  // les champs de compte, jamais un profil totalement vide.
  const application = await Application.findOne({ userId: caller.id, type: 'prestataire' }).lean()
  const formData = (application?.formData as Record<string, unknown>) ?? {}

  const prestataireTypes = normalizeProviderTypes(formData.prestataireTypes, (formData.prestataireType as string) ?? null)
  const regionId = normalizeRegionId(String(formData.pays || ''))
  const name =
    String(formData.nomCommercial || '').trim() ||
    String(formData.nomScene || '').trim() ||
    [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
    'Prestataire'

  const billing = await getProviderBillingContext(caller)

  const created = await ProviderProfile.create({
    userId: caller.id,
    name,
    description: String(formData.description || '').trim().slice(0, 1000),
    city: String(formData.ville || '').trim(),
    location: String(formData.ville || '').trim(),
    regionId,
    country: String(formData.pays || '').trim(),
    zonesIntervention: normalizeRegionIds(formData.zonesIntervention).length
      ? normalizeRegionIds(formData.zonesIntervention)
      : regionId
        ? [regionId]
        : [],
    prestataireType: getPrimaryProviderType({ prestataireTypes }),
    prestataireTypes,
    phone: [formData.telephoneCode, formData.telephone].filter(Boolean).join('').trim() || user.phone || '',
    catalogCurrency: billing.currency,
  })

  return { ok: true, profile: toProfileView(created) }
}

// ──────────────────────────── updateProviderProfile ─────────────────────────

export interface UpdateProfileInput {
  name?: string
  headline?: string
  description?: string
  city?: string
  regionId?: string
  zonesIntervention?: string[]
  website?: string
  socialLinks?: Partial<Record<SocialNetworkKey, string>>
  prestataireTypes?: string[]
  phone?: string
}

export type UpdateProfileResult = ErrResult | { ok: true; profile: ProviderProfileView }

export async function updateProviderProfile(caller: ProfileCaller, input: UpdateProfileInput): Promise<UpdateProfileResult> {
  await getDb()

  const profile = await ProviderProfile.findOne({ userId: caller.id })
  if (!profile) return { ok: false, status: 404, error: 'profile_not_found' }

  const nextName = input.name !== undefined ? input.name.trim() : profile.name
  if (!nextName) return { ok: false, status: 400, error: 'name_required' }
  profile.name = nextName

  if (input.headline !== undefined) profile.headline = input.headline.trim().slice(0, 140)
  if (input.description !== undefined) profile.description = input.description.trim().slice(0, 1000)
  if (input.city !== undefined) {
    profile.city = input.city.trim()
    profile.location = input.city.trim()
  }

  // `regionId` ("Pays de base") est un champ 100% marketing/affichage ici —
  // contrairement à l'organisateur, il ne modifie JAMAIS la facturation (voir
  // User.providerBillingRegionId / lib/server/providerBilling.ts, totalement
  // séparé). Traité AVANT zonesIntervention pour que la garantie ci-dessous
  // utilise le nouveau pays, pas l'ancien.
  if (input.regionId !== undefined) {
    const regionId = normalizeRegionId(input.regionId)
    if (regionId) {
      profile.regionId = regionId
      profile.country = getRegionName(regionId)
    }
  }

  if (input.zonesIntervention !== undefined) {
    // Marketing multi-pays — même garantie que updateOrganizerProfile :
    // regionId reste toujours dans la liste.
    const zones = normalizeRegionIds(input.zonesIntervention)
    profile.zonesIntervention = (
      zones.includes('international') ? ['international'] : profile.regionId && !zones.includes(profile.regionId) ? [profile.regionId, ...zones] : zones
    ) as typeof profile.zonesIntervention
  }

  if (input.prestataireTypes !== undefined) {
    const types = normalizeProviderTypes(input.prestataireTypes)
    profile.prestataireTypes = types as typeof profile.prestataireTypes
    profile.prestataireType = getPrimaryProviderType({ prestataireTypes: types })
  }

  if (input.phone !== undefined) profile.phone = input.phone.trim()

  // `website` legacy : double-écriture du même champ (top-level ET
  // socialLinks.website, toujours synchronisés) — compat lecture ancienne,
  // voir ProposerServicesPage.jsx.
  if (input.website !== undefined) {
    const website = socialUrl('website', input.website) ?? ''
    profile.website = website
    profile.socialLinks = { ...(profile.socialLinks ?? {}), website } as typeof profile.socialLinks
  }
  if (input.socialLinks !== undefined) {
    const sanitizedLinks = Object.fromEntries(
      Object.entries(input.socialLinks).map(([key, value]) => [key, socialUrl(key, value) ?? ''])
    )
    profile.socialLinks = { ...(profile.socialLinks ?? {}), ...sanitizedLinks } as typeof profile.socialLinks
    if (input.socialLinks.website !== undefined) profile.website = sanitizedLinks.website ?? ''
  }

  await profile.save()
  return { ok: true, profile: toProfileView(profile) }
}

// ─────────────────────────── uploadProviderProfileMedia ─────────────────────

export type ProfileMediaKind = 'avatar' | 'cover'

export type UploadMediaResult = ErrResult | { ok: true; profile: ProviderProfileView }

export async function uploadProviderProfileMedia(caller: ProfileCaller, kind: ProfileMediaKind, dataUri: string): Promise<UploadMediaResult> {
  await getDb()

  const profile = await ProviderProfile.findOne({ userId: caller.id })
  if (!profile) return { ok: false, status: 404, error: 'profile_not_found' }

  const uploaded = await uploadDataUri(dataUri, `provider-media/${caller.id}/${kind}`, {
    allowedMimeTypes: IMAGE_MIME_TYPES,
  })
  if (!uploaded.ok) return { ok: false, status: 400, error: uploaded.error }

  if (kind === 'avatar') profile.photoUrl = uploaded.url
  else profile.coverUrl = uploaded.url

  await profile.save()
  return { ok: true, profile: toProfileView(profile) }
}

// ─────────────────────────────── Catalogue ───────────────────────────────────

export interface CatalogItemInput {
  name: string
  description?: string
  price?: number | null
  currency?: string
  unit?: string
  category?: string
}

export type CatalogResult = ErrResult | { ok: true; profile: ProviderProfileView }

// Quirk fidèle au legacy (newItem.currency === 'XOF' ? 'XOF' : catalogDefaultCurrency,
// voir ProposerServicesPage.jsx) : seule une sélection EXPLICITE de 'XOF'
// est retenue telle quelle ; toute autre valeur (y compris 'EUR' explicite)
// retombe sur la devise dérivée du pays de facturation. Pas une simplification
// de notre part — un comportement du produit à préserver tel quel.
function resolveCatalogCurrency(selected: string | undefined, catalogDefaultCurrency: 'EUR' | 'XOF'): 'EUR' | 'XOF' {
  return selected === 'XOF' ? 'XOF' : catalogDefaultCurrency
}

export async function addCatalogItem(caller: ProfileCaller, input: CatalogItemInput): Promise<CatalogResult> {
  await getDb()

  const name = input.name.trim()
  if (!name) return { ok: false, status: 400, error: 'name_required' }

  const profile = await ProviderProfile.findOne({ userId: caller.id })
  if (!profile) return { ok: false, status: 404, error: 'profile_not_found' }

  profile.catalog.push({
    id: `item-${crypto.randomBytes(6).toString('hex')}`,
    name,
    description: (input.description ?? '').trim(),
    price: input.price ?? null,
    currency: resolveCatalogCurrency(input.currency, profile.catalogCurrency as 'EUR' | 'XOF'),
    unit: (input.unit ?? '').trim(),
    category: (input.category ?? '').trim(),
    available: true,
    media: [],
    createdAt: new Date(),
  } as unknown as (typeof profile.catalog)[number])

  await profile.save()
  return { ok: true, profile: toProfileView(profile) }
}

export interface CatalogItemPatch {
  name?: string
  description?: string
  price?: number | null
  currency?: string
  unit?: string
  category?: string
  available?: boolean
}

export async function updateCatalogItem(caller: ProfileCaller, itemId: string, patch: CatalogItemPatch): Promise<CatalogResult> {
  await getDb()

  const profile = await ProviderProfile.findOne({ userId: caller.id })
  if (!profile) return { ok: false, status: 404, error: 'profile_not_found' }

  const item = profile.catalog.find((i) => i.id === itemId)
  if (!item) return { ok: false, status: 404, error: 'item_not_found' }

  if (patch.name !== undefined) {
    const name = patch.name.trim()
    if (!name) return { ok: false, status: 400, error: 'name_required' }
    item.name = name
  }
  if (patch.description !== undefined) item.description = patch.description.trim()
  if (patch.price !== undefined) item.price = patch.price
  if (patch.currency !== undefined) item.currency = resolveCatalogCurrency(patch.currency, profile.catalogCurrency as 'EUR' | 'XOF')
  if (patch.unit !== undefined) item.unit = patch.unit.trim()
  if (patch.category !== undefined) item.category = patch.category.trim()
  if (patch.available !== undefined) item.available = patch.available

  await profile.save()
  return { ok: true, profile: toProfileView(profile) }
}

export async function deleteCatalogItem(caller: ProfileCaller, itemId: string): Promise<CatalogResult> {
  await getDb()

  const profile = await ProviderProfile.findOne({ userId: caller.id })
  if (!profile) return { ok: false, status: 404, error: 'profile_not_found' }

  const next = profile.catalog.filter((i) => i.id !== itemId)
  if (next.length === profile.catalog.length) return { ok: false, status: 404, error: 'item_not_found' }
  profile.catalog = next as typeof profile.catalog

  await profile.save()
  return { ok: true, profile: toProfileView(profile) }
}

const MAX_CATALOG_ITEM_MEDIA = 4

export async function addCatalogItemMedia(
  caller: ProfileCaller,
  itemId: string,
  media: { dataUri: string } | { upload: PublicMediaUploadReference }
): Promise<CatalogResult> {
  await getDb()

  const profile = await ProviderProfile.findOne({ userId: caller.id })
  if (!profile) return { ok: false, status: 404, error: 'profile_not_found' }

  const item = profile.catalog.find((i) => i.id === itemId)
  if (!item) return { ok: false, status: 404, error: 'item_not_found' }
  if (item.media.length >= MAX_CATALOG_ITEM_MEDIA) return { ok: false, status: 409, error: 'media_limit_reached' }

  let url: string
  let isVideo: boolean
  if ('upload' in media) {
    const verified = await verifyPublicMediaUploadReference(media.upload, caller.id, 'provider-catalog')
    if (!verified.ok) return { ok: false, status: 400, error: 'invalid_media_upload' }
    url = verified.url
    isVideo = verified.resourceType === 'video'
  } else {
    const uploaded = await uploadDataUri(media.dataUri, `provider-catalog/${caller.id}/${itemId}`, {
      allowedMimeTypes: [...IMAGE_MIME_TYPES, ...VIDEO_MIME_TYPES],
    })
    if (!uploaded.ok) return { ok: false, status: 400, error: uploaded.error }
    url = uploaded.url
    isVideo = media.dataUri.startsWith('data:video')
  }

  item.media.push({ url, type: isVideo ? 'video' : 'image' } as (typeof item.media)[number])

  await profile.save()
  return { ok: true, profile: toProfileView(profile) }
}

export async function removeCatalogItemMedia(caller: ProfileCaller, itemId: string, mediaIndex: number): Promise<CatalogResult> {
  await getDb()

  const profile = await ProviderProfile.findOne({ userId: caller.id })
  if (!profile) return { ok: false, status: 404, error: 'profile_not_found' }

  const item = profile.catalog.find((i) => i.id === itemId)
  if (!item) return { ok: false, status: 404, error: 'item_not_found' }
  if (mediaIndex < 0 || mediaIndex >= item.media.length) return { ok: false, status: 400, error: 'invalid_media_index' }

  item.media.splice(mediaIndex, 1)

  await profile.save()
  return { ok: true, profile: toProfileView(profile) }
}

import crypto from 'node:crypto'
import { getDb } from '@/lib/db/mongoose'
import ProviderProfile from '@/lib/models/ProviderProfile'
import Application from '@/lib/models/Application'
import User from '@/lib/models/User'
import { IMAGE_MIME_TYPES, VIDEO_MIME_TYPES, uploadDataUri } from '@/lib/server/cloudinary'
import { getProviderBillingContext } from './providerBilling'
import { normalizeRegionId, normalizeRegionIds, getRegionName } from '@/lib/shared/locations'
import { normalizeProviderTypes, getPrimaryProviderType } from '@/lib/shared/providerCategories'
import { socialUrl, type SocialNetworkKey } from '@/lib/shared/social'
import { verifyPublicMediaUploadReference } from '@/lib/server/publicMediaUpload'
import type { PublicMediaUploadReference } from '@/lib/shared/publicMediaUploads'
import { revalidateTag } from 'next/cache'
import {
  resolveCatalogCurrency,
  resolveProviderZones,
  sanitizeProviderSocialLinks,
  toProviderProfileView,
  type ProviderProfileView,
} from './providerProfileUtils'

export type { ProviderProfileView } from './providerProfileUtils'

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

// ────────────────────────── getOrCreateMyProviderProfile ────────────────────

export type GetOrCreateResult = ErrResult | { ok: true; profile: ProviderProfileView }

export async function getOrCreateMyProviderProfile(caller: ProfileCaller): Promise<GetOrCreateResult> {
  await getDb()

  const existing = await ProviderProfile.findOne({ userId: caller.id })
  if (existing) return { ok: true, profile: toProviderProfileView(existing) }

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

  return { ok: true, profile: toProviderProfileView(created) }
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

function splitUpdateProfileArgs(
  caller: ProfileCaller,
  input?: UpdateProfileInput
): { caller: ProfileCaller; input: UpdateProfileInput } {
  if (input) return { caller, input }
  const { id, ...legacyInput } = caller as ProfileCaller & UpdateProfileInput
  return { caller: { id }, input: legacyInput }
}

export async function updateProviderProfile(caller: ProfileCaller, input?: UpdateProfileInput): Promise<UpdateProfileResult> {
  await getDb()

  const resolved = splitUpdateProfileArgs(caller, input)

  const profile = await ProviderProfile.findOne({ userId: resolved.caller.id })
  if (!profile) return { ok: false, status: 404, error: 'profile_not_found' }

  const nextName = resolved.input.name !== undefined ? resolved.input.name.trim() : profile.name
  if (!nextName) return { ok: false, status: 400, error: 'name_required' }
  profile.name = nextName

  if (resolved.input.headline !== undefined) profile.headline = resolved.input.headline.trim().slice(0, 140)
  if (resolved.input.description !== undefined) profile.description = resolved.input.description.trim().slice(0, 1000)
  if (resolved.input.city !== undefined) {
    profile.city = resolved.input.city.trim()
    profile.location = resolved.input.city.trim()
  }

  // `regionId` ("Pays de base") est un champ 100% marketing/affichage ici —
  // contrairement à l'organisateur, il ne modifie JAMAIS la facturation (voir
  // User.providerBillingRegionId / lib/server/providerBilling.ts, totalement
  // séparé). Traité AVANT zonesIntervention pour que la garantie ci-dessous
  // utilise le nouveau pays, pas l'ancien.
  if (resolved.input.regionId !== undefined) {
    const regionId = normalizeRegionId(resolved.input.regionId)
    if (regionId) {
      profile.regionId = regionId
      profile.country = getRegionName(regionId)
    }
  }

  if (resolved.input.zonesIntervention !== undefined) {
    // Marketing multi-pays — même garantie que updateOrganizerProfile :
    // regionId reste toujours dans la liste.
    profile.zonesIntervention = resolveProviderZones(profile.regionId, resolved.input.zonesIntervention) as typeof profile.zonesIntervention
  }

  if (resolved.input.prestataireTypes !== undefined) {
    const types = normalizeProviderTypes(resolved.input.prestataireTypes)
    profile.prestataireTypes = types as typeof profile.prestataireTypes
    profile.prestataireType = getPrimaryProviderType({ prestataireTypes: types })
  }

  if (resolved.input.phone !== undefined) profile.phone = resolved.input.phone.trim()

  // `website` legacy : double-écriture du même champ (top-level ET
  // socialLinks.website, toujours synchronisés) — compat lecture ancienne,
  // voir ProposerServicesPage.jsx.
  if (resolved.input.website !== undefined) {
    const website = socialUrl('website', resolved.input.website) ?? ''
    profile.website = website
    profile.socialLinks = { ...(profile.socialLinks ?? {}), website } as typeof profile.socialLinks
  }
  if (resolved.input.socialLinks !== undefined) {
    const sanitizedLinks = sanitizeProviderSocialLinks(resolved.input.socialLinks)
    profile.socialLinks = { ...(profile.socialLinks ?? {}), ...sanitizedLinks } as typeof profile.socialLinks
    if (resolved.input.socialLinks.website !== undefined) profile.website = sanitizedLinks.website ?? ''
  }

  await profile.save()
  revalidateTag('public-providers', 'default')
  return { ok: true, profile: toProviderProfileView(profile) }
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
  revalidateTag('public-providers', 'default')
  return { ok: true, profile: toProviderProfileView(profile) }
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
  revalidateTag('public-providers', 'default')
  return { ok: true, profile: toProviderProfileView(profile) }
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
  revalidateTag('public-providers', 'default')
  return { ok: true, profile: toProviderProfileView(profile) }
}

export async function deleteCatalogItem(caller: ProfileCaller, itemId: string): Promise<CatalogResult> {
  await getDb()

  const profile = await ProviderProfile.findOne({ userId: caller.id })
  if (!profile) return { ok: false, status: 404, error: 'profile_not_found' }

  const next = profile.catalog.filter((i) => i.id !== itemId)
  if (next.length === profile.catalog.length) return { ok: false, status: 404, error: 'item_not_found' }
  profile.catalog = next as typeof profile.catalog

  await profile.save()
  revalidateTag('public-providers', 'default')
  return { ok: true, profile: toProviderProfileView(profile) }
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
  revalidateTag('public-providers', 'default')
  return { ok: true, profile: toProviderProfileView(profile) }
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
  revalidateTag('public-providers', 'default')
  return { ok: true, profile: toProviderProfileView(profile) }
}

import { getDb } from '../db/mongoose'
import ProviderProfile, { type ProviderProfileDoc } from '../models/ProviderProfile'

export type PublicProvider = ProviderProfileDoc & { userId: string }
// Type "plat" (résultat réel de .lean(), sans les méthodes DocumentArray de
// Mongoose que InferSchemaType laisse fuiter dans le type) — à utiliser côté
// pages plutôt que ProviderProfileDoc['catalog'] directement.
export type CatalogItem = {
  id: string
  name: string
  description?: string
  price?: number | null
  currency?: 'EUR' | 'XOF'
  unit?: string
  category?: string
  available?: boolean
  media?: { url: string; type?: 'image' | 'video' }[]
}

// Visibilité : abonnement actif, OU agent, OU le propriétaire consultant sa
// propre page (même logique que services.js:isProviderVisible côté legacy).
export function isProviderVisible(
  provider: Pick<ProviderProfileDoc, 'subscriptionActive'> | null | undefined,
  viewer?: { activeRole?: string; id?: string } | null,
  ownerUserId?: string
): boolean {
  if (!provider) return false
  if (viewer?.activeRole === 'agent') return true
  if (viewer?.id && ownerUserId && viewer.id === ownerUserId) return true
  return provider.subscriptionActive === true
}

// "Non-fantôme" : un profil doit avoir un minimum de contenu pour apparaître
// dans l'annuaire (même règle que PublicPrestataires.jsx).
function isNonGhost(p: ProviderProfileDoc): boolean {
  const hasBasics = Boolean(p.name) && Boolean(p.photoUrl || p.description || p.city || p.location || p.regionId || (p.zonesIntervention?.length))
  const hasVisibleCatalog = (p.catalog || []).some((item) => item.available !== false)
  return hasBasics || hasVisibleCatalog
}

export async function listPublicProviders(): Promise<PublicProvider[]> {
  await getDb()
  const docs = await ProviderProfile.find({ subscriptionActive: true }).sort({ updatedAt: -1 }).lean()
  return docs.filter(isNonGhost) as PublicProvider[]
}

export async function getProviderByUserId(
  userId: string,
  viewer?: { activeRole?: string; id?: string } | null
): Promise<PublicProvider | null> {
  await getDb()
  const doc = await ProviderProfile.findOne({ userId }).lean()
  if (!doc) return null
  if (!isProviderVisible(doc, viewer, doc.userId)) return null
  return doc as PublicProvider
}

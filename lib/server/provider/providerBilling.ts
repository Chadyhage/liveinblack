// Remplace api/provider-billing-region.js. Le pays de facturation vit sur
// `User.providerBillingRegionId` (un seul champ — voir le commentaire sur ce
// champ dans lib/models/User.ts) au lieu de la collection Firestore séparée
// `provider_billing/{uid}` : plus de document à part pour cette seule valeur.
import { getDb } from '@/lib/db/mongoose'
import User from '@/lib/models/User'
import Application from '@/lib/models/Application'
import { buildProviderBillingContext, deriveDefaultBillingRegionFromApplication, type BillingContext } from './providerBillingUtils'
import { normalizeProviderBillingRegion } from '@/lib/shared/providerBillingRegion'

// Premier chargement : pas encore de pays de facturation choisi explicitement.
// On dérive un défaut raisonnable (pays déclaré dans le dernier dossier
// prestataire) plutôt que de forcer 'france' à l'aveugle — miroir léger de
// `findLegacyBillingRegion`, sans la migration Firestore qui n'a plus lieu
// d'être ici (cette base Mongo n'a jamais connu `provider_billing/{uid}`).
async function deriveDefaultBillingRegion(userId: string): Promise<string> {
  const application = await Application.findOne({ userId, type: 'prestataire' })
    .sort({ updatedAt: -1 })
    .lean()
  return deriveDefaultBillingRegionFromApplication((application?.formData as Record<string, unknown> | undefined)?.pays)
}

export async function getProviderBillingContext(caller: { id: string }): Promise<BillingContext> {
  await getDb()
  const user = await User.findById(caller.id).lean()
  let billingRegionId = normalizeProviderBillingRegion(user?.providerBillingRegionId)

  if (!billingRegionId) {
    billingRegionId = await deriveDefaultBillingRegion(caller.id)
    await User.updateOne({ _id: caller.id }, { $set: { providerBillingRegionId: billingRegionId } })
  }

  return buildProviderBillingContext({
    billingRegionId,
    prestataireSubActive: user?.prestataireSubActive,
  })
}

export type SetBillingRegionResult =
  | { ok: true; context: BillingContext }
  | { ok: false; status: number; error: string }

export async function setProviderBillingRegion(caller: { id: string }, regionId: unknown): Promise<SetBillingRegionResult> {
  const nextRegionId = normalizeProviderBillingRegion(regionId)
  if (!nextRegionId) return { ok: false, status: 400, error: 'invalid_billing_region' }

  await getDb()
  const current = await getProviderBillingContext(caller)
  if (nextRegionId !== current.billingRegionId && !current.canChange) {
    return { ok: false, status: 409, error: 'subscription_active' }
  }

  if (nextRegionId !== current.billingRegionId) {
    await User.updateOne({ _id: caller.id }, { $set: { providerBillingRegionId: nextRegionId } })
  }

  return {
    ok: true,
    context: buildProviderBillingContext({
      billingRegionId: nextRegionId,
      prestataireSubActive: !current.canChange,
    }),
  }
}

import { getDb } from '../lib/firebaseAdmin.js'
import { requireAuth } from '../lib/verifyAuth.js'
import { normalizeProviderBillingRegion, providerBillingCurrency } from '../lib/providerBillingRegion.js'

async function findLegacyBillingRegion(db, uid, user) {
  const direct = normalizeProviderBillingRegion(user?.country)
  if (direct) return direct

  try {
    const applications = await db.collection('applications').where('uid', '==', String(uid)).get()
    const candidate = applications.docs
      .map(doc => doc.data())
      .filter(app => app?.type === 'prestataire')
      .sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0))[0]
    const fromApplication = normalizeProviderBillingRegion(candidate?.formData?.pays)
    if (fromApplication) return fromApplication
  } catch {}

  // Migration unique des anciens comptes : cette donnée publique n'est lue qu'une
  // fois pour initialiser la donnée privée, puis elle ne pilote plus la facturation.
  const provider = await db.collection('providers').doc(String(uid)).get()
  return normalizeProviderBillingRegion(provider.exists ? provider.data()?.regionId || provider.data()?.country : '')
}

async function loadBillingContext(db, uid) {
  const userRef = db.collection('users').doc(String(uid))
  const billingRef = db.collection('provider_billing').doc(String(uid))
  const [userSnap, providerSnap, billingSnap] = await Promise.all([
    userRef.get(),
    db.collection('providers').doc(String(uid)).get(),
    billingRef.get(),
  ])
  const user = userSnap.exists ? userSnap.data() : {}
  const provider = providerSnap.exists ? providerSnap.data() : {}
  const billing = billingSnap.exists ? billingSnap.data() : {}
  let billingRegionId = normalizeProviderBillingRegion(billing.regionId)

  if (!billingRegionId) {
    billingRegionId = await findLegacyBillingRegion(db, uid, user)
    if (!billingRegionId) billingRegionId = 'france'
    await billingRef.set({
      regionId: billingRegionId,
      source: 'legacy_migration',
      updatedAt: Date.now(),
    }, { merge: true })
  }

  return {
    billingRef,
    user,
    billingRegionId,
    subscriptionActive: user.prestataireSubActive === true || provider.subscriptionActive === true,
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const caller = await requireAuth(req, res)
  if (!caller) return

  try {
    const context = await loadBillingContext(getDb(), caller.uid)

    if (req.method === 'POST') {
      const nextRegionId = normalizeProviderBillingRegion(req.body?.billingRegionId)
      if (!nextRegionId) return res.status(400).json({ error: 'Pays de facturation invalide.' })
      if (nextRegionId !== context.billingRegionId && context.subscriptionActive) {
        return res.status(409).json({ error: 'Ton abonnement est actif. Termine ou annule-le avant de changer de pays de facturation.' })
      }
      if (nextRegionId !== context.billingRegionId) {
        await context.billingRef.set({
          regionId: nextRegionId,
          source: 'account_settings',
          updatedAt: Date.now(),
        }, { merge: true })
      }
      context.billingRegionId = nextRegionId
    }

    return res.status(200).json({
      billingRegionId: context.billingRegionId,
      currency: providerBillingCurrency(context.billingRegionId),
      canChange: !context.subscriptionActive,
    })
  } catch (error) {
    console.error('[/api/provider-billing-region] error:', error)
    return res.status(500).json({ error: 'Impossible de charger la facturation pour le moment.' })
  }
}

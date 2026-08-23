import User from '../models/User'
import { isStripeConnectCountry } from '../shared/fees'

export type SellerSettlementMode = {
  sellerUid: string | null
  connectMode: 'auto' | 'ledger' | 'none'
}

// Source unique du choix Connect/ledger. Une commande issue d'un seat-hold
// doit rémunérer l'organisateur exactement comme un achat de billet normal.
export async function resolveSellerSettlementMode(input: {
  sellerUid: string | null | undefined
  buyerUid: string
  rail: 'stripe' | 'fedapay' | 'free'
}): Promise<SellerSettlementMode> {
  const sellerUid = input.sellerUid || null
  if (!sellerUid || sellerUid === input.buyerUid) return { sellerUid, connectMode: 'none' }
  if (input.rail !== 'stripe') return { sellerUid, connectMode: 'ledger' }

  const seller = await User.findById(sellerUid)
    .select('stripeAccountId stripeChargesEnabled stripeCountry')
    .lean()
    .catch(() => null)
  const eligible = Boolean(seller?.stripeAccountId)
    && seller?.stripeChargesEnabled === true
    && isStripeConnectCountry(seller?.stripeCountry)
  return { sellerUid, connectMode: eligible ? 'auto' : 'ledger' }
}

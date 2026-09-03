import User from '@/lib/models/User'

export type FedapaySellerAccount = {
  reference: string | null
}

export function sanitizeFedapaySubAccountReference(input: unknown): string | null {
  const value = String(input || '').trim()
  if (!value) return null
  return value.replace(/\s+/g, '').slice(0, 120)
}

export async function getFedapaySellerAccount(sellerUid: string | null | undefined): Promise<FedapaySellerAccount> {
  if (!sellerUid) return { reference: null }
  const seller = await User.findById(sellerUid).select('fedapaySubAccountReference').lean().catch(() => null)
  return { reference: sanitizeFedapaySubAccountReference(seller?.fedapaySubAccountReference) }
}

export function sellerShareForOrder(input: {
  unitPriceMinor: number
  seatCount: number
  preorderTotalMinor?: number
  cancellationProtectionFeeMinor?: number
}): number {
  return Math.max(
    0,
    Math.round(Number(input.unitPriceMinor || 0) * Math.max(1, input.seatCount || 1))
      + Math.round(Number(input.preorderTotalMinor || 0))
      + Math.round(Number(input.cancellationProtectionFeeMinor || 0))
  )
}

export function fedapayMarketplaceCommissions(reference: string | null | undefined, amount: number): Array<{ reference: string; amount: number }> | undefined {
  const cleanReference = sanitizeFedapaySubAccountReference(reference)
  const cleanAmount = Math.round(Number(amount) || 0)
  if (!cleanReference || cleanAmount <= 0) return undefined
  return [{ reference: cleanReference, amount: cleanAmount }]
}

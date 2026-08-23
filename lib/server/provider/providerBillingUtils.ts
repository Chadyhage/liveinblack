import { normalizeProviderBillingRegion, providerBillingCurrency } from '@/lib/shared/providerBillingRegion'

export type BillingContext = {
  billingRegionId: string
  currency: 'EUR' | 'XOF'
  canChange: boolean
}

export function deriveDefaultBillingRegionFromApplication(country: unknown): string {
  return normalizeProviderBillingRegion(country) || 'france'
}

export function canChangeProviderBillingRegion(prestataireSubActive: boolean | null | undefined): boolean {
  return prestataireSubActive !== true
}

export function buildProviderBillingContext(input: {
  billingRegionId: unknown
  prestataireSubActive?: boolean | null
}): BillingContext {
  const billingRegionId = normalizeProviderBillingRegion(input.billingRegionId) || 'france'
  return {
    billingRegionId,
    currency: providerBillingCurrency(billingRegionId),
    canChange: canChangeProviderBillingRegion(input.prestataireSubActive),
  }
}

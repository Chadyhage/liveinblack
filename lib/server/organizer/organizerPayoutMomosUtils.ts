import { validateMomoNumber } from '@/lib/shared/payoutMomoValidation'
import { normalizeRegionId } from '@/lib/shared/locations'
import { regions } from '@/lib/shared/regions'

export interface PayoutFailureCandidate {
  failCode?: string | null
  momoCountry?: string | null
}

export interface PayoutEventLike {
  region?: string | null
  cancelled?: boolean | null
}

export function momosToRecord(momos: unknown): Record<string, string> {
  if (momos instanceof Map) return Object.fromEntries(momos)
  return (momos as Record<string, string>) ?? {}
}

export function sanitizePayoutMomos(momos: Record<string, string>): { ok: true; momos: Record<string, string> } | { ok: false; error: string } {
  const clean: Record<string, string> = {}

  for (const [momoCountry, raw] of Object.entries(momos)) {
    if (!raw || !String(raw).trim()) continue
    const result = validateMomoNumber(momoCountry, raw)
    if (!result.ok) return { ok: false, error: result.error }
    clean[momoCountry] = result.number
  }

  return { ok: true, momos: clean }
}

export function isRearmableFailCode(failCode: string | null | undefined): boolean {
  return failCode === 'no_momo_number' || failCode === 'country_undetermined'
}

export function resolvePayoutMomoCountry(candidate: PayoutFailureCandidate, event: PayoutEventLike | null | undefined): string | null {
  if (candidate.momoCountry) return candidate.momoCountry
  if (!event) return null
  const regionId = normalizeRegionId(event.region || '')
  return regions.find((region) => region.id === regionId)?.momoCountry || null
}

export function canRearmPayout(candidate: PayoutFailureCandidate, event: PayoutEventLike | null | undefined, sellerMomos: Record<string, string>): { ok: true; eventCountry: string } | { ok: false } {
  if (!isRearmableFailCode(candidate.failCode)) return { ok: false }
  if (!event || event.cancelled) return { ok: false }

  const eventCountry = resolvePayoutMomoCountry(candidate, event)
  if (!eventCountry) return { ok: false }
  if (!sellerMomos[eventCountry]) return { ok: false }

  return { ok: true, eventCountry }
}

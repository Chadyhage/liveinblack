import { isStripeConnectCountry } from '../shared/fees'
import { safeInternalPath } from '../shared/safeNavigation'

export interface PayoutStatusView {
  mode: 'connect' | 'manual' | 'none'
  connected: boolean
  chargesEnabled: boolean
  country: string | null
  amountDueCents: number
  amountDueXOF: number
}

export interface OrganizerPayoutUserLike {
  stripeAccountId?: string | null
  stripeCountry?: string | null
  stripeChargesEnabled?: boolean | null
}

export interface OrganizerBalanceLike {
  amountDueCents?: number | null
  amountDueXOF?: number | null
}

const CONNECT_RETURN_PATHS = new Set(['/my-events', '/organizer-studio'])

export function derivePayoutMode(user: OrganizerPayoutUserLike): PayoutStatusView['mode'] {
  if (user.stripeAccountId) return 'connect'
  if (user.stripeCountry && !isStripeConnectCountry(user.stripeCountry)) return 'manual'
  return 'none'
}

export function buildPayoutStatusView(user: OrganizerPayoutUserLike, balance: OrganizerBalanceLike | null | undefined): PayoutStatusView {
  return {
    mode: derivePayoutMode(user),
    connected: Boolean(user.stripeAccountId),
    chargesEnabled: Boolean(user.stripeChargesEnabled),
    country: user.stripeCountry ?? null,
    amountDueCents: balance?.amountDueCents ?? 0,
    amountDueXOF: balance?.amountDueXOF ?? 0,
  }
}

export function resolveConnectReturnPath(candidatePath: string | undefined, fallback = '/my-events'): string {
  const safePath = safeInternalPath(candidatePath, fallback)
  try {
    const parsed = new URL(safePath, 'https://liveinblack.invalid')
    return CONNECT_RETURN_PATHS.has(parsed.pathname) ? `${parsed.pathname}${parsed.search}${parsed.hash}` : fallback
  } catch {
    return fallback
  }
}

export function buildConnectReturnUrls(site: string, returnPath: string): { refresh_url: string; return_url: string } {
  const refreshUrl = new URL(returnPath, site)
  refreshUrl.searchParams.set('connect', 'refresh')
  const returnUrl = new URL(returnPath, site)
  returnUrl.searchParams.set('connect', 'done')
  return {
    refresh_url: refreshUrl.toString(),
    return_url: returnUrl.toString(),
  }
}

export function readManualPayoutAmounts(balance: OrganizerBalanceLike | null | undefined): { amountDueCents: number; amountDueXOF: number } {
  return {
    amountDueCents: balance?.amountDueCents ?? 0,
    amountDueXOF: balance?.amountDueXOF ?? 0,
  }
}

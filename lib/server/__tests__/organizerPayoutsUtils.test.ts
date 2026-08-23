import { describe, expect, it } from 'vitest'
import {
  buildConnectReturnUrls,
  buildPayoutStatusView,
  derivePayoutMode,
  readManualPayoutAmounts,
  resolveConnectReturnPath,
} from '../organizer/organizerPayoutsUtils'

describe('organizerPayoutsUtils', () => {
  it('dérive correctement le mode de payout', () => {
    expect(derivePayoutMode({ stripeAccountId: 'acct_123', stripeCountry: 'FR' })).toBe('connect')
    expect(derivePayoutMode({ stripeAccountId: 'acct_123', stripeCountry: 'TG' })).toBe('connect')
    expect(derivePayoutMode({ stripeCountry: 'TG' })).toBe('manual')
    expect(derivePayoutMode({})).toBe('none')
  })

  it('construit une vue de payout stable avec fallbacks', () => {
    expect(
      buildPayoutStatusView(
        { stripeAccountId: null, stripeCountry: 'TG', stripeChargesEnabled: false },
        { amountDueCents: null, amountDueXOF: 12000 }
      )
    ).toEqual({
      mode: 'manual',
      connected: false,
      chargesEnabled: false,
      country: 'TG',
      amountDueCents: 0,
      amountDueXOF: 12000,
    })

    expect(buildPayoutStatusView({}, null)).toEqual({
      mode: 'none',
      connected: false,
      chargesEnabled: false,
      country: null,
      amountDueCents: 0,
      amountDueXOF: 0,
    })
  })

  it('normalise le returnPath vers les seules destinations autorisées', () => {
    expect(resolveConnectReturnPath('/organizer-studio')).toBe('/organizer-studio')
    expect(resolveConnectReturnPath('/organizer-studio?tab=payouts#section')).toBe('/organizer-studio?tab=payouts#section')
    expect(resolveConnectReturnPath('/admin/evil')).toBe('/my-events')
    expect(resolveConnectReturnPath('//evil.example/path')).toBe('/my-events')
    expect(resolveConnectReturnPath(undefined)).toBe('/my-events')
  })

  it('construit les URLs de retour Stripe avec le bon query param', () => {
    expect(buildConnectReturnUrls('https://liveinblack.com', '/organizer-studio')).toEqual({
      refresh_url: 'https://liveinblack.com/organizer-studio?connect=refresh',
      return_url: 'https://liveinblack.com/organizer-studio?connect=done',
    })

    expect(buildConnectReturnUrls('https://liveinblack.com', '/organizer-studio?tab=payouts')).toEqual({
      refresh_url: 'https://liveinblack.com/organizer-studio?tab=payouts&connect=refresh',
      return_url: 'https://liveinblack.com/organizer-studio?tab=payouts&connect=done',
    })
  })

  it('lit les montants de reversement manuel avec fallbacks à zéro', () => {
    expect(readManualPayoutAmounts({ amountDueCents: 5000, amountDueXOF: null })).toEqual({
      amountDueCents: 5000,
      amountDueXOF: 0,
    })
    expect(readManualPayoutAmounts({ amountDueCents: 0, amountDueXOF: 2500 })).toEqual({
      amountDueCents: 0,
      amountDueXOF: 2500,
    })
    expect(readManualPayoutAmounts(undefined)).toEqual({
      amountDueCents: 0,
      amountDueXOF: 0,
    })
  })
})

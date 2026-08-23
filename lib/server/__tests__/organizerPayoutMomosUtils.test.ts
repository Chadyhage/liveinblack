import { describe, expect, it } from 'vitest'
import { canRearmPayout, isRearmableFailCode, momosToRecord, resolvePayoutMomoCountry, sanitizePayoutMomos } from '../organizer/organizerPayoutMomosUtils'

describe('organizerPayoutMomosUtils', () => {
  it('convertit une Map ou un objet simple en record', () => {
    expect(momosToRecord(new Map([['tg', '+22890000000']]))).toEqual({ tg: '+22890000000' })
    expect(momosToRecord({ bj: '+22991111111' })).toEqual({ bj: '+22991111111' })
    expect(momosToRecord(null)).toEqual({})
  })

  it('nettoie les numéros valides et ignore les valeurs vides', () => {
    expect(sanitizePayoutMomos({ tg: '+228 90 00 00 00', bj: '   ' })).toEqual({
      ok: true,
      momos: { tg: '+22890000000' },
    })
    expect(sanitizePayoutMomos({ tg: '+22890000000', bj: '+229 91 11 11 11' })).toEqual({
      ok: true,
      momos: { tg: '+22890000000', bj: '+22991111111' },
    })
  })

  it('remonte une erreur quand un numéro est invalide', () => {
    const result = sanitizePayoutMomos({ tg: '+229 90 00 00 00' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('Numéro invalide pour Togo')
  })

  it('reconnaît les codes d’échec réarmables', () => {
    expect(isRearmableFailCode('no_momo_number')).toBe(true)
    expect(isRearmableFailCode('country_undetermined')).toBe(true)
    expect(isRearmableFailCode('payout_rejected')).toBe(false)
  })

  it('résout le pays de versement depuis le payout ou la région de l’événement', () => {
    expect(resolvePayoutMomoCountry({ momoCountry: 'tg' }, { region: 'Bénin' })).toBe('tg')
    expect(resolvePayoutMomoCountry({ momoCountry: null }, { region: 'Bénin' })).toBe('bj')
    expect(resolvePayoutMomoCountry({ momoCountry: '' }, { region: 'Togo' })).toBe('tg')
    expect(resolvePayoutMomoCountry({ momoCountry: null }, { region: 'Unknown' })).toBeNull()
  })

  it('autorise le réarmement uniquement si la cause est levée', () => {
    expect(
      canRearmPayout(
        { failCode: 'country_undetermined', momoCountry: null },
        { region: 'Bénin', cancelled: false },
        { bj: '+22991111111' }
      )
    ).toEqual({ ok: true, eventCountry: 'bj' })

    expect(
      canRearmPayout(
        { failCode: 'payout_rejected', momoCountry: 'tg' },
        { region: 'Togo', cancelled: false },
        { tg: '+22890000000' }
      )
    ).toEqual({ ok: false })

    expect(
      canRearmPayout(
        { failCode: 'no_momo_number', momoCountry: null },
        { region: 'Togo', cancelled: true },
        { tg: '+22890000000' }
      )
    ).toEqual({ ok: false })

    expect(
      canRearmPayout(
        { failCode: 'no_momo_number', momoCountry: 'tg' },
        { region: 'Unknown', cancelled: false },
        { tg: '+22890000000' }
      )
    ).toEqual({ ok: true, eventCountry: 'tg' })

    expect(
      canRearmPayout(
        { failCode: 'no_momo_number', momoCountry: null },
        { region: 'Togo', cancelled: false },
        {}
      )
    ).toEqual({ ok: false })
  })
})

// Tests UNITAIRES purs (aucune base) pour lib/shared/payoutMomoValidation.ts
// (#7 phase organisateur — port de la validation de src/components/MomoPayoutManager.jsx).
import { describe, it, expect } from 'vitest'
import { validateMomoNumber, MOMO_REGIONS } from '../payoutMomoValidation'

describe('MOMO_REGIONS', () => {
  it('ne contient que des régions UEMOA (momoCountry non nul)', () => {
    expect(MOMO_REGIONS.length).toBeGreaterThan(0)
    expect(MOMO_REGIONS.every((r) => Boolean(r.momoCountry))).toBe(true)
    expect(MOMO_REGIONS.some((r) => r.id === 'france')).toBe(false)
  })
})

describe('validateMomoNumber', () => {
  it('refuse un pays Mobile Money inconnu', () => {
    const result = validateMomoNumber('xx', '+228 90 00 00 00')
    expect(result.ok).toBe(false)
  })

  it('refuse un numéro vide', () => {
    const result = validateMomoNumber('tg', '   ')
    expect(result.ok).toBe(false)
  })

  it("refuse un numéro qui ne commence pas par l'indicatif du pays", () => {
    const result = validateMomoNumber('tg', '+229 90 00 00 00')
    expect(result.ok).toBe(false)
  })

  it('refuse un numéro trop court', () => {
    const result = validateMomoNumber('tg', '+228123')
    expect(result.ok).toBe(false)
  })

  it('accepte un numéro valide et le normalise (retire espaces/points/tirets)', () => {
    const result = validateMomoNumber('tg', '+228 90.00-00 00')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.number).toBe('+22890000000')
  })
})

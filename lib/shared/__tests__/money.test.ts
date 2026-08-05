// Port du sous-ensemble "money" de scripts/fedapay.test.mjs
import { describe, it, expect } from 'vitest'
import { fmtMoney, eventCurrency, regionToCurrency } from '../money'

describe('regionToCurrency', () => {
  it('Togo/Bénin → XOF, France/défaut → EUR', () => {
    expect(regionToCurrency('Togo')).toBe('XOF')
    expect(regionToCurrency('Bénin')).toBe('XOF')
    expect(regionToCurrency('benin')).toBe('XOF')
    expect(regionToCurrency('France')).toBe('EUR')
    expect(regionToCurrency('')).toBe('EUR')
    expect(regionToCurrency(null)).toBe('EUR')
  })
})

describe('eventCurrency', () => {
  it('champ currency EXPLICITE uniquement — jamais de fallback région', () => {
    expect(eventCurrency({ currency: 'XOF' })).toBe('XOF')
    expect(eventCurrency({ currency: 'xof' })).toBe('XOF')
    // CRITIQUE : un event Togo créé avant le multi-devise (prix en €, pas de
    // champ currency) doit rester EUR — sinon bradé au 1/655e.
    expect(eventCurrency({})).toBe('EUR')
    expect(eventCurrency(null)).toBe('EUR')
  })
})

// `toLocaleString('fr-FR')` insère un séparateur de milliers dont le
// caractère exact dépend de la version ICU du runtime (espace normale,
// insécable, ou fine insécable) — on normalise tout espace Unicode avant
// comparaison plutôt que de dépendre d'un caractère précis.
function normalizeSpaces(s: string): string {
  return s.replace(/\s/gu, ' ')
}

describe('fmtMoney', () => {
  it('XOF entier avec suffixe FCFA, EUR avec décimales seulement si utiles', () => {
    expect(normalizeSpaces(fmtMoney(5000, 'XOF'))).toBe('5 000 FCFA')
    expect(normalizeSpaces(fmtMoney(12, 'EUR'))).toBe('12 €')
    expect(normalizeSpaces(fmtMoney(12.5, 'EUR'))).toBe('12,50 €')
  })
})

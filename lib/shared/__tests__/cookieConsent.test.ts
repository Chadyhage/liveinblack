// Tests unitaires purs pour lib/shared/cookieConsent.ts (port de
// src/utils/cookies.js). L'environnement Vitest global est 'node' (voir
// vitest.config.ts) : on fournit ici de faux `window`/`document`/
// `localStorage` minimalistes plutôt que d'ajouter jsdom comme dépendance.
import { beforeEach, describe, expect, it } from 'vitest'
import {
  CONSENT_TTL_MS,
  COOKIE_CONSENT_KEY,
  allowsFunctionalPreferences,
  getCookieConsent,
  getFunctionalPreference,
  resetCookieConsent,
  saveCookieConsent,
  setFunctionalPreference,
} from '../cookieConsent'

class FakeStorage {
  private store = new Map<string, string>()
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value)
  }
  removeItem(key: string): void {
    this.store.delete(key)
  }
}

function createFakeDocument() {
  const cookies = new Map<string, string>()
  return {
    get cookie(): string {
      return Array.from(cookies.entries())
        .map(([name, value]) => `${name}=${value}`)
        .join('; ')
    },
    set cookie(raw: string) {
      const [pair, ...attrs] = raw.split('; ')
      const eqIdx = pair.indexOf('=')
      const name = pair.slice(0, eqIdx)
      const value = pair.slice(eqIdx + 1)
      const maxAge = attrs.find((a) => a.toLowerCase().startsWith('max-age='))
      if (maxAge && maxAge.split('=')[1] === '0') {
        cookies.delete(name)
      } else {
        cookies.set(name, value)
      }
    },
  }
}

let fakeStorage: FakeStorage

beforeEach(() => {
  fakeStorage = new FakeStorage()
  const fakeDocument = createFakeDocument()
  ;(globalThis as Record<string, unknown>).window = { localStorage: fakeStorage, dispatchEvent: () => true }
  ;(globalThis as Record<string, unknown>).localStorage = fakeStorage
  ;(globalThis as Record<string, unknown>).document = fakeDocument
  ;(globalThis as Record<string, unknown>).location = { protocol: 'https:' }
})

describe('getCookieConsent', () => {
  it('renvoie null quand rien n’est stocké', () => {
    expect(getCookieConsent()).toBeNull()
  })

  it('renvoie null pour une valeur corrompue', () => {
    fakeStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify({ value: 'maybe', ts: Date.now() }))
    expect(getCookieConsent()).toBeNull()
  })

  it('renvoie null si le consentement a expiré (> 6 mois)', () => {
    const expiredTs = Date.now() - CONSENT_TTL_MS - 1000
    fakeStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify({ value: 'accepted', ts: expiredTs }))
    expect(getCookieConsent()).toBeNull()
  })

  it('retombe sur le cookie si le localStorage est vide mais le cookie persiste', () => {
    saveCookieConsent('accepted')
    fakeStorage.removeItem(COOKIE_CONSENT_KEY)
    const consent = getCookieConsent()
    expect(consent?.value).toBe('accepted')
  })
})

describe('saveCookieConsent', () => {
  it('accepté → categories.preferences = true', () => {
    saveCookieConsent('accepted')
    const consent = getCookieConsent()
    expect(consent?.value).toBe('accepted')
    expect(consent?.categories.preferences).toBe(true)
    expect(consent?.categories.essential).toBe(true)
  })

  it('refusé → categories.preferences = false et efface les préférences déjà stockées', () => {
    fakeStorage.setItem('lib_music_disc', 'disc-3')
    fakeStorage.setItem('lib_music_volume', '0.8')

    saveCookieConsent('refused')

    const consent = getCookieConsent()
    expect(consent?.value).toBe('refused')
    expect(consent?.categories.preferences).toBe(false)
    expect(fakeStorage.getItem('lib_music_disc')).toBeNull()
    expect(fakeStorage.getItem('lib_music_volume')).toBeNull()
  })

  it('ignore une valeur invalide', () => {
    // @ts-expect-error valeur volontairement invalide pour tester le garde-fou
    expect(saveCookieConsent('maybe')).toBeNull()
    expect(getCookieConsent()).toBeNull()
  })
})

describe('resetCookieConsent', () => {
  it('efface le consentement stocké', () => {
    saveCookieConsent('accepted')
    expect(getCookieConsent()).not.toBeNull()
    resetCookieConsent()
    expect(getCookieConsent()).toBeNull()
  })
})

describe('allowsFunctionalPreferences / préférences fonctionnelles', () => {
  it('refuse tant qu’aucun consentement accepté n’a été donné', () => {
    expect(allowsFunctionalPreferences()).toBe(false)
    expect(setFunctionalPreference('lib_music_disc', 'disc-1')).toBe(false)
    expect(getFunctionalPreference('lib_music_disc', 'fallback')).toBe('fallback')
  })

  it('autorise la lecture/écriture après acceptation', () => {
    saveCookieConsent('accepted')
    expect(allowsFunctionalPreferences()).toBe(true)
    expect(setFunctionalPreference('lib_music_disc', 'disc-1')).toBe(true)
    expect(getFunctionalPreference('lib_music_disc')).toBe('disc-1')
  })

  it('révoque après un refus', () => {
    saveCookieConsent('accepted')
    setFunctionalPreference('lib_music_disc', 'disc-1')
    saveCookieConsent('refused')
    expect(allowsFunctionalPreferences()).toBe(false)
    expect(getFunctionalPreference('lib_music_disc', 'fallback')).toBe('fallback')
  })
})

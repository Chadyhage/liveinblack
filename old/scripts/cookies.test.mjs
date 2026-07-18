import test from 'node:test'
import assert from 'node:assert/strict'

class MemoryStorage {
  constructor() { this.items = new Map() }
  getItem(key) { return this.items.has(key) ? this.items.get(key) : null }
  setItem(key, value) { this.items.set(key, String(value)) }
  removeItem(key) { this.items.delete(key) }
}

const localStorage = new MemoryStorage()
let cookie = ''
globalThis.window = { localStorage, dispatchEvent() {} }
globalThis.localStorage = localStorage
globalThis.location = { protocol: 'https:' }
globalThis.CustomEvent = class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail } }
globalThis.Event = class Event { constructor(type) { this.type = type } }
globalThis.document = {}
Object.defineProperty(globalThis.document, 'cookie', {
  get() { return cookie },
  set(value) { cookie = value },
})

const {
  COOKIE_CONSENT_KEY,
  getCookieConsent,
  saveCookieConsent,
  resetCookieConsent,
  allowsFunctionalPreferences,
  getFunctionalPreference,
  setFunctionalPreference,
} = await import('../src/utils/cookies.js')

test('le consentement accepté est persistant et autorise uniquement les préférences de confort', () => {
  const consent = saveCookieConsent('accepted')
  assert.equal(consent.value, 'accepted')
  assert.equal(consent.categories.essential, true)
  assert.equal(consent.categories.preferences, true)
  assert.equal(consent.categories.analytics, false)
  assert.match(localStorage.getItem(COOKIE_CONSENT_KEY), /accepted/)
  assert.match(cookie, /SameSite=Lax/)
  assert.equal(allowsFunctionalPreferences(), true)
  assert.equal(setFunctionalPreference('lib_music_disc', 'afro'), true)
  assert.equal(getFunctionalPreference('lib_music_disc'), 'afro')
})

test('le refus conserve le service essentiel mais efface et bloque les préférences optionnelles', () => {
  saveCookieConsent('refused')
  assert.equal(getCookieConsent().value, 'refused')
  assert.equal(allowsFunctionalPreferences(), false)
  assert.equal(localStorage.getItem('lib_music_disc'), null)
  assert.equal(setFunctionalPreference('lib_music_disc', 'house'), false)
  assert.equal(getFunctionalPreference('lib_music_disc', 'fallback'), 'fallback')
})

test('la réinitialisation rend de nouveau le bandeau de choix nécessaire', () => {
  resetCookieConsent()
  assert.equal(localStorage.getItem(COOKIE_CONSENT_KEY), null)
  assert.equal(getCookieConsent(), null)
})

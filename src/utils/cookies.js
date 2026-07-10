// Gestion centralisée des préférences cookies / stockage local.
// LIVEINBLACK n'embarque aucun pixel publicitaire ni outil d'audience tiers.
// Le consentement ne conditionne donc que les préférences de confort (ex. la
// dernière ambiance musicale choisie), jamais la connexion ou les billets.

export const COOKIE_CONSENT_KEY = 'lib_cookie_consent'
export const CONSENT_TTL_MS = 6 * 30 * 24 * 60 * 60 * 1000

function hasBrowserStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function readCookie(name) {
  if (typeof document === 'undefined') return null
  const prefix = `${encodeURIComponent(name)}=`
  const value = document.cookie.split('; ').find(item => item.startsWith(prefix))?.slice(prefix.length)
  if (!value) return null
  try { return decodeURIComponent(value) } catch { return null }
}

function writeCookie(name, value, maxAgeSeconds) {
  if (typeof document === 'undefined') return
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax${secure}`
}

function removeCookie(name) {
  if (typeof document === 'undefined') return
  document.cookie = `${encodeURIComponent(name)}=; Max-Age=0; Path=/; SameSite=Lax`
}

function normalizeConsent(raw) {
  if (!raw || typeof raw !== 'object') return null
  const value = raw.value === 'accepted' || raw.value === 'refused' ? raw.value : null
  const ts = Number(raw.ts)
  if (!value || !Number.isFinite(ts) || Date.now() - ts > CONSENT_TTL_MS) return null
  return {
    value,
    ts,
    version: Number(raw.version) || 1,
    categories: {
      essential: true,
      preferences: value === 'accepted',
      analytics: false,
      marketing: false,
    },
  }
}

export function getCookieConsent() {
  let parsed = null
  try {
    if (hasBrowserStorage()) parsed = JSON.parse(localStorage.getItem(COOKIE_CONSENT_KEY) || 'null')
  } catch {}
  let consent = normalizeConsent(parsed)

  // Fallback utile si localStorage est vidé mais que le navigateur garde le
  // cookie, ou si le navigateur bloque localStorage temporairement.
  if (!consent) {
    try { consent = normalizeConsent(JSON.parse(readCookie(COOKIE_CONSENT_KEY) || 'null')) } catch {}
  }
  return consent
}

export function saveCookieConsent(value) {
  if (value !== 'accepted' && value !== 'refused') return null
  const payload = { value, ts: Date.now(), version: 2 }
  const serialized = JSON.stringify(payload)
  try { if (hasBrowserStorage()) localStorage.setItem(COOKIE_CONSENT_KEY, serialized) } catch {}
  writeCookie(COOKIE_CONSENT_KEY, serialized, Math.floor(CONSENT_TTL_MS / 1000))

  // Un refus doit avoir une conséquence mesurable : on oublie immédiatement
  // les préférences non nécessaires qui auraient pu être sauvegardées avant.
  if (value === 'refused') {
    try {
      localStorage.removeItem('lib_music_volume')
      localStorage.removeItem('lib_music_disc')
    } catch {}
  }
  try { window.dispatchEvent(new CustomEvent('lib:cookie-consent', { detail: getCookieConsent() })) } catch {}
  return getCookieConsent()
}

export function resetCookieConsent() {
  try { if (hasBrowserStorage()) localStorage.removeItem(COOKIE_CONSENT_KEY) } catch {}
  removeCookie(COOKIE_CONSENT_KEY)
  try { window.dispatchEvent(new Event('lib:cookie-consent')) } catch {}
}

export function allowsFunctionalPreferences() {
  return getCookieConsent()?.categories?.preferences === true
}

export function getFunctionalPreference(key, fallback = null) {
  if (!allowsFunctionalPreferences()) return fallback
  try { return localStorage.getItem(key) ?? fallback } catch { return fallback }
}

export function setFunctionalPreference(key, value) {
  if (!allowsFunctionalPreferences()) return false
  try {
    localStorage.setItem(key, String(value))
    return true
  } catch { return false }
}

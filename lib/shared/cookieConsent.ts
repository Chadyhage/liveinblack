// Port TypeScript de src/utils/cookies.js — gestion centralisée des
// préférences cookies / stockage local. LIVEINBLACK n'embarque aucun pixel
// publicitaire ni outil de reciblage tiers. Le consentement conditionne les
// préférences de confort (ex. la dernière ambiance musicale choisie) ET,
// depuis l'ajout de Google Analytics, la mesure d'audience — jamais la
// connexion ou les billets, qui restent strictement nécessaires.

export const COOKIE_CONSENT_KEY = 'lib_cookie_consent'
export const CONSENT_TTL_MS = 6 * 30 * 24 * 60 * 60 * 1000

export type CookieConsentValue = 'accepted' | 'refused'

export interface CookieConsent {
  value: CookieConsentValue
  ts: number
  version: number
  categories: {
    essential: true
    preferences: boolean
    analytics: boolean
    marketing: false
  }
}

function hasBrowserStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const prefix = `${encodeURIComponent(name)}=`
  const value = document.cookie
    .split('; ')
    .find((item) => item.startsWith(prefix))
    ?.slice(prefix.length)
  if (!value) return null
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

function writeCookie(name: string, value: string, maxAgeSeconds: number): void {
  if (typeof document === 'undefined') return
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax${secure}`
}

function removeCookie(name: string): void {
  if (typeof document === 'undefined') return
  document.cookie = `${encodeURIComponent(name)}=; Max-Age=0; Path=/; SameSite=Lax`
}

function normalizeConsent(raw: unknown): CookieConsent | null {
  if (!raw || typeof raw !== 'object') return null
  const value = (raw as { value?: unknown }).value
  const normalizedValue: CookieConsentValue | null = value === 'accepted' || value === 'refused' ? value : null
  const ts = Number((raw as { ts?: unknown }).ts)
  if (!normalizedValue || !Number.isFinite(ts) || Date.now() - ts > CONSENT_TTL_MS) return null
  return {
    value: normalizedValue,
    ts,
    version: Number((raw as { version?: unknown }).version) || 1,
    categories: {
      essential: true,
      preferences: normalizedValue === 'accepted',
      analytics: normalizedValue === 'accepted',
      marketing: false,
    },
  }
}

export function getCookieConsent(): CookieConsent | null {
  let parsed: unknown = null
  try {
    if (hasBrowserStorage()) parsed = JSON.parse(localStorage.getItem(COOKIE_CONSENT_KEY) || 'null')
  } catch {}
  let consent = normalizeConsent(parsed)

  // Fallback utile si localStorage est vidé mais que le navigateur garde le
  // cookie, ou si le navigateur bloque localStorage temporairement.
  if (!consent) {
    try {
      consent = normalizeConsent(JSON.parse(readCookie(COOKIE_CONSENT_KEY) || 'null'))
    } catch {}
  }
  return consent
}

export function saveCookieConsent(value: CookieConsentValue): CookieConsent | null {
  if (value !== 'accepted' && value !== 'refused') return null
  const payload = { value, ts: Date.now(), version: 2 }
  const serialized = JSON.stringify(payload)
  try {
    if (hasBrowserStorage()) localStorage.setItem(COOKIE_CONSENT_KEY, serialized)
  } catch {}
  writeCookie(COOKIE_CONSENT_KEY, serialized, Math.floor(CONSENT_TTL_MS / 1000))

  // Un refus doit avoir une conséquence mesurable : on oublie immédiatement
  // les préférences non nécessaires qui auraient pu être sauvegardées avant.
  if (value === 'refused') {
    try {
      localStorage.removeItem('lib_music_volume')
      localStorage.removeItem('lib_music_disc')
    } catch {}
    // Google Analytics écrit ses propres cookies (_ga, _ga_<container-id>) dès
    // que gtag.js s'exécute — GoogleAnalytics.tsx ne le charge que si le
    // consentement est accordé, mais si un utilisateur revient sur son choix
    // après avoir accepté, ces cookies doivent disparaître immédiatement.
    try {
      document.cookie.split('; ').forEach((entry) => {
        const name = entry.split('=')[0]
        if (name === '_ga' || name.startsWith('_ga_') || name === '_gid' || name === '_gat') removeCookie(name)
      })
    } catch {}
  }
  try {
    window.dispatchEvent(new CustomEvent('lib:cookie-consent', { detail: getCookieConsent() }))
  } catch {}
  return getCookieConsent()
}

export function resetCookieConsent(): void {
  try {
    if (hasBrowserStorage()) localStorage.removeItem(COOKIE_CONSENT_KEY)
  } catch {}
  removeCookie(COOKIE_CONSENT_KEY)
  try {
    window.dispatchEvent(new Event('lib:cookie-consent'))
  } catch {}
}

export function allowsFunctionalPreferences(): boolean {
  return getCookieConsent()?.categories?.preferences === true
}

export function allowsAnalytics(): boolean {
  return getCookieConsent()?.categories?.analytics === true
}

export function getFunctionalPreference(key: string, fallback: string | null = null): string | null {
  if (!allowsFunctionalPreferences()) return fallback
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

export function setFunctionalPreference(key: string, value: unknown): boolean {
  if (!allowsFunctionalPreferences()) return false
  try {
    localStorage.setItem(key, String(value))
    return true
  } catch {
    return false
  }
}

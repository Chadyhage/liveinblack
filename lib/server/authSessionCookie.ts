const AUTH_SESSION_COOKIE_NAMES = new Set([
  'authjs.session-token',
  '__Secure-authjs.session-token',
  '__Host-authjs.session-token',
  'next-auth.session-token',
  '__Secure-next-auth.session-token',
])

export function hasAuthSessionCookie(cookies: Array<{ name: string }>): boolean {
  return cookies.some((cookie) => AUTH_SESSION_COOKIE_NAMES.has(cookie.name))
}

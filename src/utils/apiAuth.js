// Header d'authentification pour les appels /api — pendant client de
// lib/verifyAuth.js. Tous les endpoints (hors webhook Stripe) exigent
// désormais un ID token Firebase : `Authorization: Bearer <token>`.
//
// Usage : headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }
export async function authHeaders() {
  try {
    const { auth, USE_REAL_FIREBASE } = await import('../firebase')
    if (!USE_REAL_FIREBASE || !auth?.currentUser) return {}
    const token = await auth.currentUser.getIdToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch {
    return {}
  }
}

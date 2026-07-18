// Vérification d'identité des endpoints /api — faille n°3 de l'audit.
//
// Avant : AUCUN endpoint ne vérifiait l'appelant (uid pris tel quel dans le
// body). N'importe qui pouvait vider le stock d'un event (event-stock),
// lancer un onboarding Stripe Connect au nom d'autrui (connect-onboard), etc.
//
// Ici : on exige un ID token Firebase (header `Authorization: Bearer <token>`),
// vérifié côté serveur avec l'Admin SDK. Le client l'obtient via
// auth.currentUser.getIdToken() (helper authHeaders() dans src/utils/apiAuth.js).
import { getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getDb } from './firebaseAdmin.js'

/**
 * Vérifie le token Firebase de la requête.
 * Retourne le token décodé ({ uid, email, ... }) ou null — dans ce cas la
 * réponse 401 a DÉJÀ été envoyée : l'appelant doit juste `return`.
 */
export async function requireAuth(req, res) {
  try {
    const header = req.headers.authorization || req.headers.Authorization || ''
    const m = /^Bearer (.+)$/.exec(header)
    if (!m) {
      res.status(401).json({ error: 'auth_required', message: 'Connexion requise.' })
      return null
    }
    // getDb() initialise l'app Admin par défaut si nécessaire (singleton)
    if (!getApps().length) getDb()
    const decoded = await getAuth().verifyIdToken(m[1])
    return decoded
  } catch (e) {
    console.warn('[api-auth] token invalide:', e.message)
    res.status(401).json({ error: 'invalid_token', message: 'Session expirée — reconnecte-toi.' })
    return null
  }
}

/**
 * Variante stricte : le `uid` métier de la requête doit être CELUI du token.
 * Pour les endpoints qui agissent « au nom de » (Stripe Connect, notifs).
 * Retourne le token décodé ou null (403 déjà envoyée).
 */
export async function requireAuthAsUid(req, res, claimedUid) {
  const decoded = await requireAuth(req, res)
  if (!decoded) return null
  if (String(claimedUid || '') !== decoded.uid) {
    res.status(403).json({ error: 'forbidden', message: 'Identité non autorisée.' })
    return null
  }
  return decoded
}

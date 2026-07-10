// Suppression COMPLÈTE d'un compte par un admin — la seule voie qui libère
// l'email. Règle : un compte vit dans 3 couches (Firebase Auth, Firestore,
// localStorage). Le client ne peut pas toucher Auth ; sans cet endpoint, une
// « suppression » laisse un compte fantôme dont l'email reste verrouillé
// (auth/email-already-in-use à la ré-inscription).
//
// POST { uid } — réservé super-admin (env) ou compte agent (rôle Firestore).
import { getAuth } from 'firebase-admin/auth'
import { requireAuth } from '../lib/verifyAuth.js'
import { getDb } from '../lib/firebaseAdmin.js'
import { cancelProviderBillingBeforeDeletion } from '../lib/providerBilling.js'
import { isAdminCaller, isSuperAdminEmail } from '../lib/adminGuard.js'

// Collections Firestore indexées par uid à purger avec le compte.
const UID_COLLECTIONS = [
  'users', 'wallets', 'user_bookings', 'user_events', 'user_social',
  'catalogs', 'providers', 'organizer_profiles',
  'user_boosts', 'used_tickets', 'notifications', 'user_read_status',
  'organizer_follows', 'user_private_access',
]

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })

  const caller = await requireAuth(req, res)
  if (!caller) return

  const db = getDb()
  const { uid, authOnly = false, selfDelete = false } = req.body || {}
  if (!uid || typeof uid !== 'string') {
    return res.status(400).json({ error: 'missing_uid', message: 'uid du compte à supprimer requis.' })
  }

  // ── Autorisation : super-admin (email env) OU rôle agent (Firestore) ──
  // Définition partagée (lib/adminGuard.js) : role OU activeRole OU enabledRoles.
  const isSelfDeletion = selfDelete === true && uid === caller.uid
  if (!isSelfDeletion && !(await isAdminCaller(db, caller))) {
    return res.status(403).json({ error: 'forbidden', message: 'Réservé aux administrateurs.' })
  }

  // authOnly : ne supprime QUE l'utilisateur Firebase Auth (libère l'email) en
  // laissant Firestore intact — utilisé par l'anonymisation RGPD qui conserve
  // une pierre tombale (users/{uid} status:'deleted') pour l'archivage.
  if (isSelfDeletion && authOnly) {
    return res.status(400).json({ error: 'invalid_mode', message: 'La suppression personnelle doit être complète.' })
  }
  if (isSelfDeletion && (!caller.auth_time || Date.now() / 1000 - caller.auth_time > 10 * 60)) {
    return res.status(401).json({ error: 'requires_recent_login', message: 'Reconnecte-toi avant de supprimer ton compte.' })
  }
  if (uid === caller.uid && !isSelfDeletion) {
    return res.status(400).json({ error: 'self_delete', message: 'Impossible de supprimer ton propre compte admin.' })
  }

  // ── 1. Lire l'identité avant toute mutation ──
  let deletedEmail = null
  try {
    const authUser = await getAuth().getUser(uid)
    deletedEmail = authUser.email || null
    // Garde-fou : un admin ne supprime pas un autre super-admin
    if (deletedEmail && isSuperAdminEmail(deletedEmail)) {
      return res.status(403).json({ error: 'protected_account', message: 'Ce compte super-admin est protégé.' })
    }
  } catch (e) {
    if (e.code !== 'auth/user-not-found') {
      console.error('[admin-delete-account] Auth read failed:', e.message)
      return res.status(500).json({ error: 'auth_read_failed', message: `Lecture Firebase Auth impossible : ${e.message}` })
    }
  }

  // ── 2. Facturation — ANNULER AVANT de supprimer Auth / Firestore ──
  // Si Stripe échoue ou si la référence est incohérente, on ne supprime rien.
  let billing = { canceledIds: [], hadBilling: false }
  try {
    billing = await cancelProviderBillingBeforeDeletion(db, uid, caller)
  } catch (error) {
    console.error('[admin-delete-account] billing cancellation failed:', error.message)
    return res.status(409).json({
      error: error.code || 'billing_cancel_failed',
      message: `Suppression bloquée : l'abonnement n'a pas pu être résilié. ${error.message}`,
    })
  }

  // ── 3. Firebase Auth — libère l'email ──
  let authDeleted = false
  try {
    await getAuth().deleteUser(uid)
    authDeleted = true
  } catch (e) {
    if (e.code !== 'auth/user-not-found') {
      console.error('[admin-delete-account] Auth delete failed:', e.message)
      return res.status(500).json({ error: 'auth_delete_failed', message: `Suppression Firebase Auth impossible : ${e.message}` })
    }
  }

  if (authOnly) {
    console.log(`[admin-delete-account] ${caller.email} a libéré l'email de ${uid} (${deletedEmail || '?'}) — authOnly`)
    return res.status(200).json({ ok: true, authDeleted, deletedEmail, billing, firestoreDeleted: 0, applicationsDeleted: 0 })
  }

  // ── 4. Firestore — docs par uid ──
  const results = await Promise.allSettled(
    UID_COLLECTIONS.map(col => db.doc(`${col}/${uid}`).delete())
  )
  const firestoreDeleted = results.filter(r => r.status === 'fulfilled').length

  // ── 5. Firestore — dossiers de candidature liés à cet uid ──
  let applicationsDeleted = 0
  try {
    const apps = await db.collection('applications').where('uid', '==', uid).get()
    await Promise.allSettled(apps.docs.map(d => d.ref.delete()))
    applicationsDeleted = apps.size
  } catch {}

  // ── 6. Firestore — validations / demandes de rôle en attente ──
  // Sans cette purge, l'entrée fantôme restait dans l'onglet Validations et
  // « Valider » recréait un users/{uid} orphelin (sans compte Auth).
  try {
    await db.doc(`pending_validations/${uid}`).delete()
  } catch {}
  try {
    const pendings = await db.collection('pending_validations').where('uid', '==', uid).get()
    await Promise.allSettled(pendings.docs.map(d => d.ref.delete()))
  } catch {}

  console.log(`[admin-delete-account] ${caller.email} a supprimé ${uid} (${deletedEmail || 'email inconnu'}) — auth:${authDeleted} firestore:${firestoreDeleted} apps:${applicationsDeleted}`)
  return res.status(200).json({ ok: true, authDeleted, deletedEmail, billing, firestoreDeleted, applicationsDeleted })
}

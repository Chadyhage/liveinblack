// Suppression COMPLÈTE d'un compte par un admin — la seule voie qui libère
// l'email. Règle : un compte vit dans 3 couches (Firebase Auth, Firestore,
// localStorage). Le client ne peut pas toucher Auth ; sans cet endpoint, une
// « suppression » laisse un compte fantôme dont l'email reste verrouillé
// (auth/email-already-in-use à la ré-inscription).
//
// POST { uid } — réservé super-admin (env) ou compte agent (rôle Firestore).
import { randomBytes } from 'node:crypto'
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
  'user_private', // #8 : l'email PII y vit → doit être purgé (sinon survit à la suppression)
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

  // ── 1.5 Garde ÉVÉNEMENTS + RECETTE de l'organisateur (audit #2/#3/#8) ──
  // Avant TOUTE mutation : refuser la suppression si l'organisateur a encore des
  // événements avec des billets VENDUS (sinon ils resteraient en vente « sans
  // propriétaire » et jamais remboursés) ou de la recette non versée (gelée à
  // vie faute de destinataire). Il doit d'abord ANNULER ces events (ses acheteurs
  // sont alors remboursés via le flux audité) et/ou encaisser ses versements.
  // Fail-closed : on lit seulement, aucune écriture avant ce point.
  try {
    const [byCreated, byOrganizer] = await Promise.all([
      db.collection('events').where('createdBy', '==', uid).get(),
      db.collection('events').where('organizerId', '==', uid).get(),
    ])
    const evMap = new Map()
    for (const d of [...byCreated.docs, ...byOrganizer.docs]) evMap.set(d.id, d)
    const blockingEventIds = []
    const cleanupEventRefs = [] // events sans billet payé → supprimables proprement
    for (const d of evMap.values()) {
      const tSnap = await db.collection('tickets').where('eventId', '==', d.id).get()
      const hasPaidBuyer = tSnap.docs.some(t => {
        const tk = t.data()
        return tk.paid === true && tk.revoked !== true && String(tk.userId || '') !== uid
      })
      if (hasPaidBuyer && d.data().cancelled !== true) blockingEventIds.push(d.id)
      else cleanupEventRefs.push({ ref: d.ref, ticketRefs: tSnap.docs.map(t => t.ref) })
    }

    // Recette non versée : enveloppes event_payouts + solde Stripe interne.
    let owedXOF = 0
    try {
      const pay = await db.collection('event_payouts').where('sellerUid', '==', uid).get()
      owedXOF = pay.docs.reduce((s, p) => {
        const d = p.data()
        return s + ((d.status === 'accumulating' || d.status === 'paying') ? Math.max(0, Number(d.amountDueXOF) || 0) : 0)
      }, 0)
    } catch {}
    let owedCents = 0
    try {
      const sb = await db.doc(`seller_balances/${uid}`).get()
      owedCents = sb.exists ? Math.max(0, Number(sb.data().amountDueCents) || 0) : 0
    } catch {}

    if (blockingEventIds.length > 0 || owedXOF > 0 || owedCents > 0) {
      const parts = []
      if (blockingEventIds.length) parts.push(`${blockingEventIds.length} événement${blockingEventIds.length > 1 ? 's' : ''} avec des billets vendus (annule-${blockingEventIds.length > 1 ? 'les' : 'le'} d'abord — les acheteurs seront remboursés)`)
      if (owedXOF > 0 || owedCents > 0) parts.push('de la recette non encore versée')
      return res.status(409).json({
        error: 'organizer_has_pending_settlement',
        message: `Ce compte a ${parts.join(' et ')}. Règle-les avant de supprimer le compte.`,
        eventIds: blockingEventIds, owedXOF, owedCents,
      })
    }

    // Aucun blocage : supprimer les events orphelins (annulés / sans billet payé)
    // + leur registre tickets/ — sinon ils restent « en vente sans propriétaire ».
    for (const { ref, ticketRefs } of cleanupEventRefs) {
      for (let i = 0; i < ticketRefs.length; i += 450) {
        const batch = db.batch()
        ticketRefs.slice(i, i + 450).forEach(r => batch.delete(r))
        await batch.commit()
      }
      await ref.delete().catch(() => {})
    }
  } catch (e) {
    console.error('[admin-delete-account] garde événements échouée:', e.message)
    return res.status(500).json({ error: 'event_guard_failed', message: `Vérification des événements de l'organisateur impossible : ${e.message}` })
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

  // ── 7. Firestore — libérer les slugs (adresses personnalisées) de l'organisateur
  // (audit #9 : sans ça, le slug restait verrouillé à vie sur l'uid supprimé, et
  // personne — pas même l'utilisateur re-créé — ne pouvait le reprendre).
  try {
    const slugs = await db.collection('organizer_slugs').where('organizerId', '==', uid).get()
    await Promise.allSettled(slugs.docs.map(d => d.ref.delete()))
  } catch {}

  // ── 7.5 Réconcilier le registre anti-fraude tickets/ (audit #4/#12/#13) : sièges
  // de table hébergés/détenus par le compte supprimé sur l'événement d'un AUTRE
  // organisateur (non couverts par la garde événements ci-dessus, qui ne vise que
  // les events DE l'utilisateur). Sinon ces sièges restent « détenus par un
  // fantôme » — gelés, potentiellement scannables.
  try {
    const [asHolder, asHost] = await Promise.all([
      db.collection('tickets').where('userId', '==', uid).get(),
      db.collection('tickets').where('hostUid', '==', uid).get(),
    ])
    const writes = []
    // (a) Compte supprimé = HÔTE d'une table → toute la table est orpheline (plus
    // d'hôte pour gérer) : ses sièges sont ANNULÉS (non scannables).
    for (const d of asHost.docs) {
      if (d.data().cancelled !== true) {
        writes.push({ ref: d.ref, data: { cancelled: true, cancelledAt: Date.now(), cancelReason: 'host_account_deleted' } })
      }
    }
    // (b) Compte supprimé = TITULAIRE d'un siège d'invité (tableId + hôte différent
    // et toujours présent) → on REND le siège à l'hôte pour qu'il puisse le
    // réattribuer. On ROTATE le nonce d'entrée #79 (entryNonce) : c'est un second
    // chemin de réattribution, comme assign/revoke. Sans ça, l'ancien nonce N1
    // (écrit à l'attribution, conservé par le merge) laisserait l'invité SUPPRIMÉ
    // forger un QR et entrer (fraude), ET verrouillerait l'HÔTE dont la copie n'a
    // pas de nonce (son QR serait refusé au scan). seatVersion seul ne suffit pas :
    // il est signé avec un secret du bundle public → falsifiable. On propage donc
    // le nouveau nonce + seatVersion dans le carnet de l'hôte (plus bas).
    const hostSeatPatches = {} // hostUid -> [{ ticketCode, seatVersion, entryNonce }]
    for (const d of asHolder.docs) {
      const t = d.data()
      if (t.tableId && t.hostUid && String(t.hostUid) !== uid && t.cancelled !== true) {
        const newSeatVersion = (Number(t.seatVersion) || 0) + 1
        const entryNonce = randomBytes(12).toString('hex')
        writes.push({ ref: d.ref, data: { userId: t.hostUid, assignedTo: null, assignedName: null, seatVersion: newSeatVersion, entryNonce } })
        const key = String(t.hostUid)
        ;(hostSeatPatches[key] = hostSeatPatches[key] || []).push({ ticketCode: d.id, seatVersion: newSeatVersion, entryNonce })
      }
    }
    for (let i = 0; i < writes.length; i += 450) {
      const batch = db.batch()
      writes.slice(i, i + 450).forEach(w => batch.set(w.ref, w.data, { merge: true }))
      await batch.commit()
    }
    // Propager le nouveau nonce + seatVersion dans le carnet user_bookings/{hôte}
    // (sa copie de gestion du siège) pour que SON QR régénéré porte le nonce à jour
    // → sinon son entrée serait refusée. Transaction par hôte (lecture-modif-écriture
    // de l'array items). L'hôte survit (hostUid !== uid supprimé) → jamais de
    // résurrection du compte purgé.
    for (const key of Object.keys(hostSeatPatches)) {
      const patches = hostSeatPatches[key]
      try {
        const bRef = db.collection('user_bookings').doc(key)
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(bRef)
          if (!snap.exists) return
          const items = Array.isArray(snap.data().items) ? snap.data().items : []
          let changed = false
          const next = items.map(it => {
            const p = patches.find(x => String(x.ticketCode) === String(it.ticketCode))
            if (!p) return it
            changed = true
            const merged = { ...it, userId: key, assignedTo: null, assignedName: null, seatVersion: p.seatVersion, entryNonce: p.entryNonce }
            delete merged.token
            return merged
          })
          if (changed) tx.set(bRef, { items: next, updatedAt: Date.now() }, { merge: true })
        })
      } catch (e) { console.warn('[admin-delete-account] maj carnet hôte (nonce #79) échouée:', e.message) }
    }
  } catch (e) { console.error('[admin-delete-account] réconciliation registre tickets échouée:', e.message) }

  // ── 8. Firestore — retirer le membre supprimé des conversations (audit #18) :
  // sinon il reste « fantôme » dans les groupes ; et si un groupe se retrouve SANS
  // admin, le promouvoir au membre restant le plus ancien (sinon groupe ingérable).
  try {
    const convs = await db.collection('conversations').where('participantIds', 'array-contains', uid).get()
    for (const c of convs.docs) {
      const data = c.data()
      const participantIds = (Array.isArray(data.participantIds) ? data.participantIds : []).filter(id => id !== uid)
      const members = Array.isArray(data.members) ? data.members.filter(m => String(m.userId || m.id || '') !== uid) : undefined
      let adminIds = (Array.isArray(data.adminIds) ? data.adminIds : []).filter(id => id !== uid)
      if (data.type === 'group' && adminIds.length === 0 && participantIds.length > 0) {
        adminIds = [participantIds[0]]
      }
      await c.ref.set({
        participantIds, adminIds,
        ...(members !== undefined ? { members } : {}),
        updatedAt: Date.now(),
      }, { merge: true }).catch(() => {})
    }
  } catch {}

  console.log(`[admin-delete-account] ${caller.email} a supprimé ${uid} (${deletedEmail || 'email inconnu'}) — auth:${authDeleted} firestore:${firestoreDeleted} apps:${applicationsDeleted}`)
  return res.status(200).json({ ok: true, authDeleted, deletedEmail, billing, firestoreDeleted, applicationsDeleted })
}

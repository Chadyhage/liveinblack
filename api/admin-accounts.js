// Actions admin sur les COMPTES — la couche Firebase Auth que le panneau ne
// pouvait pas toucher. Un compte vit dans 3 couches (Auth, Firestore,
// localStorage) : avant cet endpoint, « vérifier un email », « suspendre » ou
// « modifier l'email » n'écrivaient que Firestore/localStorage → l'utilisateur
// restait bloqué à la connexion (Auth fait foi) et le panneau MENTAIT.
//
// POST { action, ... } — réservé super-admin (env) ou compte agent (Firestore).
//   auth_status        { uids: [] }            → vérité Auth par uid (emailVerified, disabled…)
//   verify_email       { uid }                 → marque l'email vérifié DANS AUTH + miroir Firestore
//   send_verification  { uid }                 → renvoie le lien de vérification (Resend, brandé)
//   set_disabled       { uid, disabled }       → suspend/réactive la CONNEXION (Auth) + statut Firestore
//   update_email       { uid, email }          → change l'email de CONNEXION (Auth) + miroir Firestore
import { getAuth } from 'firebase-admin/auth'
import { requireAuth } from '../lib/verifyAuth.js'
import { getDb, FieldValue } from '../lib/firebaseAdmin.js'
import { isAdminCaller, isSuperAdminEmail } from '../lib/adminGuard.js'
import { emailVerificationEmail } from '../lib/email-templates.js'

const SITE = process.env.PUBLIC_SITE_URL || 'https://liveinblack.com'

function authSnapshot(u) {
  return {
    uid: u.uid,
    email: u.email || null,
    emailVerified: u.emailVerified === true,
    disabled: u.disabled === true,
    createdAt: u.metadata?.creationTime || null,
    lastLoginAt: u.metadata?.lastSignInTime || null,
    providers: (u.providerData || []).map(p => p.providerId),
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })

  const caller = await requireAuth(req, res)
  if (!caller) return

  const db = getDb()
  if (!(await isAdminCaller(db, caller))) {
    return res.status(403).json({ error: 'forbidden', message: 'Réservé aux administrateurs.' })
  }

  const { action, uid, uids, disabled, email } = req.body || {}
  const auth = getAuth()

  try {
    switch (action) {
      // ── Vérité Firebase Auth pour le panneau ────────────────────────────────
      // getUsers plafonne à 100 identifiants : on BOUCLE par paquets au lieu de
      // tronquer — un uid absent de la réponse était interprété « n'existe pas
      // dans Auth » par les nettoyages, qui supprimaient alors de VRAIS comptes.
      case 'auth_status': {
        const list = [...new Set((Array.isArray(uids) ? uids : [uid]).filter(u => typeof u === 'string' && u))].slice(0, 1000)
        if (!list.length) return res.status(400).json({ error: 'missing_uids' })
        const statuses = {}
        for (let i = 0; i < list.length; i += 100) {
          const chunk = list.slice(i, i + 100)
          const result = await auth.getUsers(chunk.map(u => ({ uid: u })))
          result.users.forEach(u => { statuses[u.uid] = authSnapshot(u) })
          result.notFound.forEach(id => { if (id.uid) statuses[id.uid] = { uid: id.uid, missing: true } })
        }
        return res.status(200).json({ ok: true, statuses, complete: list.length === (Array.isArray(uids) ? new Set(uids.filter(Boolean)).size : 1) })
      }

      // ── Marquer l'email vérifié — DANS AUTH (débloque la connexion) ─────────
      case 'verify_email': {
        if (!uid) return res.status(400).json({ error: 'missing_uid' })
        const user = await auth.updateUser(uid, { emailVerified: true })
        await db.doc(`users/${uid}`).set({
          emailVerified: true, emailVerificationRequired: false, _syncedAt: Date.now(),
        }, { merge: true }).catch(() => {})
        console.log(`[admin-accounts] ${caller.email} a vérifié l'email de ${uid} (${user.email || '?'})`)
        return res.status(200).json({ ok: true, status: authSnapshot(user) })
      }

      // ── Renvoyer l'email de vérification (lien Admin SDK + Resend brandé) ───
      case 'send_verification': {
        if (!uid) return res.status(400).json({ error: 'missing_uid' })
        const user = await auth.getUser(uid)
        if (!user.email) return res.status(400).json({ error: 'no_email', message: 'Ce compte n\'a pas d\'email.' })
        if (user.emailVerified) return res.status(200).json({ ok: true, alreadyVerified: true, status: authSnapshot(user) })
        if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
          return res.status(503).json({ error: 'email_not_configured', message: 'Envoi d\'email non configuré (RESEND_API_KEY / EMAIL_FROM).' })
        }
        const link = await auth.generateEmailVerificationLink(user.email, { url: `${SITE}/login` })
        const mail = emailVerificationEmail(link, SITE)
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [user.email], subject: mail.subject, html: mail.html }),
        })
        if (!r.ok) {
          const detail = await r.text().catch(() => '')
          console.error('[admin-accounts] Resend error:', r.status, detail.slice(0, 300))
          return res.status(502).json({ error: 'email_provider_error', message: 'L\'envoi de l\'email a échoué (fournisseur).' })
        }
        return res.status(200).json({ ok: true, sentTo: user.email })
      }

      // ── Suspendre / réactiver la CONNEXION (Auth disabled) + statut miroir ──
      case 'set_disabled': {
        if (!uid || typeof disabled !== 'boolean') return res.status(400).json({ error: 'missing_params' })
        if (uid === caller.uid) return res.status(400).json({ error: 'self_action', message: 'Impossible de suspendre ton propre compte.' })
        const target = await auth.getUser(uid)
        if (isSuperAdminEmail(target.email)) {
          return res.status(403).json({ error: 'protected_account', message: 'Ce compte super-admin est protégé.' })
        }
        const user = await auth.updateUser(uid, { disabled })
        await db.doc(`users/${uid}`).set(disabled
          ? { status: 'banned', bannedAt: Date.now(), _syncedAt: Date.now() }
          : { status: 'active', reactivatedAt: Date.now(), _syncedAt: Date.now() },
        { merge: true }).catch(() => {})
        // Un compte suspendu ne doit pas garder de session ouverte sur ses devices.
        if (disabled) await auth.revokeRefreshTokens(uid).catch(() => {})
        console.log(`[admin-accounts] ${caller.email} a ${disabled ? 'suspendu' : 'réactivé'} ${uid} (${user.email || '?'})`)
        return res.status(200).json({ ok: true, status: authSnapshot(user) })
      }

      // ── Corriger l'email de CONNEXION (typo à l'inscription, etc.) ──────────
      case 'update_email': {
        if (!uid || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return res.status(400).json({ error: 'invalid_email', message: 'Email invalide.' })
        }
        const target = await auth.getUser(uid)
        if (isSuperAdminEmail(target.email)) {
          return res.status(403).json({ error: 'protected_account', message: 'Ce compte super-admin est protégé.' })
        }
        // Un email de la liste super-admin ne s'ATTRIBUE pas non plus : le
        // porter (même non vérifié) donne les pleins pouvoirs dans les règles.
        if (isSuperAdminEmail(email)) {
          return res.status(403).json({ error: 'protected_email', message: 'Cet email est réservé au super-admin.' })
        }
        // Le nouvel email n'est pas prouvé : il repart non vérifié (l'admin peut
        // ensuite « Marquer vérifié » ou « Renvoyer la vérification »).
        const user = await auth.updateUser(uid, { email: String(email).toLowerCase(), emailVerified: false })
        await db.doc(`users/${uid}`).set({
          email: user.email, emailVerified: false, _syncedAt: Date.now(),
        }, { merge: true }).catch(() => {})
        // L'ancien détenteur de la session ne doit pas continuer avec un token
        // qui porte encore l'ancien email.
        await auth.revokeRefreshTokens(uid).catch(() => {})
        console.log(`[admin-accounts] ${caller.email} a changé l'email de ${uid} → ${user.email}`)
        return res.status(200).json({ ok: true, status: authSnapshot(user) })
      }

      // ── Solder à la main UN versement auto XOF EN ÉCHEC (le filet) ──────────
      // event_payouts est server-authoritative (write:false côté règles) : la
      // finalisation manuelle passe donc par ici (Admin SDK). Décrémente les DEUX
      // ledgers en UNE transaction, symétrie exacte avec le cron finalizePaid :
      //  - event_payouts.amountDueXOF → 0, status 'paid' (le cron n'y touche plus) ;
      //  - seller_balances.amountDueXOF -= montant (clampé ≥ 0).
      // Ne solde QUE des enveloppes 'failed' : une enveloppe accumulating/paying
      // est en versement AUTO → la solder ici = double versement. Idempotent
      // (journal déterministe par event).
      case 'mark_payout_paid': {
        const eventId = String(req.body?.eventId || '')
        if (!eventId) return res.status(400).json({ error: 'missing_eventId' })
        const epRef = db.collection('event_payouts').doc(eventId)
        const outcome = await db.runTransaction(async (tx) => {
          const epSnap = await tx.get(epRef)
          if (!epSnap.exists) return { error: 'not_found' }
          const ep = epSnap.data()
          if (ep.status !== 'failed') return { error: 'not_failed', status: ep.status }
          const sellerUid = String(ep.sellerUid || '')
          const amount = Math.max(0, Math.round(Number(ep.amountDueXOF || 0)))
          const logRef = db.collection('payout_logs').doc(`pl_manualevp_${eventId}`)
          const logSnap = await tx.get(logRef)
          if (logSnap.exists) return { error: 'already', amount: 0 }
          if (amount <= 0) {
            tx.set(epRef, { status: 'paid', amountDueXOF: 0, lastPaidAt: Date.now(), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
            return { ok: true, amount: 0 }
          }
          if (sellerUid) {
            const balRef = db.collection('seller_balances').doc(sellerUid)
            const balSnap = await tx.get(balRef)
            const balDue = Math.max(0, Number(balSnap.exists ? balSnap.data().amountDueXOF : 0) || 0)
            tx.set(balRef, { amountDueXOF: Math.max(0, balDue - amount), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
          }
          tx.set(epRef, {
            amountDueXOF: 0, paidXOF: FieldValue.increment(amount),
            status: 'paid', lastPaidAt: Date.now(), updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true })
          tx.set(logRef, {
            sellerUid, amount, currency: 'XOF', eventId, eventName: ep.eventName || '',
            by: caller.uid, byName: caller.email || 'Agent', manual: true, at: Date.now(),
          })
          return { ok: true, amount }
        })
        if (outcome.error === 'not_found') return res.status(404).json({ error: 'not_found', message: 'Enveloppe de versement introuvable.' })
        if (outcome.error === 'not_failed') return res.status(409).json({ error: 'not_failed', message: 'Ce versement est reparti en automatique — plus rien à régler à la main.' })
        if (outcome.error === 'already') return res.status(200).json({ ok: true, alreadyPaid: true, paid: 0 })
        console.log(`[admin-accounts] ${caller.email} a soldé le versement XOF de l'event ${eventId} (${outcome.amount} FCFA)`)
        return res.status(200).json({ ok: true, paid: outcome.amount })
      }

      default:
        return res.status(400).json({ error: 'unknown_action' })
    }
  } catch (e) {
    if (e.code === 'auth/user-not-found') {
      return res.status(404).json({ error: 'user_not_found', message: 'Ce compte n\'existe plus dans Firebase Auth.' })
    }
    if (e.code === 'auth/email-already-exists') {
      return res.status(409).json({ error: 'email_taken', message: 'Cet email est déjà utilisé par un autre compte.' })
    }
    console.error('[admin-accounts] error:', e)
    return res.status(500).json({ error: 'internal', message: e.message || 'Erreur serveur.' })
  }
}

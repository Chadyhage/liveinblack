// Vercel Serverless Function — Emails transactionnels LIVEINBLACK.
// Endpoint : POST /api/send-email  { appId, type }
//
// Pourquoi un endpoint serveur : la clé API d'envoi (Resend) est SECRÈTE et ne
// doit jamais vivre côté client. De plus, on ne fait JAMAIS confiance au client
// pour l'adresse destinataire : on relit le dossier dans Firestore (Admin SDK)
// et on envoie à l'email RÉEL du dossier. Impossible donc d'utiliser ce endpoint
// comme relais de spam vers des adresses arbitraires.
//
// Types supportés (cycle de vie d'un dossier candidat) :
//   application_received      → accusé de réception après soumission
//   application_approved      → dossier validé
//   application_needs_changes → corrections demandées (inclut le message agent)
//   application_rejected      → dossier non retenu (inclut le motif)
//
// type 'new_event_followers' { eventId } : e-mails « nouvel événement » aux
// abonnés de l'organisateur (modèle Shotgun — consentement affiché au moment
// de l'abonnement, désabonnement à tout moment). Voir notifyFollowers() plus bas.
//
// Config requise (variables d'env Vercel) :
//   RESEND_API_KEY   — clé API Resend (https://resend.com)
//   EMAIL_FROM       — ex : "LIVEINBLACK <noreply@liveinblack.com>" (domaine vérifié chez Resend)
//   PUBLIC_SITE_URL  — ex : "https://liveinblack.com" (optionnel, défaut ci-dessous)
//   + FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY (déjà en place)

import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { buildEmail } from '../lib/email-templates.js'

const SITE = process.env.PUBLIC_SITE_URL || 'https://liveinblack.com'

function getDb() {
  if (!getApps().length) {
    if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
      throw new Error('Firebase Admin credentials missing')
    }
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    })
  }
  return getFirestore()
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  // Auth requise : le destinataire est déjà protégé (relu du dossier), mais le
  // DÉCLENCHEMENT ne doit pas être ouvert à des tiers (spam d'emails officiels).
  const { requireAuth } = await import('../lib/verifyAuth.js')
  const caller = await requireAuth(req, res)
  if (!caller) return
  // E-mails « nouvel événement » aux abonnés — flux séparé (pas de dossier).
  if (req.body?.type === 'new_event_followers') return notifyFollowers(req, res, caller)
  // E-mails acheteurs — annulation / report d'un événement (#71).
  if (req.body?.type === 'event_cancelled') return notifyEventBuyers(req, res, caller, 'cancelled')
  if (req.body?.type === 'event_postponed') return notifyEventBuyers(req, res, caller, 'postponed')

  try {
    const { appId, type } = req.body || {}
    if (!appId || !type) return res.status(400).json({ error: 'appId et type requis' })

    // Les emails de DÉCISION (« validé », « refusé », « corrections ») sont des
    // communications officielles : seuls les admins peuvent les déclencher —
    // sinon n'importe quel connecté pouvait envoyer une fausse décision signée
    // noreply@liveinblack.com à n'importe quel candidat. L'accusé de réception
    // (« application_received ») reste ouvert : c'est le CANDIDAT lui-même qui
    // le déclenche en soumettant son dossier (vérifié propriétaire plus bas).
    const DECISION_TYPES = new Set(['application_approved', 'application_needs_changes', 'application_rejected'])
    const { isAdminCaller } = await import('../lib/adminGuard.js')
    const dbGuard = getDb()
    const callerIsAdmin = await isAdminCaller(dbGuard, caller)
    if (DECISION_TYPES.has(String(type)) && !callerIsAdmin) {
      return res.status(403).json({ error: 'forbidden', message: 'Réservé aux administrateurs.' })
    }

    // Email non configuré → on dégrade proprement (l'action agent ne doit pas échouer)
    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
      return res.status(200).json({ ok: false, skipped: 'email-not-configured' })
    }

    const db = getDb()
    // On relit le dossier réel : le destinataire = l'email du dossier (jamais le client)
    const snap = await db.collection('applications').doc(String(appId)).get()
    if (!snap.exists) return res.status(404).json({ error: 'Dossier introuvable' })
    const app = snap.data()
    // Non-admin (accusé de réception) : uniquement pour SON propre dossier.
    if (!callerIsAdmin && String(app.uid || '') !== String(caller.uid)) {
      return res.status(403).json({ error: 'forbidden', message: 'Ce dossier ne t\'appartient pas.' })
    }
    const to = app.email
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return res.status(200).json({ ok: false, skipped: 'no-valid-recipient' })
    }

    const email = buildEmail(type, app, SITE)
    if (!email) return res.status(400).json({ error: 'type inconnu' })

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [to],
        subject: email.subject,
        html: email.html,
      }),
    })

    if (!r.ok) {
      const detail = await r.text().catch(() => '')
      console.error('[/api/send-email] Resend error:', r.status, detail.slice(0, 300))
      return res.status(502).json({ error: 'email_provider_error', status: r.status, detail: detail.slice(0, 300) })
    }

    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('[/api/send-email] error:', err)
    return res.status(500).json({ error: err.message || 'Internal error' })
  }
}

// ─── E-mails « nouvel événement » aux abonnés d'un organisateur ───────────────
// POST /api/send-email { type:'new_event_followers', eventId }
// Appelé (fire-and-forget) par MesEvenementsPage à la première publication.
//
// Sécurité / vie privée :
//  - seul l'ORGANISATEUR de l'événement peut déclencher l'envoi ;
//  - destinataires = index organizer_subscribers/{orgId}__{uid} (écrit par
//    chaque abonné, jamais lisible par l'organisateur — règles Firestore) ;
//  - l'adresse e-mail est résolue depuis Firebase AUTH côté serveur (jamais un
//    champ écrit par le client) → pas de relais de spam possible ;
//  - un e-mail PAR destinataire (jamais de liste en copie) ;
//  - idempotent : flag event_notifications/{eventId} posé en transaction AVANT
//    l'envoi — un double appel n'envoie jamais deux fois (on préfère « e-mail
//    manqué » à « e-mail en double »).
//
// Limite V1 assumée : un événement programmé (publishAt futur) n'envoie rien à
// l'heure de la publication différée — e-mails sur publication immédiate only.
async function notifyFollowers(req, res, caller) {
  const eventId = String(req.body?.eventId || '')
  if (!eventId) return res.status(400).json({ error: 'eventId requis' })
  try {
    const db = getDb()
    const evSnap = await db.collection('events').doc(eventId).get()
    if (!evSnap.exists) return res.status(404).json({ error: 'Événement introuvable' })
    const event = evSnap.data()
    if (event.organizerId !== caller.uid && event.createdBy !== caller.uid) {
      return res.status(403).json({ error: "Seul l'organisateur de cet événement peut notifier ses abonnés." })
    }
    if (event.isPrivate) return res.status(200).json({ ok: true, skipped: 'private-event' })
    if (event.cancelled) return res.status(200).json({ ok: true, skipped: 'cancelled' })
    if (event.publishAt && new Date(event.publishAt).getTime() > Date.now()) {
      return res.status(200).json({ ok: true, skipped: 'scheduled' })
    }
    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
      return res.status(200).json({ ok: false, skipped: 'email-not-configured' })
    }

    const { FieldValue } = await import('firebase-admin/firestore')
    const flagRef = db.collection('event_notifications').doc(eventId)
    let firstCall = false
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(flagRef)
      if (snap.exists && snap.data().emailedAt) return
      tx.set(flagRef, { eventId, organizerId: caller.uid, emailedAt: FieldValue.serverTimestamp() }, { merge: true })
      firstCall = true
    })
    if (!firstCall) return res.status(200).json({ ok: true, already: true })

    const subsSnap = await db.collection('organizer_subscribers')
      .where('organizerId', '==', caller.uid)
      .where('newEventEmail', '==', true)
      .get()
    const uids = [...new Set(subsSnap.docs.map(d => String(d.data().uid || '')).filter(u => u && u !== caller.uid))]
    if (!uids.length) {
      await flagRef.set({ sentCount: 0 }, { merge: true })
      return res.status(200).json({ ok: true, sent: 0 })
    }

    const { getAuth } = await import('firebase-admin/auth')
    const auth = getAuth()
    const emails = []
    for (let i = 0; i < uids.length; i += 100) {
      const result = await auth.getUsers(uids.slice(i, i + 100).map(uid => ({ uid })))
      for (const u of result.users) {
        if (u.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u.email)) emails.push(u.email)
      }
    }
    if (!emails.length) {
      await flagRef.set({ sentCount: 0 }, { merge: true })
      return res.status(200).json({ ok: true, sent: 0 })
    }

    const { newEventEmail } = await import('../lib/email-templates.js')
    const organizerName = event.organizerName || 'Un organisateur que tu suis'
    const email = newEventEmail({ ...event, id: eventId }, organizerName, SITE)
    let sent = 0
    for (let i = 0; i < emails.length; i += 100) {
      const payload = emails.slice(i, i + 100).map(to => ({
        from: process.env.EMAIL_FROM,
        to: [to],
        subject: email.subject,
        html: email.html,
      }))
      const r = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (r.ok) sent += payload.length
      else {
        const detail = await r.text().catch(() => '')
        console.error('[/api/send-email followers] Resend batch error:', r.status, detail.slice(0, 300))
      }
    }

    await flagRef.set({ sentCount: sent, subscriberCount: uids.length }, { merge: true })
    return res.status(200).json({ ok: true, sent, subscribers: uids.length })
  } catch (err) {
    console.error('[/api/send-email followers] error:', err)
    return res.status(500).json({ error: err.message || 'Internal error' })
  }
}

// ─── E-mails acheteurs — ANNULATION / REPORT d'un événement (#71) ─────────────
// POST /api/send-email { type:'event_cancelled' | 'event_postponed', eventId }
// Déclenché (fire-and-forget) par MesEvenementsPage après cancel_event /
// postpone_event réussi. Sécurité/vie privée IDENTIQUES à notifyFollowers :
// organisateur (ou admin) only, adresses résolues depuis Firebase AUTH (jamais un
// champ client → pas de relais de spam), un e-mail PAR destinataire.
// Idempotence : annulation = une seule fois ; report = une fois PAR nouvelle date
// (un 2e report vers une autre date renotifie).
async function notifyEventBuyers(req, res, caller, kind) {
  const eventId = String(req.body?.eventId || '')
  if (!eventId) return res.status(400).json({ error: 'eventId requis' })
  try {
    const db = getDb()
    const evSnap = await db.collection('events').doc(eventId).get()
    if (!evSnap.exists) return res.status(404).json({ error: 'Événement introuvable' })
    const event = evSnap.data()
    const isOwner = event.organizerId === caller.uid || event.createdBy === caller.uid
    const { isAdminCaller } = await import('../lib/adminGuard.js')
    if (!isOwner && !(await isAdminCaller(db, caller))) {
      return res.status(403).json({ error: "Seul l'organisateur (ou un admin) peut notifier les acheteurs." })
    }
    // Cohérence : n'annonce une annulation que si l'event est réellement annulé.
    if (kind === 'cancelled' && event.cancelled !== true) {
      return res.status(409).json({ error: "L'événement n'est pas marqué annulé." })
    }
    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
      return res.status(200).json({ ok: false, skipped: 'email-not-configured' })
    }

    const { FieldValue } = await import('firebase-admin/firestore')
    const flagRef = db.collection('event_notifications').doc(eventId)
    const postponeKey = kind === 'postponed' ? String(event.date || '') : ''
    let firstCall = false
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(flagRef)
      const d = snap.exists ? snap.data() : {}
      if (kind === 'cancelled' && d.cancelledEmailedAt) return
      if (kind === 'postponed' && postponeKey && d.postponedEmailedFor === postponeKey) return
      tx.set(flagRef, kind === 'cancelled'
        ? { eventId, cancelledEmailedAt: FieldValue.serverTimestamp() }
        : { eventId, postponedEmailedFor: postponeKey, postponedEmailedAt: FieldValue.serverTimestamp() },
        { merge: true })
      firstCall = true
    })
    if (!firstCall) return res.status(200).json({ ok: true, already: true })

    // Destinataires = titulaires de billets NON révoqués de cet événement (payants
    // ET invitations : tous perdent leur place / gardent leur billet reporté).
    const tSnap = await db.collection('tickets').where('eventId', '==', eventId).get()
    const uids = [...new Set(tSnap.docs.map(d => d.data()).filter(t => t && t.revoked !== true).map(t => String(t.userId || '')).filter(Boolean))]
    if (!uids.length) return res.status(200).json({ ok: true, sent: 0 })

    const { getAuth } = await import('firebase-admin/auth')
    const auth = getAuth()
    const emails = []
    for (let i = 0; i < uids.length; i += 100) {
      const result = await auth.getUsers(uids.slice(i, i + 100).map(uid => ({ uid })))
      for (const u of result.users) {
        if (u.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u.email)) emails.push(u.email)
      }
    }
    if (!emails.length) return res.status(200).json({ ok: true, sent: 0 })

    const templates = await import('../lib/email-templates.js')
    const organizerName = event.organizerName || "L'organisateur"
    const fmtWhen = (d, t) => [d, t].filter(Boolean).join(' · ')
    let email
    if (kind === 'cancelled') {
      const cur = String(event.currency || '').toUpperCase() === 'XOF' ? 'XOF' : 'EUR'
      const refundNote = cur === 'XOF'
        ? 'Ton remboursement (mobile money) est en cours de traitement — tu le recevras sous quelques jours.'
        : 'Tu es intégralement remboursé sur ta carte, automatiquement, sous quelques jours ouvrés.'
      email = templates.eventCancelledEmail({ ...event, id: eventId }, { organizerName, refundNote }, SITE)
    } else {
      const previousWhen = event.postponedFrom ? fmtWhen(event.postponedFrom.date, event.postponedFrom.time) : ''
      const newWhen = fmtWhen(event.dateDisplay || event.date, event.time)
      email = templates.eventPostponedEmail({ ...event, id: eventId }, { organizerName, previousWhen, newWhen }, SITE)
    }

    let sent = 0
    for (let i = 0; i < emails.length; i += 100) {
      const payload = emails.slice(i, i + 100).map(to => ({ from: process.env.EMAIL_FROM, to: [to], subject: email.subject, html: email.html }))
      const r = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (r.ok) sent += payload.length
      else { const detail = await r.text().catch(() => ''); console.error('[/api/send-email buyers] Resend error:', r.status, detail.slice(0, 300)) }
    }
    await flagRef.set(kind === 'cancelled' ? { cancelledSentCount: sent } : { postponedSentCount: sent }, { merge: true })
    return res.status(200).json({ ok: true, sent, recipients: uids.length })
  } catch (err) {
    console.error('[/api/send-email buyers] error:', err)
    return res.status(500).json({ error: err.message || 'Internal error' })
  }
}

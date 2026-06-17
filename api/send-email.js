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
  // Diagnostic léger : présence (booléen) des variables d'env requises.
  // Ne révèle JAMAIS les valeurs — juste si elles sont configurées côté Vercel.
  if (req.method === 'GET') {
    return res.status(200).json({
      marker: 'diag-v5',
      env: {
        RESEND_API_KEY: !!process.env.RESEND_API_KEY,
        EMAIL_FROM: !!process.env.EMAIL_FROM,
        EMAIL_FROM_value_starts: (process.env.EMAIL_FROM || '').slice(0, 14) || null,
        FIREBASE_PROJECT_ID: !!process.env.FIREBASE_PROJECT_ID,
        FIREBASE_CLIENT_EMAIL: !!process.env.FIREBASE_CLIENT_EMAIL,
        FIREBASE_PRIVATE_KEY: !!process.env.FIREBASE_PRIVATE_KEY,
      },
    })
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  try {
    const { appId, type } = req.body || {}
    if (!appId || !type) return res.status(400).json({ error: 'appId et type requis' })

    // Email non configuré → on dégrade proprement (l'action agent ne doit pas échouer)
    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
      return res.status(200).json({ ok: false, skipped: 'email-not-configured' })
    }

    const db = getDb()
    // On relit le dossier réel : le destinataire = l'email du dossier (jamais le client)
    const snap = await db.collection('applications').doc(String(appId)).get()
    if (!snap.exists) return res.status(404).json({ error: 'Dossier introuvable' })
    const app = snap.data()
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

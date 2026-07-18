// Vercel Serverless Function — Réinitialisation de mot de passe BRANDÉE.
// Endpoint : POST /api/send-password-reset  { email }
//
// Pourquoi un endpoint dédié : le mail de réinitialisation Firebase par défaut est
// envoyé depuis noreply@<project>.firebaseapp.com → il finit très souvent en spam
// (domaine expéditeur non brandé). Ici on génère le lien de réinitialisation via
// l'Admin SDK, puis on l'envoie depuis noreply@liveinblack.com (domaine vérifié chez
// Resend) → l'email arrive de façon fiable et cohérente avec le reste des envois.
//
// SÉCURITÉ (anti-énumération) : on ne révèle JAMAIS au client si l'email correspond
// à un compte. On renvoie toujours { ok: true }, qu'un mail soit parti ou non. C'est
// aussi pour ça que l'UI affiche un message générique (« si cet email est associé… »).
// Exception à la règle « tout /api → requireAuth » : impossible ici (l'utilisateur est
// déconnecté). Le garde-fou est que le lien part vers l'email RÉEL du compte Firebase.
//
// Config requise (variables d'env Vercel) :
//   RESEND_API_KEY, EMAIL_FROM, PUBLIC_SITE_URL (optionnel)
//   + FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY

import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { passwordResetEmail } from '../lib/email-templates.js'

const SITE = process.env.PUBLIC_SITE_URL || 'https://liveinblack.com'

function ensureAdmin() {
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
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const { email } = req.body || {}
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'email invalide' })
  }
  // Email non configuré → on dégrade proprement (le client retombera sur l'envoi
  // Firebase côté client). On reste générique.
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    return res.status(503).json({ error: 'email-not-configured' })
  }
  try {
    ensureAdmin()
    let link
    try {
      link = await getAuth().generatePasswordResetLink(email)
    } catch (e) {
      // Compte inexistant / désactivé → on NE révèle rien : succès générique sans envoi.
      if (e.code === 'auth/user-not-found' || e.code === 'auth/email-not-found') {
        return res.status(200).json({ ok: true })
      }
      throw e
    }
    const mail = passwordResetEmail(link, SITE)
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [email], subject: mail.subject, html: mail.html }),
    })
    if (!r.ok) {
      const detail = await r.text().catch(() => '')
      console.error('[/api/send-password-reset] Resend error:', r.status, detail.slice(0, 300))
      return res.status(502).json({ error: 'email_provider_error' })
    }
    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('[/api/send-password-reset] error:', err)
    return res.status(500).json({ error: err.message || 'Internal error' })
  }
}

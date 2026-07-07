// Cron quotidien — abonnements prestataires FCFA (renouvellement manuel).
// NE PRÉLÈVE JAMAIS d'argent. Il se contente de :
//   1. envoyer les rappels (J-7 / J-3 / J-1 / jour J / grâce / masqué),
//   2. mettre à jour le statut dérivé des dates,
//   3. masquer le profil (subscriptionActive=false) une fois la grâce terminée.
// Déclenché par Vercel Cron (voir vercel.json). Sécurisé par CRON_SECRET :
// Vercel ajoute automatiquement `Authorization: Bearer $CRON_SECRET`.

import { getDb, FieldValue } from '../lib/firebaseAdmin.js'
import { deriveSubStatus, dueReminders, cycleKey, PROVIDER_SUB } from '../lib/providerSubscription.js'

const REMINDER = {
  j7:     { type: 'sub_expiring', title: 'Ton abonnement expire dans 7 jours', body: 'Renouvelle-le pour garder ton profil visible sur LIVEINBLACK.' },
  j3:     { type: 'sub_expiring', title: 'Plus que 3 jours', body: 'Ton abonnement prestataire expire dans 3 jours. Pense à le renouveler.' },
  j1:     { type: 'sub_expiring', title: 'Ton abonnement expire demain', body: 'Renouvelle-le pour garder ton profil visible.' },
  j0:     { type: 'sub_expiring', title: 'Ton abonnement expire aujourd\'hui', body: 'Renouvelle-le pour éviter que ton profil soit masqué.' },
  grace:  { type: 'sub_grace',   title: 'Abonnement expiré — période de grâce', body: 'Ton profil sera masqué bientôt si tu ne renouvelles pas.' },
  hidden: { type: 'sub_hidden',  title: 'Ton profil n\'est plus visible', body: 'Renouvelle ton abonnement pour remettre ton profil en ligne.' },
}

async function pushNotif(db, uid, { type, title, body }) {
  try {
    const notif = {
      id: 'notif-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      type, title, body, data: {}, read: false, createdAt: Date.now(),
    }
    const ref = db.collection('notifications').doc(String(uid))
    const cur = await ref.get()
    const items = cur.exists ? (cur.data().items || []) : []
    await ref.set({ items: [notif, ...items].slice(0, 50), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
  } catch (e) {
    console.warn('[cron-subs] notif échouée', uid, e.message)
  }
}

export default async function handler(req, res) {
  // Sécurité : si CRON_SECRET est posé, on exige le header que Vercel Cron envoie.
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  if (!secret) console.warn('[cron-subs] CRON_SECRET absent — endpoint non protégé, à configurer.')

  try {
    const db = getDb()
    const now = Date.now()
    // Seuls les prestataires avec une fenêtre d'abonnement FCFA posée.
    const snap = await db.collection('providers').where('subscriptionExpiresAt', '>', 0).get()

    let reminders = 0, hidden = 0, scanned = 0
    for (const doc of snap.docs) {
      scanned++
      const prov = doc.data()
      const cycle = cycleKey(prov)
      const prevSent = (prov.subReminders && prov.subReminders.cycle === cycle) ? (prov.subReminders.sent || {}) : {}
      const due = dueReminders(prov, now, prevSent)
      const status = deriveSubStatus(prov, now)

      const patch = { subscriptionStatus: status }
      let changed = false

      // Masquage effectif une fois la grâce terminée (le gate lit subscriptionActive).
      // On ne réactive JAMAIS ici : la réactivation vient d'un paiement (webhook).
      if (status === 'expired' && prov.subscriptionActive === true && prov.adminSuspended !== true) {
        patch.subscriptionActive = false
        changed = true
      }

      if (due.length) {
        const sent = { ...prevSent }
        for (const key of due) {
          const r = REMINDER[key]
          if (!r) continue
          await pushNotif(db, doc.id, r)
          sent[key] = now
          reminders++
          if (key === 'hidden') hidden++
        }
        patch.subReminders = { cycle, sent }
        changed = true
      } else if (prov.subscriptionStatus !== status) {
        changed = true // le statut a évolué même sans rappel dû
      }

      if (changed) {
        patch._syncedAt = now
        await doc.ref.set(patch, { merge: true })
      }
    }

    console.log(`[cron-subs] scanned=${scanned} reminders=${reminders} hidden=${hidden}`)
    return res.status(200).json({ ok: true, scanned, reminders, hidden })
  } catch (err) {
    console.error('[cron-subs] error:', err)
    return res.status(500).json({ error: err.message || 'cron error' })
  }
}

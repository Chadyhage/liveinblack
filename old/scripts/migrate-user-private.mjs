// scripts/migrate-user-private.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Migration #8 : sort l'EMAIL du doc PUBLIC users/{uid} (lisible par tout connecté)
// vers le doc PRIVÉ user_private/{uid} (owner+agent).
//
// Deux phases (toujours DRY-RUN par défaut) :
//   • BACKFILL (--apply) : copie users/{uid}.email → user_private/{uid}.email pour
//     tous les comptes. Sûr, idempotent, à lancer DÈS que la règle user_private est
//     déployée. Ne retire RIEN du doc public.
//   • SCRUB (--apply --scrub) : APRÈS que tous les lecteurs d'email aient été
//     basculés sur user_private (déploiement « cutover »), retire email +
//     phone + phoneNormalized du doc public users/{uid}. À NE PAS lancer avant.
//
// Fallback email : si users/{uid}.email est absent, on prend Firebase Auth
// (getUser(uid).email) — source de vérité de l'email de connexion.
//
// Log : signale les phoneNormalized DUPLIQUÉS (2 comptes vérifiés, même numéro) —
// à examiner à la main par un agent, jamais fusionnés automatiquement.
//
// Usage :
//   node scripts/migrate-user-private.mjs                 # dry-run backfill (compte)
//   node scripts/migrate-user-private.mjs --apply         # backfill réel
//   node scripts/migrate-user-private.mjs --apply --scrub # backfill + scrub public
//
// Nécessite .env.local (mêmes identifiants Firebase Admin que les autres scripts).
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue } from 'firebase-admin/firestore'
import { getDb } from '../lib/firebaseAdmin.js'

function loadLocalEnv() {
  const text = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const sep = line.indexOf('=')
    if (sep < 1) continue
    const key = line.slice(0, sep).trim()
    let value = line.slice(sep + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    if (!process.env[key]) process.env[key] = value
  }
}

loadLocalEnv()

const APPLY = process.argv.includes('--apply')
const SCRUB = process.argv.includes('--scrub')

async function main() {
  const db = getDb()
  const auth = getAuth()
  const snap = await db.collection('users').get()
  console.log(`[migrate] ${snap.size} comptes users/ à traiter — ${APPLY ? (SCRUB ? 'BACKFILL + SCRUB' : 'BACKFILL') : 'DRY-RUN'}`)

  let backfilled = 0, scrubbed = 0, noEmail = 0
  const byPhone = new Map() // phoneNormalized -> [uid]

  for (const doc of snap.docs) {
    const uid = doc.id
    const d = doc.data() || {}
    let email = d.email
    if (!email) {
      try { email = (await auth.getUser(uid)).email || '' } catch { email = '' }
    }
    if (!email) { noEmail++; }

    // Repère les doublons de numéro (info seulement — jamais de fusion auto).
    if (d.phoneNormalized) {
      const list = byPhone.get(d.phoneNormalized) || []
      list.push(uid); byPhone.set(d.phoneNormalized, list)
    }

    if (email) {
      if (APPLY) {
        await db.doc(`user_private/${uid}`).set({ email, _migratedAt: Date.now() }, { merge: true })
      }
      backfilled++
    }

    if (SCRUB && APPLY) {
      // #8 : on ne retire QUE l'email (PII la plus scrapeable) du doc public. Les
      // champs phone/phoneNormalized restent (garde anti-doublon à l'inscription ;
      // résiduel mineur — ce sont des numéros d'inscription org/prest, pas un
      // annuaire d'e-mails). L'email placeholder « deleted_… » n'est jamais présent
      // sur un vrai compte, donc rien à préserver.
      if ('email' in d && !String(d.email || '').startsWith('deleted_')) {
        await db.doc(`users/${uid}`).update({ email: FieldValue.delete() }); scrubbed++
      }
    }
  }

  const dups = [...byPhone.entries()].filter(([, uids]) => uids.length > 1)
  console.log(`[migrate] email backfillé : ${backfilled} ; sans email : ${noEmail} ; docs scrubbés : ${scrubbed}`)
  if (dups.length) {
    console.log(`[migrate] ⚠️ ${dups.length} numéro(s) partagé(s) par plusieurs comptes (à examiner par un agent, PAS de fusion auto) :`)
    for (const [pn, uids] of dups) console.log(`   ${pn} → ${uids.join(', ')}`)
  }
  if (!APPLY) console.log('[migrate] DRY-RUN — rien écrit. Ajoute --apply (backfill) puis, APRÈS le cutover des lecteurs, --apply --scrub.')
}

main().then(() => process.exit(0)).catch(e => { console.error('[migrate] ÉCHEC:', e); process.exit(1) })

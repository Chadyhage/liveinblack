// Versement AUTOMATIQUE des recettes aux organisateurs — modèle « à la fin de
// l'événement » (décision produit 2026-07-10) :
//   - chaque vente FedaPay crédite event_payouts/{eventId}.amountDueXOF
//     (webhook, transaction settle) ;
//   - le cron quotidien appelle processEventPayouts : événement terminé
//     (+ marge END_BUFFER_MS) → Payout FedaPay vers le mobile money de
//     l'organisateur (users/{uid}.payoutMomo) ;
//   - l'argent ne part JAMAIS avant la fin de la soirée : si l'événement est
//     annulé, il est encore là pour rembourser les clients ;
//   - tout échec (numéro absent, API, opérateur) bascule en payment_alert
//     manual_review → l'onglet Reversements admin n'est plus que le FILET.
//
// Idempotence / crash-safety :
//   claim transactionnel (accumulating → paying, montant figé) → appel FedaPay
//   → finalisation transactionnelle (paid + décrément ledger + payout_logs).
//   Cron interrompu entre les deux : le doc garde payoutId → au run suivant on
//   RELIT le payout chez FedaPay (getPayout) au lieu d'en créer un second.

import { FieldValue } from './firebaseAdmin.js'
import { isFedapayConfigured, createPayout, startPayout, getPayout } from './fedapay.js'
import { momoCountryFromRegionName, regionByMomoCountry } from '../src/data/regions.js'

// Marge après l'heure de fin avant d'envoyer l'argent (scans tardifs, litiges à chaud).
const END_BUFFER_MS = 6 * 60 * 60 * 1000
// Un claim 'paying' sans payoutId plus vieux que ça = création jamais partie → on relâche.
const STALE_CLAIM_MS = 2 * 60 * 60 * 1000
// Un payout FedaPay encore ni réussi ni échoué après ça = revue manuelle.
const STUCK_PAYOUT_MS = 48 * 60 * 60 * 1000

const PAYOUT_OK = new Set(['sent', 'processed', 'success', 'transferred', 'approved', 'completed'])
const PAYOUT_KO = new Set(['failed', 'declined', 'canceled', 'cancelled', 'expired'])

// Fin réelle de l'événement en ms — gère les soirées qui finissent après minuit
// (endTime < heure de début ⇒ le lendemain).
export function eventEndMs(ev) {
  if (!ev?.date) return null
  try {
    const end = String(ev.endTime || ev.time || '23:59')
    const start = String(ev.time || '00:00')
    const [eh, em] = end.split(':').map(Number)
    const [sh, sm] = start.split(':').map(Number)
    const d = new Date(`${ev.date}T00:00:00`)
    if (Number.isNaN(d.getTime())) return null
    d.setHours(eh || 0, em || 0, 0, 0)
    if ((eh * 60 + (em || 0)) < (sh * 60 + (sm || 0))) d.setDate(d.getDate() + 1)
    return d.getTime()
  } catch { return null }
}

// Indicatif international → code pays FedaPay (zone UEMOA / XOF). Doit rester
// aligné avec src/data/regions.js (champ momoCountry).
const DIAL_TO_MOMO_COUNTRY = [
  ['+229', 'bj'], // Bénin
  ['+228', 'tg'], // Togo
  ['+225', 'ci'], // Côte d'Ivoire
  ['+221', 'sn'], // Sénégal
  ['+226', 'bf'], // Burkina Faso
  ['+223', 'ml'], // Mali
  ['+227', 'ne'], // Niger
  ['+245', 'gw'], // Guinée-Bissau
]

function cleanMomoEntry(raw, fallbackCountry) {
  const number = String(raw?.number || '').replace(/[\s.-]/g, '')
  if (!number) return null
  const country = raw?.country
    || (DIAL_TO_MOMO_COUNTRY.find(([dial]) => number.startsWith(dial))?.[1])
    || fallbackCountry || null
  if (!country) return null
  return { number, country }
}

// Numéro mobile money de versement pour le PAYS d'un événement. Un organisateur
// peut encaisser dans PLUSIEURS pays UEMOA → un numéro par pays dans
// users/{uid}.payoutMomos = { tg:{number,country}, bj:{…}, … }. On paie TOUJOURS
// sur le numéro du pays de l'événement (un event à Cotonou → numéro béninois).
// Rétro-compat : l'ancien champ unique payoutMomo est retenu SEULEMENT si son
// pays correspond à celui de l'événement (sinon on paierait sur le mauvais pays).
export function parsePayoutMomoForCountry(u, momoCountry) {
  // Pays inconnu → on ne devine JAMAIS : renvoyer un numéro ici enverrait l'argent
  // d'un event XOF au mauvais pays (audit money-safety). Le cron met alors en
  // attente pour revue manuelle plutôt que de payer à l'aveugle.
  if (!momoCountry) return null
  const map = (u?.payoutMomos && typeof u.payoutMomos === 'object') ? u.payoutMomos : {}
  if (map[momoCountry]) {
    const e = cleanMomoEntry(map[momoCountry], momoCountry)
    if (e) return e
  }
  // Repli legacy : ancien numéro unique, UNIQUEMENT si son pays == celui de l'event.
  const legacy = cleanMomoEntry(u?.payoutMomo)
  if (legacy && legacy.country === momoCountry) return legacy
  return null
}

// Rétro-compat : ancien helper mono-numéro (encore utilisé ailleurs éventuellement).
export function parsePayoutMomo(u) {
  return cleanMomoEntry(u?.payoutMomo)
}

// Liste des pays UEMOA où l'organisateur a un numéro d'encaissement enregistré.
export function configuredMomoCountries(u) {
  const set = new Set()
  const map = (u?.payoutMomos && typeof u.payoutMomos === 'object') ? u.payoutMomos : {}
  for (const [k, v] of Object.entries(map)) { if (cleanMomoEntry(v, k)) set.add(k) }
  const legacy = cleanMomoEntry(u?.payoutMomo)
  if (legacy) set.add(legacy.country)
  return [...set]
}

async function alertAdmin(db, docId, payload) {
  // payment_alerts est write:false côté règles — Admin SDK uniquement.
  await db.collection('payment_alerts').doc(docId).set({
    provider: 'fedapay',
    status: 'manual_review',
    createdAt: FieldValue.serverTimestamp(),
    ...payload,
  }, { merge: true }).catch(() => {})
}

async function notifySeller(db, uid, { type, title, body }) {
  try {
    const notif = {
      id: 'notif-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      type, title, body, data: {}, read: false, createdAt: Date.now(),
    }
    const ref = db.collection('notifications').doc(String(uid))
    const cur = await ref.get()
    const items = cur.exists ? (cur.data().items || []) : []
    await ref.set({ items: [notif, ...items].slice(0, 50), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
  } catch {}
}

// Finalisation transactionnelle d'un versement RÉUSSI : marque payé, décrémente
// le ledger global (clampé à 0 — l'admin a pu régler à la main entre-temps),
// journalise. Si des ventes tardives sont arrivées pendant l'envoi, le doc
// repasse en 'accumulating' pour que le reliquat parte au prochain run.
async function finalizePaid(db, ref, { amount, payoutId, sellerUid, eventId, eventName }) {
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const cur = snap.exists ? snap.data() : {}
    // Idempotence sous concurrence (webhook payout.sent + finalisation inline/
    // cron du MÊME payout) : ne finaliser que si ce payout est encore le payout
    // en cours. Le 1er commit met pendingPayoutId=null ; au replay de la
    // transaction, la 2e finalisation re-lit null !== payoutId et sort AVANT
    // tout décrément — sinon amountDueXOF ET seller_balances seraient
    // décrémentés deux fois (reliquat effacé + organisateur sous-payé).
    if (String(cur.pendingPayoutId || '') !== String(payoutId)) return
    const remaining = Math.max(0, Number(cur.amountDueXOF || 0) - amount)
    const balRef = db.collection('seller_balances').doc(String(sellerUid))
    const balSnap = await tx.get(balRef)
    const balDue = Math.max(0, Number(balSnap.exists ? balSnap.data().amountDueXOF : 0) || 0)
    tx.set(ref, {
      amountDueXOF: remaining,
      paidXOF: FieldValue.increment(amount),
      status: remaining > 0 ? 'accumulating' : 'paid',
      lastPayoutId: payoutId || null,
      lastPaidAt: Date.now(),
      claimedAt: null,
      pendingPayoutId: null,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
    tx.set(balRef, {
      amountDueXOF: Math.max(0, balDue - amount),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
    tx.set(db.collection('payout_logs').doc(`pl_event_${eventId}_${payoutId || Date.now()}`), {
      sellerUid: String(sellerUid), amount, currency: 'XOF',
      eventId: String(eventId), eventName: eventName || '',
      auto: true, fedapayPayoutId: payoutId || null,
      by: 'cron', byName: 'Versement automatique', at: Date.now(),
    })
  })
  await notifySeller(db, sellerUid, {
    type: 'payout_sent',
    title: 'Recette envoyée sur ton mobile money',
    body: `${amount.toLocaleString('fr-FR')} FCFA — « ${eventName || 'ton événement'} ». L'argent arrive selon les délais de ton opérateur.`,
  })
}

async function markFailed(db, ref, { eventId, eventName, sellerUid, amount, reason }) {
  await ref.set({
    status: 'failed', failReason: String(reason || 'unknown').slice(0, 300),
    // pendingPayoutId nettoyé (symétrie avec finalizePaid) : markFailed n'est
    // atteint que pour un payout TERMINAL en échec ou bloqué 48 h — aucun argent
    // n'est plus en vol. Sans ce nettoyage, un doc réactivé (vente tardive ou
    // retry) garderait un pendingPayoutId MORT que le bloc recovery relirait en
    // boucle au lieu de re-claim → le reliquat ne serait jamais versé. Idem, un
    // webhook payout.sent réordonné n'a plus de pendingPayoutId à matcher (pas
    // de crédit fantôme).
    claimedAt: null, pendingPayoutId: null, updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true })
  await alertAdmin(db, `payout_${eventId}`, {
    reason: 'auto_payout_failed',
    eventId: String(eventId), eventName: eventName || '',
    sellerUid: String(sellerUid), paidAmount: null, amountDue: amount,
    detail: String(reason || '').slice(0, 300),
  })
}

// Confirmation temps réel par le webhook FedaPay (payout.sent / payout.failed).
// Retrouve l'enveloppe par metadata.eventId (posée à la création) ou, à défaut,
// par pendingPayoutId. Idempotent : si le doc n'est plus 'paying', on ignore.
export async function handlePayoutEvent(db, name, entity) {
  const payoutId = entity?.id
  if (!payoutId) return
  const st = String(entity?.status || name.split('.')[1] || '').toLowerCase()
  const isOk = PAYOUT_OK.has(st) || name === 'payout.sent'
  const isKo = PAYOUT_KO.has(st) || name === 'payout.failed'
  if (!isOk && !isKo) return

  const metaEventId = entity?.custom_metadata?.eventId || entity?.metadata?.eventId
  let ref = null, ep = null
  if (metaEventId) {
    const s = await db.collection('event_payouts').doc(String(metaEventId)).get()
    if (s.exists) { ref = s.ref; ep = s.data() }
  }
  if (!ref) {
    const q = await db.collection('event_payouts').where('pendingPayoutId', '==', payoutId).limit(1).get()
    if (!q.empty) { ref = q.docs[0].ref; ep = q.docs[0].data() }
  }
  if (!ref || !ep) return
  // On finalise sur l'IDENTITÉ du payout (pendingPayoutId), PAS sur le status :
  // une vente tardive peut repasser le doc en 'accumulating' pendant que ce
  // payout est en vol — il doit rester finalisable, sinon le prochain cron en
  // enverrait un second (double-versement). Idempotence conservée : finalizePaid
  // / markFailed remettent pendingPayoutId à null → un webhook en double ne
  // matchera plus et sortira ici.
  if (String(ep.pendingPayoutId || '') !== String(payoutId)) return

  if (isOk) {
    await finalizePaid(db, ref, {
      amount: Number(ep.claimedAmount || 0), payoutId,
      sellerUid: ep.sellerUid, eventId: ep.eventId || ref.id, eventName: ep.eventName,
    })
  } else {
    await markFailed(db, ref, {
      eventId: ep.eventId || ref.id, eventName: ep.eventName,
      sellerUid: ep.sellerUid, amount: Number(ep.claimedAmount || 0),
      reason: `Payout FedaPay ${st} (webhook)`,
    })
  }
}

// Passe quotidienne. Renvoie des compteurs pour le log du cron.
export async function processEventPayouts(db, now = Date.now()) {
  const out = { scanned: 0, paid: 0, failed: 0, waiting: 0, skipped: 0 }
  if (!isFedapayConfigured()) { out.skipped = -1; return out } // env absente → rien à faire

  const snap = await db.collection('event_payouts')
    .where('status', 'in', ['accumulating', 'paying']).get()

  for (const d of snap.docs) {
    out.scanned++
    const ep = d.data()
    const eventId = ep.eventId || d.id
    const sellerUid = ep.sellerUid

    try {
      // ── Recovery : un payout est EN VOL (pendingPayoutId présent) → on le
      //    suit et on le finalise QUEL QUE SOIT le status. Une vente tardive a
      //    pu repasser le doc en 'accumulating' sans annuler ce payout ; sans
      //    cette garde, le claim plus bas en enverrait un SECOND (double-
      //    versement). Le reliquat de la vente tardive repartira au run suivant,
      //    une fois ce payout finalisé (finalizePaid laisse 'accumulating' s'il
      //    reste un dû). ──
      if (ep.pendingPayoutId) {
        const p = await getPayout(ep.pendingPayoutId).catch(() => null)
        const st = String(p?.status || '').toLowerCase()
        if (PAYOUT_OK.has(st)) {
          await finalizePaid(db, d.ref, { amount: Number(ep.claimedAmount || 0), payoutId: ep.pendingPayoutId, sellerUid, eventId, eventName: ep.eventName })
          out.paid++
        } else if (PAYOUT_KO.has(st)) {
          await markFailed(db, d.ref, { eventId, eventName: ep.eventName, sellerUid, amount: Number(ep.claimedAmount || 0), reason: `Payout FedaPay ${st}` })
          out.failed++
        } else if (now - Number(ep.claimedAt || 0) > STUCK_PAYOUT_MS) {
          await markFailed(db, d.ref, { eventId, eventName: ep.eventName, sellerUid, amount: Number(ep.claimedAmount || 0), reason: `Payout ${ep.pendingPayoutId} bloqué en « ${st || 'inconnu'} » depuis 48 h` })
          out.failed++
        } else {
          out.waiting++ // encore en cours chez FedaPay — on reverra demain
        }
        continue
      }

      // ── Claim 'paying' ORPHELIN (createPayout jamais parti, aucun
      //    pendingPayoutId) → on relâche après un délai pour retenter. ──
      if (ep.status === 'paying') {
        if (now - Number(ep.claimedAt || 0) > STALE_CLAIM_MS) {
          await d.ref.set({ status: 'accumulating', claimedAt: null, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
        }
        out.waiting++
        continue
      }

      // ── Événement terminé ? (l'argent ne part JAMAIS avant la fin) ──
      const evSnap = await db.collection('events').doc(String(eventId)).get()
      if (!evSnap.exists) {
        // Event supprimé : la cascade delete_event gère les remboursements —
        // ici on gèle et on alerte plutôt que d'envoyer de l'argent.
        await markFailed(db, d.ref, { eventId, eventName: ep.eventName, sellerUid, amount: Number(ep.amountDueXOF || 0), reason: 'Événement supprimé avant versement' })
        out.failed++
        continue
      }
      const ev = evSnap.data()
      if (ev.cancelled) {
        await markFailed(db, d.ref, { eventId, eventName: ep.eventName || ev.name, sellerUid, amount: Number(ep.amountDueXOF || 0), reason: 'Événement ANNULÉ — rembourser les acheteurs avant tout versement' })
        out.failed++
        continue
      }
      const end = eventEndMs(ev)
      if (!end || now < end + END_BUFFER_MS) { out.waiting++; continue }

      // ── Destinataire : numéro mobile money DU PAYS DE L'ÉVÉNEMENT ──
      // Un organisateur peut avoir des events dans plusieurs pays UEMOA et un
      // numéro par pays. On paie sur le numéro du pays de CET event (momoCountry
      // figé sur l'enveloppe à la vente ; à défaut, dérivé de la région de l'event).
      const uSnap = await db.collection('users').doc(String(sellerUid)).get()
      const u = uSnap.exists ? uSnap.data() : {}
      const eventCountry = ep.momoCountry || momoCountryFromRegionName(ev.region)
      const amount = Math.max(0, Math.round(Number(ep.amountDueXOF || 0)))
      if (amount <= 0) {
        await d.ref.set({ status: 'paid', claimedAt: null, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
        continue
      }
      // Pays de l'événement INDÉTERMINÉ (région non reconnue) : on ne verse JAMAIS
      // à l'aveugle (ça enverrait l'argent au mauvais numéro) → revue manuelle.
      if (!eventCountry) {
        await markFailed(db, d.ref, { eventId, eventName: ep.eventName || ev.name, sellerUid, amount, reason: `Pays de l'événement indéterminé (région « ${ev.region || '?'} ») — versement Mobile Money impossible sans le pays. À régler à la main / corriger la région.` })
        out.failed++
        continue
      }
      const countryName = regionByMomoCountry(eventCountry)?.name || eventCountry
      const momo = parsePayoutMomoForCountry(u, eventCountry)
      if (!momo) {
        await markFailed(db, d.ref, { eventId, eventName: ep.eventName || ev.name, sellerUid, amount, reason: `Aucun numéro Mobile Money enregistré pour ${countryName} (Profil → Encaissement)` })
        await notifySeller(db, sellerUid, {
          type: 'payout_failed',
          title: `${amount.toLocaleString('fr-FR')} FCFA t'attendent`,
          body: `Ajoute ton numéro Mobile Money pour ${countryName} dans Profil → Paramètres → Encaissement pour recevoir la recette de « ${ep.eventName || ev.name} ».`,
        })
        out.failed++
        continue
      }

      // ── Claim transactionnel : fige le montant, empêche un double envoi ──
      let claimed = 0
      await db.runTransaction(async (tx) => {
        const s = await tx.get(d.ref)
        const cur = s.exists ? s.data() : {}
        // Ne jamais (re)claim si un payout est déjà en vol pour ce doc — même si
        // une vente tardive a remis le status à 'accumulating' (défense en
        // profondeur ; le bloc recovery ci-dessus a normalement déjà `continue`).
        if (cur.status !== 'accumulating' || cur.pendingPayoutId) return
        claimed = Math.max(0, Math.round(Number(cur.amountDueXOF || 0)))
        if (claimed <= 0) return
        tx.set(d.ref, { status: 'paying', claimedAt: now, claimedAmount: claimed, pendingPayoutId: null, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
      })
      if (claimed <= 0) { out.waiting++; continue }

      // ── Envoi FedaPay ──
      const [firstname, ...rest] = String(u.name || 'Organisateur').trim().split(/\s+/)
      let payout
      try {
        payout = await createPayout({
          amount: claimed,
          description: `LIVEINBLACK — recette « ${(ep.eventName || ev.name || '').slice(0, 60)} »`,
          customer: {
            firstname: firstname || 'Organisateur',
            ...(rest.length ? { lastname: rest.join(' ') } : {}),
            ...(u.email ? { email: u.email } : {}),
            phone_number: { number: momo.number, country: momo.country },
          },
          metadata: { type: 'event_payout', eventId: String(eventId), sellerUid: String(sellerUid) },
          reference: `evp_${eventId}_${now}`,
        })
      } catch (e) {
        await markFailed(db, d.ref, { eventId, eventName: ep.eventName || ev.name, sellerUid, amount: claimed, reason: `Création du payout refusée : ${e.message}` })
        out.failed++
        continue
      }
      const payoutId = payout?.id
      if (!payoutId) {
        await markFailed(db, d.ref, { eventId, eventName: ep.eventName || ev.name, sellerUid, amount: claimed, reason: 'Payout créé sans id (réponse FedaPay inattendue)' })
        out.failed++
        continue
      }
      // Trace l'id AVANT l'envoi : si le process meurt ici, le prochain run
      // relira ce payout au lieu d'en créer un deuxième.
      await d.ref.set({ pendingPayoutId: payoutId, updatedAt: FieldValue.serverTimestamp() }, { merge: true })

      try {
        await startPayout(payoutId, { number: momo.number, country: momo.country })
      } catch (e) {
        await markFailed(db, d.ref, { eventId, eventName: ep.eventName || ev.name, sellerUid, amount: claimed, reason: `Envoi du payout refusé : ${e.message}` })
        out.failed++
        continue
      }

      // startPayout LANCE l'envoi (asynchrone chez FedaPay) : on ne marque payé
      // qu'une fois l'envoi confirmé. Souvent instantané → on re-lit une fois ;
      // sinon le webhook payout.sent (ou le prochain cron) finalisera.
      const check = await getPayout(payoutId).catch(() => null)
      const st = String(check?.status || '').toLowerCase()
      if (PAYOUT_OK.has(st)) {
        await finalizePaid(db, d.ref, { amount: claimed, payoutId, sellerUid, eventId, eventName: ep.eventName || ev.name })
        out.paid++
      } else if (PAYOUT_KO.has(st)) {
        await markFailed(db, d.ref, { eventId, eventName: ep.eventName || ev.name, sellerUid, amount: claimed, reason: `Payout FedaPay ${st}` })
        out.failed++
      } else {
        out.waiting++ // en cours chez l'opérateur — confirmation par webhook/cron
      }
    } catch (e) {
      console.error('[event-payouts] échec sur', eventId, e.message)
      out.failed++
      await alertAdmin(db, `payout_${eventId}`, {
        reason: 'auto_payout_failed',
        eventId: String(eventId), sellerUid: String(sellerUid || ''),
        detail: String(e.message || '').slice(0, 300),
      })
    }
  }
  return out
}

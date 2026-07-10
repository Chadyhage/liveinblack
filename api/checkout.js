// Vercel Serverless Function — Stripe Checkout (billets)
// Endpoint unifié (plan Hobby, 12 fonctions max) :
//   POST /api/checkout                       → crée une session Stripe Checkout
//   GET  /api/checkout?session_id=cs_...     → vérifie une session (ex /api/verify-session)
//
// Body attendu (POST) :
// {
//   eventId, eventName, placeType, qty (number),
//   unitPriceEUR (number), preorderItems? [{ name, qty, priceEUR }],
//   userId, userEmail (optionnel mais recommandé), bookingId (id local généré côté client)
// }
//
// Monétisation : un FRAIS DE SERVICE acheteur (lib/fees.js) est ajouté au paiement.
// Si l'organisateur a un compte Stripe Connect éligible (UE/zone Stripe), on reverse
// automatiquement (destination charge + application_fee = le frais). Sinon, la plateforme
// encaisse 100% et le webhook crédite un solde interne (seller_balances) à reverser à la main.

import Stripe from 'stripe'
import { computeTicketFeeCents, isStripeConnectCountry } from '../lib/fees.js'
import { requireAuth } from '../lib/verifyAuth.js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })

export default async function handler(req, res) {
  if (req.method === 'GET') return verifySession(req, res)
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Acheter exige d'être connecté dans l'app → on exige le token Firebase ici
  // aussi (sinon un tiers peut créer des sessions et décrémenter le stock).
  const caller = await requireAuth(req, res)
  if (!caller) return

  try {
    const {
      eventId,
      eventName,
      eventImage,
      placeType,
      qty = 1,
      unitPriceEUR = 0,
      preorderItems = [],
      userId,
      userEmail,
      bookingId,
      isTable, // achat d'une TABLE entière (place de groupe) — modèle « hôte »
      promoCode, // code promo saisi par l'acheteur (validé et appliqué SERVEUR)
    } = req.body || {}

    if (!eventId || !eventName || !placeType || !bookingId) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    // ── Lecture de l'événement (devise + prix serveur) ────────────────────────
    // Garde devise : les événements FCFA (Togo/Bénin) se paient via FedaPay,
    // jamais via Stripe — sinon 5 000 (FCFA) serait débité comme 5 000 €.
    let db = null
    let evData = null
    try {
      const { getDb } = await import('../lib/firebaseAdmin.js')
      db = getDb()
      const evSnap = await db.collection('events').doc(String(eventId)).get()
      evData = evSnap.exists ? evSnap.data() : null
    } catch (e) {
      console.warn('[/api/checkout] lecture event skipped:', e.message)
    }
    // Devise EXPLICITE uniquement : les events créés avant le multi-devise ont
    // des prix saisis en euros même avec region=Togo — ils restent sur Stripe.
    if (evData && String(evData.currency || '').toUpperCase() === 'XOF') {
      return res.status(400).json({ error: 'Cet événement se paie en FCFA (mobile money). Recharge la page pour utiliser le bon tunnel de paiement.' })
    }

    // Quantité bornée (aligné sur /api/event-stock). Une table entière = 1 unité
    // de stock (la table compte pour 1, pas groupMax). Sert aussi de nombre
    // d'utilisations du code promo pour cette commande (#69).
    const nQty = isTable ? 1 : Math.max(1, Math.min(20, Math.floor(Number(qty)) || 1))

    // ── Code promo : validé AVANT le décrément de stock (échec rapide, rien à
    // restocker). Le plafond d'utilisations est vérifié POUR CETTE QUANTITÉ
    // (nQty) — sinon une commande de N billets viderait un code à usage limité
    // (bypass #69). La réduction est calculée plus bas sur le prix SERVEUR.
    let promo = null
    if (promoCode) {
      if (!db) {
        // Sans Admin SDK on ne peut pas vérifier le code — on n'applique JAMAIS
        // une réduction non vérifiée, et on ne facture pas plein tarif en douce.
        return res.status(503).json({ error: 'Code promo momentanément invérifiable — réessaye dans un instant.' })
      }
      const { resolvePromo } = await import('../lib/promos.js')
      const result = await resolvePromo(db, eventId, promoCode, nQty)
      if (!result.ok) return res.status(400).json({ error: result.message })
      promo = result.promo
    }

    // ── Table entière (modèle « hôte ») : un acheteur réserve TOUTE une place de
    // groupe (carré/table) au prix plein et recevra groupMax billets à attribuer
    // à ses invités. La place doit réellement être une place de groupe (validé
    // serveur — le client ne peut pas transformer une place solo en table).
    let tableSeats = 0
    if (isTable) {
      const tPlace = (evData?.places || []).find(p => p.type === placeType) || null
      if (!tPlace) return res.status(404).json({ error: 'Table introuvable sur cet événement' })
      if (String(tPlace.groupType) !== 'group' || (Number(tPlace.groupMax) || 0) < 2) {
        return res.status(400).json({ error: "Cette place n'est pas une table de groupe." })
      }
      tableSeats = Math.min(50, Math.max(2, Number(tPlace.groupMax) || 2))
      // ── RÈGLE « 1 place de groupe par compte et par événement » ─────────────
      // Refus si l'acheteur (identité = token vérifié, jamais le body) est DÉJÀ
      // lié à une place de groupe de cet événement — hôte d'une table OU membre
      // titulaire d'un siège attribué. Vérifié AVANT le décrément de stock.
      if (db) {
        const { findGroupTieForEvent, groupTieBuyMessage } = await import('../lib/groupTicketGuard.js')
        const tie = await findGroupTieForEvent(db, eventId, caller.uid)
        if (tie) return res.status(409).json({ error: groupTieBuyMessage(tie) })
      }
    }

    // ── Décrément atomique du stock AVANT de créer la session Stripe ──────────
    // C'est le seul point fiable pour empêcher la survente sur le tunnel payant :
    // une fois la session créée, l'acheteur peut payer même si le stock est épuisé
    // entre-temps. On traite donc "accepter de payer" comme "réserver la place" —
    // si le paiement est abandonné, /paiement-annule restocke (cf. PaiementAnnulePage).
    // 'event_not_found'/'place_not_found' ne bloquent pas (events de démo statiques
    // sans doc Firestore, ou config legacy) : seul un stock réellement insuffisant bloque.
    let stockDecremented = false
    let serverUnitCents = null
    try {
      if (!db) {
        const { getDb } = await import('../lib/firebaseAdmin.js')
        db = getDb()
      }
      const eventRef = db.collection('events').doc(String(eventId))
      const decremented = await db.runTransaction(async (tx) => {
        const snap = await tx.get(eventRef)
        if (!snap.exists) return false
        const places = snap.data().places || []
        const idx = places.findIndex(p => p.type === placeType)
        if (idx === -1) return false
        // Prix unitaire de RÉFÉRENCE (serveur) — le client n'a pas le dernier mot.
        if (places[idx].price != null) {
          serverUnitCents = Math.round(Number(places[idx].price) * 100) || 0
        }
        const available = Number(places[idx].available) || 0
        if (available < nQty) {
          const err = new Error('insufficient_stock')
          err.code = 'insufficient_stock'
          throw err
        }
        const total = Number(places[idx].total) || 0
        const nextAvailable = Math.max(0, Math.min(total || Infinity, available - nQty))
        const nextPlaces = places.map((p, i) => i === idx ? { ...p, available: nextAvailable } : p)
        tx.update(eventRef, { places: nextPlaces })
        return true
      })
      stockDecremented = decremented === true
    } catch (e) {
      if (e.code === 'insufficient_stock') {
        return res.status(409).json({ error: 'Il ne reste plus assez de places disponibles pour cette quantité.' })
      }
      console.warn('[/api/checkout] stock check skipped:', e.message)
    }

    // Restocke la place réservée plus haut si la suite échoue (création de session
    // Stripe, etc.) — sinon le stock reste décrémenté sans session pour le récupérer
    // (le webhook checkout.session.expired ne se déclenche que s'il y a une session).
    async function restockOnFailure() {
      if (!stockDecremented || !db) return
      try {
        const eventRef = db.collection('events').doc(String(eventId))
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(eventRef)
          if (!snap.exists) return
          const places = snap.data().places || []
          const idx = places.findIndex(p => p.type === placeType)
          if (idx === -1) return
          const total = Number(places[idx].total) || 0
          const available = Number(places[idx].available) || 0
          const nextAvailable = Math.max(0, Math.min(total || Infinity, available + nQty))
          const nextPlaces = places.map((p, i) => i === idx ? { ...p, available: nextAvailable } : p)
          tx.update(eventRef, { places: nextPlaces })
        })
        console.warn('[/api/checkout] stock restocké après échec en aval')
      } catch (restockErr) {
        console.error('[/api/checkout] restock après échec ÉCHOUÉ:', restockErr.message)
      }
    }

    // ── Prix unitaire retenu : SERVEUR prioritaire (faille corrigée : avant,
    // unitPriceEUR venait du client sans contrôle — un billet VIP payable 1 ct).
    // Fallback client uniquement si pas de doc/champ (events démo, legacy) ; les
    // parts de groupe ont été validées plus haut (plancher place + part égale).
    let placeUnitCents = Math.round(Number(unitPriceEUR) * 100)
    if (serverUnitCents != null && serverUnitCents !== placeUnitCents) {
      console.warn('[/api/checkout] prix client ≠ serveur — serveur retenu:', placeUnitCents, '→', serverUnitCents)
      placeUnitCents = serverUnitCents
    }

    // ── Application du code promo : réduction PAR BILLET sur le prix serveur
    // (une table = 1 unité au prix plein → la réduction s'applique une fois).
    // Un code qui rendrait le billet gratuit est refusé (minimum Stripe) —
    // pour offrir des places, l'organisateur passe par la guestlist.
    let promoUnitDiscountCents = 0
    if (promo && placeUnitCents > 0) {
      const { promoUnitDiscount } = await import('../lib/promos.js')
      promoUnitDiscountCents = promoUnitDiscount(promo, placeUnitCents, 100)
      if (promoUnitDiscountCents >= placeUnitCents) {
        await restockOnFailure()
        return res.status(400).json({ error: 'Ce code rend le billet gratuit — non pris en charge pour le paiement en ligne.' })
      }
      placeUnitCents -= promoUnitDiscountCents
    }

    // Construire les line_items pour Stripe (montants en CENTIMES)
    const line_items = []

    // Place principale (si payante — sinon on n'inclut pas, mais on doit avoir quelque chose à payer)
    if (placeUnitCents > 0) {
      line_items.push({
        price_data: {
          currency: 'eur',
          product_data: {
            name: (isTable ? `${eventName} — ${placeType} (table ${tableSeats} pers.)` : `${eventName} — ${placeType}`)
              + (promo ? ` — code ${promo.code}` : ''),
            ...(eventImage && eventImage.startsWith('http') ? { images: [eventImage] } : {}),
          },
          unit_amount: placeUnitCents,
        },
        quantity: nQty,
      })
    }

    // Précommandes (consos)
    for (const it of preorderItems) {
      const cents = Math.round(Number(it.priceEUR || 0) * 100)
      const q = Number(it.qty || 0)
      if (cents > 0 && q > 0) {
        line_items.push({
          price_data: {
            currency: 'eur',
            product_data: { name: `${it.name} (précommande)` },
            unit_amount: cents,
          },
          quantity: q,
        })
      }
    }

    if (line_items.length === 0) {
      // Rien à payer : rendre la place réservée au décrément ci-dessus.
      await restockOnFailure()
      return res.status(400).json({ error: 'Aucun montant à payer (place gratuite ?)' })
    }

    // ── Frais de service LIVEINBLACK (payé par l'acheteur) ──
    // Calculé côté SERVEUR (jamais reçu du client). Pour une table, les frais sont
    // PAR SIÈGE (décision fondateur) : prix table ÷ sièges, × nombre de sièges.
    const feeCents = isTable
      ? computeTicketFeeCents(Math.round(placeUnitCents / tableSeats), tableSeats)
      : computeTicketFeeCents(placeUnitCents, nQty)
    if (feeCents > 0) {
      line_items.push({
        price_data: {
          currency: 'eur',
          product_data: { name: 'Frais de service LIVEINBLACK' },
          unit_amount: feeCents,
        },
        quantity: 1,
      })
    }

    // ── Routage du reversement vendeur (organisateur) ──
    // Best-effort : si Admin SDK indisponible, on encaisse 100% sans router (le fee
    // reste tout de même collecté). On résout le vendeur côté serveur (jamais le client).
    let sellerUid = ''
    let connectMode = 'none' // 'auto' (transfer Stripe) | 'ledger' (solde interne) | 'none'
    let paymentIntentData = null
    try {
      if (!db) { const { getDb } = await import('../lib/firebaseAdmin.js'); db = getDb() }
      if (evData) {
        const ev = evData
        sellerUid = ev.organizerId || ev.createdBy || ''
        if (sellerUid && sellerUid !== caller.uid) {
          const uSnap = await db.collection('users').doc(String(sellerUid)).get()
          const u = uSnap.exists ? uSnap.data() : {}
          const eligible = !!u.stripeAccountId && u.stripeChargesEnabled === true &&
            isStripeConnectCountry(u.stripeCountry || u.country)
          if (eligible && feeCents > 0) {
            // Destination charge : Stripe reverse (total - fee) au vendeur, la plateforme garde le fee.
            paymentIntentData = {
              transfer_data: { destination: u.stripeAccountId },
              application_fee_amount: feeCents,
              metadata: { sellerUid, feeCents: String(feeCents) },
            }
            connectMode = 'auto'
          } else {
            // Pas (encore) de Connect → la plateforme encaisse tout, on tracera la dette au webhook.
            connectMode = 'ledger'
          }
        }
      }
    } catch (e) {
      // Admin SDK indisponible → on n'empêche jamais l'encaissement, juste pas de routage.
      console.warn('[/api/checkout] seller resolution skipped:', e.message)
    }

    // URL de retour — déduit l'origine de la requête
    const origin = req.headers.origin || `https://${req.headers.host}`

    let session
    try {
      session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items,
        ...(paymentIntentData ? { payment_intent_data: paymentIntentData } : {}),
        ...(userEmail ? { customer_email: userEmail } : {}),
        success_url: `${origin}/paiement-reussi?session_id={CHECKOUT_SESSION_ID}&booking_id=${encodeURIComponent(bookingId)}`,
        // place_type + qty : pour que /paiement-annule puisse restocker la place réservée plus haut
        cancel_url: `${origin}/paiement-annule?event_id=${encodeURIComponent(eventId)}&place_type=${encodeURIComponent(placeType)}&qty=${encodeURIComponent(nQty)}`,
        metadata: {
          eventId: String(eventId),
          eventName: String(eventName).slice(0, 200),
          placeType: String(placeType),
          qty: String(nQty),
          // Identité du payeur = TOUJOURS le token vérifié (le webhook s'en sert
          // pour user_bookings, les points et payments[uid] des groupes).
          userId: caller.uid,
          bookingId: String(bookingId),
          // Prix unitaire de la place AU MOMENT de la vente (centimes) : le webhook
          // le fige sur chaque billet (placePrice) pour que les stats/CA de
          // l'organisateur ne changent pas rétroactivement si le tarif est modifié.
          unitPriceCents: String(placeUnitCents),
          // Monétisation : le webhook utilise feeCents + sellerUid + connectMode
          feeCents: String(feeCents),
          sellerUid: String(sellerUid || ''),
          connectMode,
          // Table entière : le webhook émet `tableSeats` billets (sièges) tous
          // détenus par l'hôte, à attribuer ensuite via /api/tickets.
          ...(isTable ? { tableSeats: String(tableSeats), isTable: '1' } : {}),
          // Code promo appliqué : le webhook incrémente usedCount au PREMIER
          // settlement (1 billet = 1 utilisation ; une table = 1).
          ...(promo ? { promoCode: promo.code, promoUses: String(isTable ? 1 : nQty), promoUnitDiscountCents: String(promoUnitDiscountCents) } : {}),
        },
        // Stripe collecte aussi le nom complet du payeur
        billing_address_collection: 'auto',
        // Désactive la collecte des frais d'expédition (event en présentiel)
        locale: 'fr',
      })
    } catch (stripeErr) {
      // La session n'a pas pu être créée → restocke la place réservée plus haut.
      await restockOnFailure()
      throw stripeErr
    }

    // feeCents + connectMode renvoyés pour transparence (le front peut afficher le frais).
    return res.status(200).json({ url: session.url, sessionId: session.id, feeCents, connectMode })
  } catch (err) {
    console.error('[/api/checkout] error:', err)
    return res.status(500).json({ error: err.message || 'Stripe error' })
  }
}

// ─── Vérification d'une session (ex /api/verify-session — fusionné ici) ──────
// GET /api/checkout?session_id=cs_xxx → statut de paiement + métadonnées pour
// confirmer la réservation après le redirect success de Stripe.
async function verifySession(req, res) {
  // Auth requise : les métadonnées de session (email, nom du payeur…) ne sont
  // pas publiques — avant, quiconque devinait un session_id pouvait les lire.
  const caller = await requireAuth(req, res)
  if (!caller) return

  const sessionId = req.query?.session_id || req.query?.sessionId
  if (!sessionId) {
    return res.status(400).json({ error: 'session_id requis' })
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent', 'customer'],
    })
    if (session.metadata?.userId && session.metadata.userId !== caller.uid) {
      return res.status(403).json({ error: 'forbidden', message: 'Cette session ne t’appartient pas.' })
    }

    let boostStatus = null
    if (session.metadata?.intent === 'boost' && session.metadata?.boostId) {
      const { getDb } = await import('../lib/firebaseAdmin.js')
      const db = getDb()
      const boostSnap = await db.collection('boosts').doc(session.metadata.boostId).get()
      if (boostSnap.exists) boostStatus = boostSnap.data().status || 'active'
      else if (session.metadata.slotId) {
        const slotSnap = await db.collection('boost_slots').doc(session.metadata.slotId).get()
        boostStatus = slotSnap.exists ? (slotSnap.data().status || 'pending') : 'pending'
      } else boostStatus = 'pending'
    }

    return res.status(200).json({
      paid: session.payment_status === 'paid',
      paymentStatus: session.payment_status,
      amountTotal: session.amount_total,
      currency: session.currency,
      customerEmail: session.customer_details?.email || null,
      customerName: session.customer_details?.name || null,
      metadata: session.metadata || {},
      boostStatus,
      receiptUrl: session.payment_intent?.charges?.data?.[0]?.receipt_url || null,
    })
  } catch (err) {
    console.error('[/api/checkout verify] error:', err)
    return res.status(500).json({ error: err.message || 'Stripe error' })
  }
}

// Vercel Serverless Function — Crée une session Stripe Checkout
// Endpoint : POST /api/checkout
//
// Body attendu :
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
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
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
      groupBookingId,
      isGroupShare,
    } = req.body || {}

    if (!eventId || !eventName || !placeType || !bookingId) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    // Construire les line_items pour Stripe (montants en CENTIMES)
    const line_items = []

    // Place principale (si payante — sinon on n'inclut pas, mais on doit avoir quelque chose à payer)
    const placeUnitCents = Math.round(Number(unitPriceEUR) * 100)
    if (placeUnitCents > 0 && qty > 0) {
      line_items.push({
        price_data: {
          currency: 'eur',
          product_data: {
            name: `${eventName} — ${placeType}`,
            ...(eventImage && eventImage.startsWith('http') ? { images: [eventImage] } : {}),
          },
          unit_amount: placeUnitCents,
        },
        quantity: qty,
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
      return res.status(400).json({ error: 'Aucun montant à payer (place gratuite ?)' })
    }

    // ── Décrément atomique du stock AVANT de créer la session Stripe ──────────
    // C'est le seul point fiable pour empêcher la survente sur le tunnel payant :
    // une fois la session créée, l'acheteur peut payer même si le stock est épuisé
    // entre-temps. On traite donc "accepter de payer" comme "réserver la place" —
    // si le paiement est abandonné, /paiement-annule restocke (cf. PaiementAnnulePage).
    // 'event_not_found'/'place_not_found' ne bloquent pas (events de démo statiques
    // sans doc Firestore, ou config legacy) : seul un stock réellement insuffisant bloque.
    let db = null
    let stockDecremented = false
    try {
      const { getDb } = await import('../lib/firebaseAdmin.js')
      db = getDb()
      const eventRef = db.collection('events').doc(String(eventId))
      const decremented = await db.runTransaction(async (tx) => {
        const snap = await tx.get(eventRef)
        if (!snap.exists) return false
        const places = snap.data().places || []
        const idx = places.findIndex(p => p.type === placeType)
        if (idx === -1) return false
        const available = Number(places[idx].available) || 0
        if (available < qty) {
          const err = new Error('insufficient_stock')
          err.code = 'insufficient_stock'
          throw err
        }
        const total = Number(places[idx].total) || 0
        const nextAvailable = Math.max(0, Math.min(total || Infinity, available - qty))
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
          const nextAvailable = Math.max(0, Math.min(total || Infinity, available + qty))
          const nextPlaces = places.map((p, i) => i === idx ? { ...p, available: nextAvailable } : p)
          tx.update(eventRef, { places: nextPlaces })
        })
        console.warn('[/api/checkout] stock restocké après échec en aval')
      } catch (restockErr) {
        console.error('[/api/checkout] restock après échec ÉCHOUÉ:', restockErr.message)
      }
    }

    // ── Frais de service LIVEINBLACK (payé par l'acheteur) ──
    // Calculé côté SERVEUR (jamais reçu du client). Sur le prix unitaire du billet.
    const feeCents = computeTicketFeeCents(placeUnitCents, qty)
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
      const evSnap = await db.collection('events').doc(String(eventId)).get()
      if (evSnap.exists) {
        const ev = evSnap.data()
        sellerUid = ev.organizerId || ev.createdBy || ''
        if (sellerUid && sellerUid !== userId) {
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
        cancel_url: `${origin}/paiement-annule?event_id=${encodeURIComponent(eventId)}&place_type=${encodeURIComponent(placeType)}&qty=${encodeURIComponent(qty)}`,
        metadata: {
          eventId: String(eventId),
          eventName: String(eventName).slice(0, 200),
          placeType: String(placeType),
          qty: String(qty),
          userId: String(userId || ''),
          bookingId: String(bookingId),
          // Prix unitaire de la place AU MOMENT de la vente (centimes) : le webhook
          // le fige sur chaque billet (placePrice) pour que les stats/CA de
          // l'organisateur ne changent pas rétroactivement si le tarif est modifié.
          unitPriceCents: String(placeUnitCents),
          // Monétisation : le webhook utilise feeCents + sellerUid + connectMode
          feeCents: String(feeCents),
          sellerUid: String(sellerUid || ''),
          connectMode,
          // Part de groupe : permet au webhook de marquer la part payée même si
          // le client ferme l'onglet avant de revenir sur /paiement-reussi
          ...(groupBookingId ? { groupBookingId: String(groupBookingId) } : {}),
          ...(isGroupShare ? { isGroupShare: '1' } : {}),
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

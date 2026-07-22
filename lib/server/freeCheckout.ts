import { getDb } from '../db/mongoose'
import Ticket from '../models/Ticket'
import { createOrder, releaseOrder } from './orders'
import { fulfillOrder } from './fulfillOrder'

// Ferme le trou "place gratuite jamais réservable" (le tunnel payant —
// createOrder() + Stripe/FedaPay — voit un total à 0, n'a rien à faire payer,
// et releaseOrder() tout ce qui avait été réservé : voir app/api/checkout/route.ts
// et app/api/checkout/fedapay/route.ts, cas `nothing_to_pay`).
//
// Port de la branche "ÉVÉNEMENT GRATUIT" de src/pages/EventDetailPage.jsx
// (confirmBooking()) + de la garde serveur d'old/api/event-stock.js
// (action:'reserve' sur une place à prix 0). Réutilise EXACTEMENT le même
// chemin de validation/décrément de stock que le tunnel payant (createOrder())
// puis, au lieu de créer une session Stripe/FedaPay, appelle fulfillOrder()
// directement — le billet est émis de façon SYNCHRONE dans la même requête,
// jamais via un webhook (rail 'free' n'en a pas).
//
// Anti-abus reproduits du legacy (voir old/api/event-stock.js commentaires) :
//  - une place de groupe (table) à prix 0 est TOUJOURS refusée ("TABLE
//    GRATUITE INTERDITE" — une table doit avoir un prix, sinon un seul billet
//    serait émis pour une place censée en valoir groupMax) ;
//  - une sélection gratuite est plafonnée à 1 billet PAR APPEL (le legacy
//    bloque qty > 1 avec le code 'free_one') ;
//  - un compte ne peut détenir qu'UN SEUL billet source='free' par événement,
//    quel que soit le maxPerAccount configuré sur la place (le legacy bloque
//    avec 'already_free') — le maxPerAccount de la place reste par ailleurs
//    appliqué normalement par createOrder() (H08), les deux gardes se cumulent.
//
// N'accepte pas de code promo : un code qui rendrait un billet payant gratuit
// est déjà refusé par createOrder() ('promo_makes_ticket_free') — la seule
// façon d'arriver ici avec un total à 0 est une place dont le prix serveur
// est déjà 0, pour laquelle un code promo n'a aucun sens.

export type FreeCheckoutInput = {
  userId: string
  eventId: string
  placeId: string
  qty: number
  isTable: boolean
  preorders?: Array<{ name: string; qty: number }>
  ticketPreorders?: Array<{ ticketIndex: number; items: Array<{ name: string; qty: number; showOptionId?: string; showInfo?: string }> }>
  privateAccessVerified?: boolean
}

export type FreeCheckoutResult =
  | { ok: true; orderId: string; eventId: string; ticketCodes: string[] }
  | { ok: false; status: number; error: string }

export async function freeCheckout(input: FreeCheckoutInput): Promise<FreeCheckoutResult> {
  await getDb()

  // Table gratuite interdite — rejeté AVANT tout décrément de stock, jamais
  // silencieusement redirigé vers le tunnel payant (le client ne doit de
  // toute façon jamais appeler cette route pour une table : EventCheckoutPanel
  // ne le fait que quand le total calculé est 0, mais on ne fait jamais
  // confiance au client sur ce point).
  if (input.isTable) {
    return { ok: false, status: 400, error: 'free_table_not_supported' }
  }

  // Une seule place gratuite par appel (le sélecteur client plafonne déjà à 1
  // pour une place à prix 0 — voir EventCheckoutPanel.tsx maxQty — mais
  // l'autorité reste serveur).
  const qty = Math.max(1, Math.min(20, Math.floor(Number(input.qty) || 1)))
  if (qty > 1) {
    return { ok: false, status: 400, error: 'free_qty_exceeds_one' }
  }

  // "1 place gratuite par compte et par événement" — vérifié AVANT le
  // décrément de stock (échec rapide, rien à restocker), et indépendamment du
  // maxPerAccount de la place (garde-fou anti-hoarding, cf. commentaires
  // en tête de fichier). Comme dans createOrder() (maxPerAccount, H08), cette
  // lecture précède la transaction de décrément — même tolérance TOCTOU que le
  // reste de la base sur ce point.
  const alreadyHasFreeTicket = await Ticket.exists({
    eventId: input.eventId,
    userId: input.userId,
    source: 'free',
    revoked: { $ne: true },
  })
  if (alreadyHasFreeTicket) {
    return { ok: false, status: 409, error: 'already_free' }
  }

  const orderResult = await createOrder({
    userId: input.userId,
    eventId: input.eventId,
    placeId: input.placeId,
    qty,
    isTable: false,
    promoCode: null,
    preorders: input.preorders || [],
    ticketPreorders: input.ticketPreorders || [],
    rail: 'free',
    privateAccessVerified: input.privateAccessVerified,
  })
  if (!orderResult.ok) return orderResult
  const order = orderResult.order
  const orderId = order._id.toString()

  // Garde AUTORITAIRE finale : ne JAMAIS émettre de billet sans paiement si le
  // total réel (prix serveur de la place + précommandes + frais de service)
  // n'est pas EXACTEMENT zéro. createOrder() résout le prix depuis l'event
  // serveur (jamais le client) — si le client s'est trompé (place en réalité
  // payante, précommande payante ajoutée) ou qu'un prix a changé entre
  // l'affichage et le clic, on restocke et on renvoie une erreur explicite
  // plutôt que de faire un cadeau non autorisé. Le composant client doit alors
  // rejouer via /api/checkout ou /api/checkout/fedapay (rail réel).
  const seatCount = order.qty // isTable=false ici, donc qty === nombre de sièges
  const preorderTotalMinor = order.preorders.reduce((s, p) => s + p.price * p.qty, 0)
  const totalMinor = order.unitPriceMinor * seatCount + preorderTotalMinor + order.feeMinor
  if (totalMinor !== 0) {
    await releaseOrder(orderId, input.userId)
    return { ok: false, status: 400, error: 'not_free' }
  }

  const fulfillResult = await fulfillOrder(orderId, { rail: 'free' })
  if (fulfillResult.status !== 'ok') {
    // 'already_processed'/'locked' : rejeu concurrent improbable sur un Order
    // fraîchement créé (aucun webhook n'existe pour le rail 'free') — jamais
    // vu en pratique, mais on ne renvoie surtout pas un faux succès.
    // 'refunded_cancelled_event' : l'événement a été annulé DANS la fenêtre
    // entre createOrder() et fulfillOrder() — l'Order est déjà marqué
    // 'cancelled' par fulfillOrder(), rien à restocker de plus ici.
    // 'amount_mismatch'/'order_not_found' : jamais atteignables sur le rail
    // 'free' (pas de vérification de montant externe, Order garanti exister).
    return { ok: false, status: 409, error: fulfillResult.status }
  }

  return { ok: true, orderId, eventId: order.eventId, ticketCodes: fulfillResult.ticketCodes }
}

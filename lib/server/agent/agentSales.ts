import mongoose from 'mongoose'
import { getDb } from '@/lib/db/mongoose'
import Event from '@/lib/models/Event'
import Order, { type OrderDoc } from '@/lib/models/Order'
import Ticket from '@/lib/models/Ticket'
import User from '@/lib/models/User'
import EventStaff from '@/lib/models/EventStaff'
import CashSaleSettlement from '@/lib/models/CashSaleSettlement'
import SellerBalance from '@/lib/models/SellerBalance'
import EventPayout from '@/lib/models/EventPayout'
import PaymentAlert from '@/lib/models/PaymentAlert'
import { computeTicketFeeCents, computeTicketFeeXOF } from '@/lib/shared/fees'
import { isEventEnded } from '@/lib/shared/event-time'
import { generateUniqueTicketCode } from '../events/ticketCode'
import { createTransaction, createToken, sendPaymentToUser, type MobileMoneyMode } from '../payments/fedapayClient'
import { notifyUserById } from '@/lib/server/emails/notify'
import { cashSalesBlockedEmail, cashSalePendingSettlementEmail } from '@/lib/server/emails'
import { fmtMoney } from '@/lib/shared/money'

const SITE = process.env.PUBLIC_SITE_URL || 'https://liveinblack.com'

// Vente hors-application via agent désigné (#C —
// LIVE_IN_BLACK_Achat_Tickets_Hors_Application_Version_Finale.docx). Rôle
// EventStaff 'vendeur' — jamais confondu avec User.roles:'agent' (staff LIVE
// IN BLACK, app/(app)/agent). Règle non négociable de la spec : le prix payé
// et la commission LIB sont TOUJOURS identiques à un achat in-app (mêmes
// lib/shared/fees.ts), qu'il s'agisse d'espèces ou de Mobile Money — aucun
// moyen de paiement ne doit permettre de contourner la commission.
//
// v1 — simplifications assumées (à faire évoluer avec le client) :
//  - Mobile Money : le client paie le montant TOTAL via FedaPay (mode
//    sans-redirection, sendPaymentToUser) exactement comme un achat in-app —
//    la commission est déjà intégrée au flux existant (settleOrder-like),
//    aucun mécanisme séparé n'est nécessaire pour ce rail.
//  - Espèces : AUCUN prélèvement carte/Mobile Money temps réel n'existe
//    aujourd'hui côté organisateur-payeur (l'infra actuelle ne gère que les
//    organisateurs comme BÉNÉFICIAIRES de versement, jamais comme payeurs
//    prélevables) — "instant_debit" est donc implémenté comme un débit
//    interne immédiat du solde SellerBalance de l'organisateur (réduit son
//    prochain versement d'autant), pas un vrai prélèvement carte en temps
//    réel. "agent_settles" est une confirmation déclarative de l'agent
//    (comme les règlements manuels déjà gérés dans lib/server/agentPayments.ts)
//    plutôt qu'un second flux de paiement carte dédié pour l'agent lui-même.
const AGENT_SALE_ORDER_TTL_MS = 24 * 60 * 60 * 1000 // 24h — le temps de régler une vente cash, pas 30min comme un panier client

// Seuil de blocage des ventes cash impayées (décision non tranchée par la
// spec — valeur v1 assumée, à ajuster avec le client selon le volume moyen
// d'un événement). Au-delà de ce nombre de CashSaleSettlement 'pending' pour
// un même agent, tous events confondus, l'agent doit régler avant de vendre
// à nouveau en espèces — le Mobile Money (réglé immédiatement via FedaPay)
// n'est jamais concerné.
const MAX_PENDING_CASH_SETTLEMENTS_PER_AGENT = 5

export interface AgentSaleCaller {
  id: string
}

type ErrResult = { ok: false; status: number; error: string }

class AgentSaleError extends Error {
  status: number
  code: string
  constructor(status: number, code: string) {
    super(code)
    this.status = status
    this.code = code
  }
}

async function assertSalesAgent(eventId: string, callerId: string) {
  const event = await Event.findById(eventId)
  if (!event) return { ok: false as const, status: 404, error: 'event_not_found' }
  if (event.organizerId === callerId || event.createdBy === callerId) return { ok: true as const, event }

  const staff = await EventStaff.findOne({ eventId }).lean()
  const roster = staff?.roster as Record<string, { role: string }> | undefined
  if (roster?.[callerId]?.role === 'vendeur') return { ok: true as const, event }

  return { ok: false as const, status: 403, error: 'forbidden' }
}

export interface SellTicketInput {
  placeId: string
  qty: number
  isTable: boolean
  guestName?: string
  contactEmail?: string
  contactPhone?: string
  method: 'cash' | 'momo'
  momoMode?: MobileMoneyMode
  momoPhone?: { number: string; country: string }
  settlementMode?: 'instant_debit' | 'agent_settles'
  preorders?: Array<{ name: string; qty: number }>
}

export type SellTicketResult =
  | ErrResult
  | { ok: true; orderId: string; status: 'paid' | 'pending_cash_settlement' | 'pending_momo_confirmation'; ticketCodes: string[] }

async function createAgentSaleOrder(
  agentCaller: AgentSaleCaller,
  eventId: string,
  input: SellTicketInput,
  opts: { atDoor: boolean }
): Promise<{ ok: true; order: OrderDoc & { _id: mongoose.Types.ObjectId } } | ErrResult> {
  await getDb()

  const guard = await assertSalesAgent(eventId, agentCaller.id)
  if (!guard.ok) return guard
  const { event } = guard

  if (event.cancelled) return { ok: false, status: 409, error: 'event_cancelled' }
  if (isEventEnded(event)) return { ok: false, status: 409, error: 'event_ended' }
  if (!input.contactEmail?.trim() && !input.contactPhone?.trim()) return { ok: false, status: 400, error: 'contact_required' }

  const place = event.places?.find((p) => p.id === input.placeId)
  if (!place) return { ok: false, status: 404, error: 'place_not_found' }

  const isTable = Boolean(input.isTable)
  if (isTable && !(place.groupType === 'group' && (place.groupMax || 0) >= 2)) {
    return { ok: false, status: 400, error: 'not_a_group_place' }
  }
  // Vente à l'entrée : une seule place, jamais de groupe ni de précommande —
  // "afin d'éviter d'attendre l'envoi d'un QR code" (spec §1.3).
  const qty = opts.atDoor ? 1 : Math.max(1, Math.min(20, Math.floor(Number(input.qty) || 1)))
  if (opts.atDoor && isTable) return { ok: false, status: 400, error: 'no_group_at_door' }
  const preorders = opts.atDoor ? [] : input.preorders || []

  const currency = event.currency === 'XOF' ? 'XOF' : 'EUR'
  if (input.method === 'momo' && currency !== 'XOF') return { ok: false, status: 400, error: 'momo_requires_xof_event' }
  const minorPerMajor = currency === 'XOF' ? 1 : 100
  const unitPriceMinor = Math.round(Number(place.price) * minorPerMajor)

  const resolvedPreorders: Array<{ name: string; price: number; qty: number }> = []
  for (const req of preorders) {
    const menuItem = event.menu?.find((item) => item.name === req.name)
    if (!menuItem || menuItem.available === false) return { ok: false, status: 400, error: `unknown_menu_item:${req.name}` }
    const reqQty = Math.max(0, Math.min(50, Math.floor(Number(req.qty) || 0)))
    if (reqQty <= 0) continue
    resolvedPreorders.push({ name: menuItem.name, price: Math.round(Number(menuItem.price) * minorPerMajor), qty: reqQty })
  }

  const feeMinor = currency === 'XOF' ? computeTicketFeeXOF(unitPriceMinor, isTable ? 1 : qty) : computeTicketFeeCents(unitPriceMinor, isTable ? 1 : qty)
  const totalRequestedStock = isTable ? 1 : qty

  const session = await mongoose.startSession()
  try {
    let created: (OrderDoc & { _id: mongoose.Types.ObjectId }) | null = null
    await session.withTransaction(async () => {
      const freshEvent = await Event.findById(eventId).session(session)
      if (!freshEvent) throw new AgentSaleError(404, 'event_not_found')
      const freshPlace = freshEvent.places?.find((p) => p.id === input.placeId)
      if (!freshPlace) throw new AgentSaleError(404, 'place_not_found')
      if ((freshPlace.available || 0) < totalRequestedStock) throw new AgentSaleError(409, 'insufficient_stock')

      freshPlace.available = (freshPlace.available || 0) - totalRequestedStock
      await freshEvent.save({ session })

      const [doc] = await Order.create(
        [
          {
            userId: agentCaller.id, // rattachement technique requis par le schéma — jamais le titulaire réel, voir guestName/contact*
            eventId,
            placeId: input.placeId,
            placeType: freshPlace.type,
            qty,
            isTable,
            tableSeats: isTable ? freshPlace.groupMax : 0,
            unitPriceMinor,
            currency,
            feeMinor,
            preorders: resolvedPreorders,
            rail: input.method === 'cash' ? 'cash' : 'fedapay',
            status: 'pending',
            kind: 'agent_sale',
            agentUid: agentCaller.id,
            guestName: input.guestName?.trim().slice(0, 120) || null,
            contactEmail: input.contactEmail?.trim().toLowerCase() || null,
            contactPhone: input.contactPhone?.trim() || null,
            stockDecremented: true,
            expiresAt: new Date(Date.now() + AGENT_SALE_ORDER_TTL_MS),
          },
        ],
        { session }
      )
      created = doc as OrderDoc & { _id: mongoose.Types.ObjectId }
    })
    if (!created) throw new AgentSaleError(500, 'order_creation_failed')
    return { ok: true, order: created }
  } catch (err) {
    if (err instanceof AgentSaleError) return { ok: false, status: err.status, error: err.code }
    console.error('[agentSales] createAgentSaleOrder transaction failed:', err)
    return { ok: false, status: 500, error: 'internal_error' }
  } finally {
    await session.endSession()
  }
}

async function mintAgentSaleTickets(order: OrderDoc & { _id: mongoose.Types.ObjectId }, opts: { checkInImmediately: boolean }): Promise<string[]> {
  const event = await Event.findById(order.eventId).lean()
  const seatCount = order.isTable ? order.tableSeats : order.qty
  const tableId = order.isTable ? `tbl_agent_${order._id.toString()}` : null
  const unitMajor = order.unitPriceMinor / (order.currency === 'XOF' ? 1 : 100)
  const preorderTotalMajor = order.preorders.reduce((s, p) => s + (p.price / (order.currency === 'XOF' ? 1 : 100)) * p.qty, 0)

  // Rattachement au VRAI compte du client si l'email saisi par l'agent
  // correspond à un compte déjà inscrit (#E11, confirmé en réunion live le
  // 11/08/2026 — auparavant toujours rattaché à l'agent, billet invité
  // orphelin même quand un compte existait). `guestName` reste renseigné
  // dans tous les cas (traçabilité), mais `userId` pointe le vrai titulaire
  // dès qu'on peut le résoudre, comme un achat in-app normal (visible dans
  // TicketWallet.tsx du client). Groupe : `hostUid` reste volontairement
  // l'agent (décision produit déjà confirmée séparément le 25/07/2026 —
  // l'agent désigne le premier participant nommé comme hôte technique, pas
  // ce lookup par email).
  const fallbackUserId = order.agentUid || order.userId
  let resolvedUserId = fallbackUserId
  if (order.contactEmail) {
    const account = await User.findOne({ email: order.contactEmail }).select('_id').lean()
    if (account) resolvedUserId = String(account._id)
  }

  const ticketCodes: string[] = []
  const now = new Date()
  const docs = []
  for (let seatIndex = 0; seatIndex < seatCount; seatIndex++) {
    const code = await generateUniqueTicketCode()
    ticketCodes.push(code)
    docs.push({
      ticketCode: code,
      orderId: order._id.toString(),
      eventId: order.eventId,
      eventName: event?.name || '',
      eventDate: event?.date || '',
      place: order.placeType,
      placePrice: unitMajor,
      totalPrice: seatIndex === 0 ? unitMajor + preorderTotalMajor : unitMajor,
      currency: order.currency,
      preorders: seatIndex === 0 ? order.preorders.map((p) => ({ name: p.name, price: p.price / (order.currency === 'XOF' ? 1 : 100), qty: p.qty })) : [],
      // Rattaché au vrai compte du client si résolu ci-dessus, sinon
      // rattachement technique à l'agent (comme lib/server/guestlist.ts pour
      // un invité sans compte) — voir commentaire au-dessus de ce bloc.
      userId: resolvedUserId,
      hostUid: order.isTable ? fallbackUserId : null,
      tableId,
      seatIndex: order.isTable ? seatIndex : null,
      guestName: order.guestName,
      revoked: false,
      paid: true,
      source: order.rail === 'cash' ? 'agent_cash' : 'agent_momo',
      fedapayTransactionId: order.fedapayTxnId || null,
      bookedAt: now,
      checkedInAt: opts.checkInImmediately ? now : null,
    })
  }
  await Ticket.insertMany(docs)
  return ticketCodes
}

// ─────────────────────────────── sellTicketOnSite ───────────────────────────
export async function sellTicketOnSite(agentCaller: AgentSaleCaller, eventId: string, input: SellTicketInput): Promise<SellTicketResult> {
  return processSale(agentCaller, eventId, input, { atDoor: false })
}

// ─────────────────────────────── sellTicketAtDoor ───────────────────────────
// Une place, aucune précommande, check-in immédiat (spec §1.3 : évite
// d'attendre l'envoi/scan d'un QR alors que le client est déjà à l'entrée).
export async function sellTicketAtDoor(agentCaller: AgentSaleCaller, eventId: string, input: Omit<SellTicketInput, 'qty' | 'isTable' | 'preorders'>): Promise<SellTicketResult> {
  return processSale(agentCaller, eventId, { ...input, qty: 1, isTable: false }, { atDoor: true })
}

async function processSale(agentCaller: AgentSaleCaller, eventId: string, input: SellTicketInput, opts: { atDoor: boolean }): Promise<SellTicketResult> {
  const orderResult = await createAgentSaleOrder(agentCaller, eventId, input, opts)
  if (!orderResult.ok) return orderResult
  const order = orderResult.order

  if (input.method === 'momo') {
    // createAgentSaleOrder a déjà décrémenté le stock (place.available) et
    // sauvegardé l'event AVANT ce bloc — toute sortie sans passer par
    // releaseAgentSaleOrder laisse ce siège définitivement invendable (bug
    // confirmé par audit : un numéro Momo vide ou un échec FedaPay
    // consommait une place sans jamais la restituer, sans cron pour la
    // récupérer — l'index TTL d'Order ne couvre que status:'expired').
    if (!input.momoMode || !input.momoPhone || !input.momoPhone.number?.trim()) {
      await releaseAgentSaleOrder(String(order._id))
      return { ok: false, status: 400, error: 'momo_phone_required' }
    }
    try {
      const txn = await createTransaction({
        description: `${order.placeType} — vente agent`.slice(0, 200),
        amount: order.unitPriceMinor * (order.isTable ? 1 : order.qty) + order.preorders.reduce((s, p) => s + p.price * p.qty, 0) + order.feeMinor,
        metadata: { orderId: String(order._id) },
        reference: String(order._id),
      })
      const tok = await createToken(txn.id)
      if (!tok.token) throw new Error('fedapay_token_missing')
      await Order.updateOne({ _id: order._id }, { $set: { fedapayTxnId: String(txn.id) } })
      await sendPaymentToUser(tok.token, input.momoMode, input.momoPhone)
      return { ok: true, orderId: String(order._id), status: 'pending_momo_confirmation', ticketCodes: [] }
    } catch (err) {
      console.error('[agentSales] momo send failed:', err)
      await releaseAgentSaleOrder(String(order._id))
      return { ok: false, status: 502, error: 'fedapay_error' }
    }
  }

  // Espèces — la vente reste "en attente de règlement" tant que la part LIB
  // n'est pas sécurisée (règle finale non négociable de la spec §2).
  const pendingCount = await CashSaleSettlement.countDocuments({ agentUid: agentCaller.id, status: 'pending' })
  if (pendingCount >= MAX_PENDING_CASH_SETTLEMENTS_PER_AGENT) {
    await releaseAgentSaleOrder(String(order._id))
    // Alerte déjà active pour cet agent ? Sert aussi à ne pas ré-envoyer un
    // email à CHAQUE tentative de vente bloquée tant qu'il n'a rien réglé —
    // un seul email au moment où le blocage démarre.
    const alreadyAlerted = await PaymentAlert.exists({ key: `cash_sale_agent_blocked_${agentCaller.id}` })
    await PaymentAlert.updateOne(
      { key: `cash_sale_agent_blocked_${agentCaller.id}` },
      { $set: { reason: 'cash_sale_too_many_unpaid', eventId, sellerUid: agentCaller.id, details: { pendingCount } } },
      { upsert: true }
    )
    if (!alreadyAlerted) {
      await notifyUserById(agentCaller.id, () => cashSalesBlockedEmail(pendingCount, `${SITE}/agent`, SITE))
    }
    return { ok: false, status: 409, error: 'too_many_unpaid_cash_sales' }
  }

  const seatCount = order.isTable ? 1 : order.qty
  const preorderTotal = order.preorders.reduce((s, p) => s + p.price * p.qty, 0)
  const amountTotalMinor = order.unitPriceMinor * seatCount + preorderTotal + order.feeMinor
  const settlementMode = input.settlementMode || 'agent_settles'

  // organizerId||createdBy — même repli que assertSalesAgent/checkinTicket
  // (un event peut n'avoir que createdBy renseigné). Sans le repli, le
  // règlement s'enregistrait avec organizerId:'' — le check de solde
  // (trySettleCash) lisait alors SellerBalance{sellerUid:''} (toujours à 0,
  // vente bloquée en pending_cash_settlement) et, en mode agent_settles, la
  // recette organisateur était créditée sur ce solde fantôme, impossible à
  // reverser à personne (bug confirmé par audit).
  const eventOwner = await Event.findById(eventId).select('organizerId createdBy').lean()
  const organizerId = eventOwner?.organizerId || eventOwner?.createdBy || ''
  if (!organizerId) {
    await releaseAgentSaleOrder(String(order._id))
    return { ok: false, status: 500, error: 'organizer_unresolved' }
  }

  await CashSaleSettlement.create({
    orderId: String(order._id),
    eventId,
    agentUid: agentCaller.id,
    organizerId,
    amountTotalMinor,
    currency: order.currency,
    libShareMinor: order.feeMinor,
    organizerShareMinor: amountTotalMinor - order.feeMinor,
    settlementMode,
  })

  const settleResult = await trySettleCash(String(order._id), agentCaller.id)
  if (settleResult.ok && settleResult.settled) {
    return { ok: true, orderId: String(order._id), status: 'paid', ticketCodes: settleResult.ticketCodes }
  }
  return { ok: true, orderId: String(order._id), status: 'pending_cash_settlement', ticketCodes: [] }
}

// ─────────────────────────────── trySettleCash ──────────────────────────────
type SettleCashResult = { ok: true; settled: boolean; ticketCodes: string[] } | ErrResult

async function trySettleCash(orderId: string, callerId: string): Promise<SettleCashResult> {
  await getDb()
  const settlement = await CashSaleSettlement.findOne({ orderId })
  if (!settlement) return { ok: false, status: 404, error: 'settlement_not_found' }
  if (settlement.status === 'settled') {
    const order = await Order.findById(orderId).lean()
    const tickets = await Ticket.find({ orderId }).select('ticketCode').lean()
    return { ok: true, settled: true, ticketCodes: order ? tickets.map((t) => t.ticketCode) : [] }
  }
  if (settlement.status !== 'pending') return { ok: true, settled: false, ticketCodes: [] }

  if (settlement.settlementMode === 'instant_debit') {
    const field = settlement.currency === 'XOF' ? 'amountDueXOF' : 'amountDueCents'
    const balance = await SellerBalance.findOne({ sellerUid: settlement.organizerId }).lean()
    const available = (balance?.[field as 'amountDueXOF' | 'amountDueCents'] as number | undefined) || 0
    if (available < settlement.libShareMinor) {
      await PaymentAlert.updateOne(
        { key: `cash_sale_low_balance_${settlement.organizerId}` },
        { $set: { reason: 'cash_sale_insufficient_organizer_balance', eventId: settlement.eventId, sellerUid: settlement.organizerId, details: { orderId, needed: settlement.libShareMinor, available } } },
        { upsert: true }
      )
      return { ok: true, settled: false, ticketCodes: [] }
    }
    await SellerBalance.updateOne({ sellerUid: settlement.organizerId }, { $inc: { [field]: -settlement.libShareMinor } }, { upsert: true })
  }
  // 'agent_settles' : confirmation déclarative de l'agent (voir en-tête de
  // fichier) — rien à prélever ici, l'appel à settleCashSale() suffit.

  const order = await Order.findById(orderId)
  if (!order) return { ok: false, status: 404, error: 'order_not_found' }

  const ticketCodes = await mintAgentSaleTickets(order, { checkInImmediately: order.qty === 1 && !order.isTable && order.preorders.length === 0 })
  order.paid = true
  order.status = 'paid'
  order.settled = true
  await order.save()

  if (settlement.organizerShareMinor > 0) {
    const field = settlement.currency === 'XOF' ? 'amountDueXOF' : 'amountDueCents'
    await SellerBalance.updateOne({ sellerUid: settlement.organizerId }, { $inc: { [field]: settlement.organizerShareMinor } }, { upsert: true })
  }

  settlement.status = 'settled'
  settlement.settledAt = new Date()
  settlement.settledVia = callerId
  await settlement.save()

  return { ok: true, settled: true, ticketCodes }
}

export type SettleCashSaleResult = ErrResult | { ok: true; settled: boolean; ticketCodes: string[] }

// Action explicite agent/organisateur : "Régler la vente" (mode
// agent_settles) ou nouvelle tentative de prélèvement (mode instant_debit
// après réapprovisionnement du solde organisateur).
export async function settleCashSale(caller: AgentSaleCaller, settlementId: string): Promise<SettleCashSaleResult> {
  await getDb()
  const settlement = await CashSaleSettlement.findById(settlementId).lean()
  if (!settlement) return { ok: false, status: 404, error: 'settlement_not_found' }

  const guard = await assertSalesAgent(settlement.eventId, caller.id)
  if (!guard.ok && caller.id !== settlement.organizerId) return { ok: false, status: 403, error: 'forbidden' }

  return trySettleCash(settlement.orderId, caller.id)
}

// ─────────────────────────────── fulfillAgentSaleOrder ──────────────────────
// Appelée par le webhook FedaPay (order.kind === 'agent_sale', rail
// 'fedapay') — le client a validé sur son propre téléphone, la commission
// est déjà incluse dans le montant total réglé, exactement comme un achat
// in-app (aucun mécanisme de sécurisation séparé n'est nécessaire ici).
export type FulfillAgentSaleResult =
  | { status: 'already_processed' }
  | { status: 'order_not_found' }
  | { status: 'amount_mismatch' }
  | { status: 'ok'; ticketCodes: string[] }

export async function fulfillAgentSaleOrder(orderId: string, opts: { paidAmountMinor?: number } = {}): Promise<FulfillAgentSaleResult> {
  await getDb()
  const order = await Order.findById(orderId)
  if (!order || order.kind !== 'agent_sale' || order.rail !== 'fedapay') return { status: 'order_not_found' }
  if (order.paid) return { status: 'already_processed' }

  const seatCount = order.isTable ? 1 : order.qty
  const preorderTotal = order.preorders.reduce((s, p) => s + p.price * p.qty, 0)
  const expected = order.unitPriceMinor * seatCount + preorderTotal + order.feeMinor
  if (opts.paidAmountMinor !== undefined && opts.paidAmountMinor !== expected) return { status: 'amount_mismatch' }

  const ticketCodes = await mintAgentSaleTickets(order, { checkInImmediately: false })
  order.paid = true
  order.status = 'paid'
  order.settled = true
  await order.save()

  const sellerUid = (await Event.findById(order.eventId).select('organizerId createdBy').lean())?.organizerId
  const owedMinor = expected - order.feeMinor
  if (sellerUid && owedMinor > 0) {
    await SellerBalance.updateOne({ sellerUid }, { $inc: { amountDueXOF: owedMinor } }, { upsert: true })
    const event = await Event.findById(order.eventId).lean()
    await EventPayout.updateOne(
      { eventId: order.eventId },
      { $inc: { amountDueXOF: owedMinor }, $setOnInsert: { sellerUid, status: 'accumulating' }, $set: { momoCountry: momoCountryForRegion(event?.region) } },
      { upsert: true }
    )
  }

  return { status: 'ok', ticketCodes }
}

function momoCountryForRegion(region: string | null | undefined): string | null {
  if (!region) return null
  const key = region.trim().toLowerCase()
  const map: Record<string, string> = { togo: 'tg', 'bénin': 'bj', benin: 'bj', 'côte d’ivoire': 'ci', senegal: 'sn', 'sénégal': 'sn' }
  return map[key] || null
}

// Relâche le stock d'une vente agent jamais réglée (cash abandonné) ou dont
// le paiement Mobile Money a échoué/expiré — miroir de
// lib/server/orders.ts::releaseOrder.
export async function releaseAgentSaleOrder(orderId: string): Promise<{ ok: boolean }> {
  await getDb()
  const order = await Order.findById(orderId)
  if (!order || order.kind !== 'agent_sale' || order.status !== 'pending') return { ok: true }

  const session = await mongoose.startSession()
  try {
    await session.withTransaction(async () => {
      if (order.stockDecremented) {
        const event = await Event.findById(order.eventId).session(session)
        const place = event?.places?.find((p) => p.id === order.placeId)
        if (event && place) {
          const restock = order.isTable ? 1 : order.qty
          place.available = Math.min(place.total || 0, (place.available || 0) + restock)
          await event.save({ session })
        }
      }
      order.status = 'cancelled'
      await order.save({ session })
      await CashSaleSettlement.updateOne({ orderId }, { $set: { status: 'cancelled' } }, { session })
    })
  } finally {
    await session.endSession()
  }
  return { ok: true }
}

export interface AgentSalesDashboardView {
  totalSales: number
  cashPending: number
  cashSettled: number
  momoSales: number
}

export async function getAgentSalesDashboard(caller: AgentSaleCaller, eventId: string): Promise<ErrResult | { ok: true; view: AgentSalesDashboardView }> {
  await getDb()
  const guard = await assertSalesAgent(eventId, caller.id)
  if (!guard.ok) return guard

  const orders = await Order.find({ eventId, kind: 'agent_sale', agentUid: caller.id }).lean()
  const settlements = await CashSaleSettlement.find({ eventId, agentUid: caller.id }).lean()

  return {
    ok: true,
    view: {
      totalSales: orders.filter((o) => o.status === 'paid').length,
      cashPending: settlements.filter((s) => s.status === 'pending').length,
      cashSettled: settlements.filter((s) => s.status === 'settled').length,
      momoSales: orders.filter((o) => o.rail === 'fedapay' && o.status === 'paid').length,
    },
  }
}

// ─────────────────────── sendPendingCashSaleReminders ───────────────────────
// Rappel agent "règlement en attente depuis Xj" — voir
// app/api/cron/cash-sale-reminders/route.ts. `reminderSentAt` garantit un
// seul rappel par vente en attente, jamais réinitialisé (une relance
// répétée n'apporterait rien de plus qu'un seul rappel avant que le seuil de
// blocage à 5 — cashSalesBlockedEmail, déjà câblé — ne prenne le relais).
const PENDING_REMINDER_AFTER_MS = 2 * 24 * 60 * 60 * 1000 // 2 jours

export async function sendPendingCashSaleReminders(): Promise<{ reminded: number }> {
  await getDb()
  const threshold = new Date(Date.now() - PENDING_REMINDER_AFTER_MS)
  const pending = await CashSaleSettlement.find({ status: 'pending', reminderSentAt: null, createdAt: { $lte: threshold } }).lean()

  let reminded = 0
  for (const settlement of pending) {
    const claimed = await CashSaleSettlement.updateOne({ _id: settlement._id, reminderSentAt: null }, { $set: { reminderSentAt: new Date() } })
    if (claimed.modifiedCount !== 1) continue
    const event = await Event.findById(settlement.eventId).select('name').lean()
    const daysOverdue = Math.max(1, Math.round((Date.now() - settlement.createdAt!.getTime()) / (24 * 60 * 60 * 1000)))
    await notifyUserById(settlement.agentUid, () =>
      cashSalePendingSettlementEmail(
        event?.name || 'cet événement',
        fmtMoney(settlement.amountTotalMinor / (settlement.currency === 'XOF' ? 1 : 100), settlement.currency),
        daysOverdue,
        `${SITE}/agent`,
        SITE
      )
    )
    reminded += 1
  }
  return { reminded }
}

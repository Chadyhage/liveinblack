import mongoose from 'mongoose'
import { getDb } from '../db/mongoose'
import Event from '../models/Event'
import User from '../models/User'
import OrganizerProfile from '../models/OrganizerProfile'
import ProviderProfile from '../models/ProviderProfile'
import Order from '../models/Order'
import EventPayout from '../models/EventPayout'
import EventRefund from '../models/EventRefund'
import PayoutRequest from '../models/PayoutRequest'
import SellerBalance from '../models/SellerBalance'
import PaymentAlert from '../models/PaymentAlert'

// Port de la couche de supervision agent des 3 onglets legacy 'reversements'
// / 'remboursements' / 'paiements' (src/pages/AgentPage.jsx), fusionnés en un
// seul panneau (#9 phase agent/admin, tâche #102). Toute la logique métier —
// calcul des soldes, décrément atomique, garde anti double-versement — vit
// déjà dans lib/server/{eventPayouts,eventRefunds,fedapayRefunds,organizerPayouts}.ts
// et dans les modèles EventPayout/EventRefund/PayoutRequest/SellerBalance/
// PaymentAlert. Ce module ne fait QUE lire ces sources de vérité existantes
// et écrire les quelques transitions de statut qu'un agent humain doit
// déclencher à la main : versement XOF auto en échec (filet, exact pendant
// de api/admin-accounts.js:mark_payout_paid), reversement EUR/ledger hors
// Stripe Connect (organizerPayouts.ts:requestManualPayout n'a pas d'équivalent
// de règlement côté agent — comblé ici), remboursement FedaPay manuel, clôture
// d'alerte de paiement.
//
// Contrôle « appelant == agent » fait à la couche route (requireAgent,
// lib/server/agentGuard.ts) — ces fonctions font confiance à `agent`, comme
// partout ailleurs dans ce port.

export interface AgentCaller {
  id: string
  name: string
}

type ErrResult = { ok: false; status: number; error: string }

async function resolveSellerNames(sellerUids: string[]): Promise<Map<string, { name: string; email: string }>> {
  const ids = [...new Set(sellerUids.filter(Boolean))]
  const out = new Map<string, { name: string; email: string }>()
  if (ids.length === 0) return out

  const [users, orgProfiles, providerProfiles] = await Promise.all([
    User.find({ _id: { $in: ids } }).select('email firstName lastName').lean(),
    OrganizerProfile.find({ userId: { $in: ids } }).select('userId publicName').lean(),
    ProviderProfile.find({ userId: { $in: ids } }).select('userId name').lean(),
  ])
  const userById = new Map(users.map((u) => [String(u._id), u]))
  const orgNameByUid = new Map(orgProfiles.map((p) => [p.userId, p.publicName]))
  const providerNameByUid = new Map(providerProfiles.map((p) => [p.userId, p.name]))

  for (const uid of ids) {
    const user = userById.get(uid)
    const name = orgNameByUid.get(uid) || providerNameByUid.get(uid) || [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || uid
    out.set(uid, { name, email: user?.email ?? '' })
  }
  return out
}

// ──────────────────────── Reversements (queue de versements) ───────────────

export interface AgentFailedPayoutView {
  eventId: string
  eventName: string
  sellerUid: string
  sellerName: string
  sellerEmail: string
  amountDueXOF: number
  failReason: string | null
  eventCancelled: boolean // recette due aux acheteurs (remboursements), jamais à verser
}

export interface AgentPayoutRequestView {
  requestId: string
  sellerUid: string
  sellerName: string
  sellerEmail: string
  requestedAt: string
  amountDueCents: number // solde RÉEL du ledger (source de vérité), pas le montant demandé
  amountDueXOF: number
  payCents: number // montant qui sera effectivement réglé si l'agent confirme
  mismatch: boolean // le montant demandé dépasse le solde réel
}

export interface AgentSellerBalanceView {
  sellerUid: string
  sellerName: string
  sellerEmail: string
  amountDueCents: number
  amountDueXOF: number
}

export interface AgentPayoutsQueueView {
  failedPayouts: AgentFailedPayoutView[]
  payoutRequests: AgentPayoutRequestView[]
  balancesNoReq: AgentSellerBalanceView[]
}

export async function listPendingPayoutsForAgent(): Promise<AgentPayoutsQueueView> {
  await getDb()

  const [failed, requests, balances] = await Promise.all([
    EventPayout.find({ status: 'failed' }).sort({ updatedAt: -1 }).lean(),
    PayoutRequest.find({ status: 'pending' }).sort({ createdAt: 1 }).lean(),
    SellerBalance.find({ $or: [{ amountDueCents: { $gt: 0 } }, { amountDueXOF: { $gt: 0 } }] }).lean(),
  ])

  const sellerUids = [...new Set([...failed.map((f) => f.sellerUid), ...requests.map((r) => r.sellerUid), ...balances.map((b) => b.sellerUid)])]
  // Un eventId de EventPayout survit à la suppression de l'Event (recette
  // due aux acheteurs, jamais nettoyée) : peut donc ne plus être un ObjectId
  // castable — filtrer avant le $in sous peine de CastError sur toute la queue.
  const eventIds = [...new Set(failed.map((f) => f.eventId))].filter((id) => mongoose.isValidObjectId(id))
  const [names, events] = await Promise.all([
    resolveSellerNames(sellerUids),
    eventIds.length ? Event.find({ _id: { $in: eventIds } }).select('name cancelled').lean() : Promise.resolve([]),
  ])
  const eventById = new Map(events.map((e) => [String(e._id), e]))
  const balanceBySeller = new Map(balances.map((b) => [b.sellerUid, b]))

  const failedPayouts: AgentFailedPayoutView[] = failed.map((f) => {
    const event = eventById.get(f.eventId)
    const who = names.get(f.sellerUid)
    return {
      eventId: f.eventId,
      eventName: event?.name ?? f.eventId,
      sellerUid: f.sellerUid,
      sellerName: who?.name ?? f.sellerUid,
      sellerEmail: who?.email ?? '',
      amountDueXOF: Math.max(0, Math.round(Number(f.amountDueXOF || 0))),
      failReason: f.failReason ?? null,
      // Événement supprimé = même garde que 'annulé' (voir markPayoutPaid) :
      // sa recette rembourse les acheteurs, jamais versée à l'organisateur.
      eventCancelled: !event || event.cancelled === true,
    }
  })

  const requestedSellerIds = new Set(requests.map((r) => r.sellerUid))

  const payoutRequests: AgentPayoutRequestView[] = requests.map((r) => {
    const ledger = balanceBySeller.get(r.sellerUid)
    const dueCents = Math.max(0, Number(ledger?.amountDueCents || 0))
    const dueXOF = Math.max(0, Number(ledger?.amountDueXOF || 0))
    const requestedCents = Math.max(0, Number(r.amountDueCents || 0))
    const who = names.get(r.sellerUid)
    return {
      requestId: String(r._id),
      sellerUid: r.sellerUid,
      sellerName: who?.name ?? r.sellerUid,
      sellerEmail: who?.email ?? '',
      requestedAt: new Date(r.createdAt as unknown as string).toISOString(),
      amountDueCents: dueCents,
      amountDueXOF: dueXOF,
      payCents: Math.min(requestedCents || dueCents, dueCents),
      mismatch: requestedCents > dueCents,
    }
  })

  const balancesNoReq: AgentSellerBalanceView[] = balances
    .filter((b) => !requestedSellerIds.has(b.sellerUid))
    .map((b) => {
      const who = names.get(b.sellerUid)
      return {
        sellerUid: b.sellerUid,
        sellerName: who?.name ?? b.sellerUid,
        sellerEmail: who?.email ?? '',
        amountDueCents: Math.max(0, Number(b.amountDueCents || 0)),
        amountDueXOF: Math.max(0, Number(b.amountDueXOF || 0)),
      }
    })

  return { failedPayouts, payoutRequests, balancesNoReq }
}

// ── Solder à la main UN versement auto XOF EN ÉCHEC (le filet) ──────────────
// Pendant exact de api/admin-accounts.js:mark_payout_paid (legacy). Décrémente
// les DEUX ledgers en une transaction : EventPayout.amountDueXOF → 0,
// status 'paid' (le cron ne le retouche plus) ; SellerBalance.amountDueXOF
// clampé à 0. Ne solde QUE des enveloppes 'failed' — une enveloppe
// accumulating/paying est en versement AUTO, la solder ici = double versement.
export type MarkPayoutPaidResult = ErrResult | { ok: true; paid: number }

export async function markPayoutPaid(agent: AgentCaller, eventId: string): Promise<MarkPayoutPaidResult> {
  await getDb()

  // Un event ANNULÉ ou SUPPRIMÉ ne se verse JAMAIS à l'organisateur : sa
  // recette sert à rembourser les acheteurs (voir listRefundAlertsForAgent).
  const event = await Event.findById(eventId).select('cancelled').lean()
  if (!event) return { ok: false, status: 409, error: 'event_gone' }
  if (event.cancelled === true) return { ok: false, status: 409, error: 'event_cancelled' }

  const session = await mongoose.startSession()
  let outcome: MarkPayoutPaidResult = { ok: false, status: 500, error: 'internal' }
  try {
    await session.withTransaction(async () => {
      const ep = await EventPayout.findOne({ eventId }).session(session)
      if (!ep) {
        outcome = { ok: false, status: 404, error: 'not_found' }
        return
      }
      if (ep.status !== 'failed') {
        outcome = { ok: false, status: 409, error: 'not_failed' }
        return
      }
      const amount = Math.max(0, Math.round(Number(ep.amountDueXOF || 0)))
      if (amount <= 0) {
        await EventPayout.updateOne({ _id: ep._id }, { $set: { amountDueXOF: 0, status: 'paid' } }, { session })
        outcome = { ok: true, paid: 0 }
        return
      }
      // Pipeline update (clamp $max) + upsert : $set explicite de sellerUid
      // car un update-pipeline n'auto-remplit PAS les champs de la requête
      // sur upsert (contrairement à un update classique par opérateurs).
      await SellerBalance.updateOne(
        { sellerUid: ep.sellerUid },
        [{ $set: { sellerUid: ep.sellerUid, amountDueXOF: { $max: [0, { $subtract: [{ $ifNull: ['$amountDueXOF', 0] }, amount] }] } } }],
        { session, upsert: true, updatePipeline: true }
      )
      await EventPayout.updateOne({ _id: ep._id }, { $set: { amountDueXOF: 0, status: 'paid' } }, { session })
      outcome = { ok: true, paid: amount }
    })
  } finally {
    await session.endSession()
  }

  // `outcome` est réassigné DANS la closure passée à withTransaction — TS
  // restreint (à tort) son type à `never` juste après (limitation connue de
  // l'analyse de flux sur un `let` muté depuis une closure) : recast explicite.
  const result = outcome as MarkPayoutPaidResult
  if (result.ok) console.log(`[agentPayments] ${agent.name} a soldé le versement XOF de l'event ${eventId} (${result.paid} FCFA)`)
  return result
}

// ── Régler à la main un solde vendeur EUR/ledger (hors Stripe Connect) ──────
// organizerPayouts.ts:requestManualPayout crée la demande côté vendeur, mais
// aucun flux ne la RÈGLE — comblé ici, pendant serveur de handleMarkPaid
// (legacy AgentPage.jsx) : montant plafonné au solde RÉEL du ledger (une
// demande est écrite par le vendeur, jamais fiable seule), clôture la
// PayoutRequest associée si fournie.
export type MarkSellerBalancePaidResult = ErrResult | { ok: true; paid: number }

export async function markSellerBalancePaid(
  agent: AgentCaller,
  input: { sellerUid: string; amount: number; currency: 'EUR' | 'XOF'; requestId?: string | null }
): Promise<MarkSellerBalancePaidResult> {
  await getDb()

  const sellerUid = input.sellerUid?.trim()
  if (!sellerUid) return { ok: false, status: 400, error: 'missing_seller' }
  const amt = Math.abs(Math.round(Number(input.amount) || 0))
  const field = input.currency === 'XOF' ? 'amountDueXOF' : 'amountDueCents'

  // Demande au solde déjà nul : on clôt la demande sans toucher au ledger.
  if (amt <= 0) {
    if (!input.requestId) return { ok: false, status: 400, error: 'nothing_to_settle' }
    const closed = await PayoutRequest.updateOne(
      { _id: input.requestId, status: 'pending' },
      { $set: { status: 'paid', paidAt: new Date(), paidBy: agent.id, paidAmount: 0, paidCurrency: input.currency } }
    )
    if (closed.matchedCount === 0) return { ok: false, status: 409, error: 'request_not_pending' }
    return { ok: true, paid: 0 }
  }

  const session = await mongoose.startSession()
  let outcome: MarkSellerBalancePaidResult = { ok: false, status: 500, error: 'internal' }
  try {
    await session.withTransaction(async () => {
      const balance = await SellerBalance.findOne({ sellerUid }).session(session)
      const due = Math.max(0, Number(balance?.[field] ?? 0))
      const toPay = Math.min(amt, due)
      if (toPay > 0) {
        await SellerBalance.updateOne({ sellerUid }, { $inc: { [field]: -toPay } }, { session })
      }
      if (input.requestId) {
        await PayoutRequest.updateOne(
          { _id: input.requestId, status: 'pending' },
          { $set: { status: 'paid', paidAt: new Date(), paidBy: agent.id, paidAmount: toPay, paidCurrency: input.currency } },
          { session }
        )
      }
      outcome = { ok: true, paid: toPay }
    })
  } finally {
    await session.endSession()
  }

  // Voir le commentaire équivalent dans markPayoutPaid : recast explicite
  // après réassignation de `outcome` depuis la closure withTransaction.
  const result = outcome as MarkSellerBalancePaidResult
  if (result.ok) console.log(`[agentPayments] ${agent.name} a réglé ${result.paid} (${input.currency}) à ${sellerUid}`)
  return result
}

// ──────────────────────── Remboursements FedaPay manuels ───────────────────

export interface AgentRefundAlertView {
  id: string
  eventId: string
  eventName: string
  paymentRef: string
  amountXOF: number
  buyerEmail: string
  createdAt: string
}

export async function listRefundAlertsForAgent(): Promise<AgentRefundAlertView[]> {
  await getDb()

  // FedaPay n'a pas d'API de remboursement (voir fedapayRefunds.ts) : toute
  // entrée 'pending_manual' est, par construction, sur le rail 'fedapay'.
  const refunds = await EventRefund.find({ rail: 'fedapay', status: 'pending_manual' }).sort({ createdAt: -1 }).lean()
  if (refunds.length === 0) return []

  const eventIds = [...new Set(refunds.map((r) => r.eventId))]
  const paymentRefs = refunds.map((r) => r.paymentRef)
  const [events, orders] = await Promise.all([
    Event.find({ _id: { $in: eventIds } }).select('name').lean(),
    Order.find({ fedapayTxnId: { $in: paymentRefs } }).select('fedapayTxnId userId').lean(),
  ])
  const eventById = new Map(events.map((e) => [String(e._id), e]))
  const orderByRef = new Map(orders.map((o) => [String(o.fedapayTxnId), o]))
  const userIds = [...new Set(orders.map((o) => o.userId))]
  const users = userIds.length ? await User.find({ _id: { $in: userIds } }).select('email').lean() : []
  const userById = new Map(users.map((u) => [String(u._id), u]))

  return refunds.map((r) => {
    const order = orderByRef.get(r.paymentRef)
    const user = order ? userById.get(order.userId) : null
    return {
      id: String(r._id),
      eventId: r.eventId,
      eventName: eventById.get(r.eventId)?.name ?? r.eventId,
      paymentRef: r.paymentRef,
      amountXOF: Math.max(0, Math.round(Number(r.amountMinor || 0))),
      buyerEmail: user?.email ?? '',
      createdAt: new Date(r.createdAt as unknown as string).toISOString(),
    }
  })
}

// Marque un remboursement FedaPay comme FAIT — l'agent l'a exécuté à la main
// dans le dashboard FedaPay (pas d'API de remboursement côté FedaPay).
export type CompleteManualRefundResult = ErrResult | { ok: true }

export async function completeManualRefund(agent: AgentCaller, refundId: string): Promise<CompleteManualRefundResult> {
  await getDb()

  const refund = await EventRefund.findById(refundId)
  if (!refund) return { ok: false, status: 404, error: 'not_found' }
  if (refund.status !== 'pending_manual') return { ok: false, status: 409, error: 'not_pending' }

  refund.status = 'refunded'
  refund.completedBy = agent.id
  refund.completedAt = new Date()
  await refund.save()
  return { ok: true }
}

// ──────────────────────────── Alertes paiement ──────────────────────────────

export interface AgentPaymentAlertView {
  id: string
  reason: string
  eventId: string | null
  eventName: string
  sellerUid: string | null
  sellerName: string
  sellerEmail: string
  details: Record<string, unknown>
  createdAt: string
}

export async function listPaymentAlertsForAgent(): Promise<AgentPaymentAlertView[]> {
  await getDb()

  const alerts = await PaymentAlert.find({ resolved: false }).sort({ createdAt: -1 }).lean()
  if (alerts.length === 0) return []

  const eventIds = [...new Set(alerts.map((a) => a.eventId).filter((v): v is string => Boolean(v)))]
  const sellerUids = [...new Set(alerts.map((a) => a.sellerUid).filter((v): v is string => Boolean(v)))]
  const [events, names] = await Promise.all([
    eventIds.length ? Event.find({ _id: { $in: eventIds } }).select('name').lean() : Promise.resolve([]),
    resolveSellerNames(sellerUids),
  ])
  const eventById = new Map(events.map((e) => [String(e._id), e]))

  return alerts.map((a) => {
    const who = a.sellerUid ? names.get(a.sellerUid) : undefined
    return {
      id: String(a._id),
      reason: a.reason,
      eventId: a.eventId ?? null,
      eventName: a.eventId ? eventById.get(a.eventId)?.name ?? a.eventId : '',
      sellerUid: a.sellerUid ?? null,
      sellerName: who?.name ?? '',
      sellerEmail: who?.email ?? '',
      details: (a.details as Record<string, unknown>) ?? {},
      createdAt: new Date(a.createdAt as unknown as string).toISOString(),
    }
  })
}

export type ResolvePaymentAlertResult = ErrResult | { ok: true }

export async function resolvePaymentAlert(agent: AgentCaller, alertId: string): Promise<ResolvePaymentAlertResult> {
  await getDb()

  const result = await PaymentAlert.updateOne(
    { _id: alertId, resolved: false },
    { $set: { resolved: true, resolvedBy: agent.id, resolvedAt: new Date() } }
  )
  if (result.matchedCount === 0) return { ok: false, status: 404, error: 'not_found_or_resolved' }
  return { ok: true }
}

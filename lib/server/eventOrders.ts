import crypto from 'node:crypto'
import mongoose, { type HydratedDocument } from 'mongoose'
import { getDb } from '../db/mongoose'
import Event, { type EventDoc } from '../models/Event'
import EventStaff from '../models/EventStaff'
import EventOrder, { type EventOrderDoc, type OrderItem } from '../models/EventOrder'
import EventOrderLog from '../models/EventOrderLog'
import Ticket from '../models/Ticket'
import User from '../models/User'

// Port de api/event-stock.js (action 'order') vers le modèle Mongo à un seul
// document EventOrder par événement (tableau `items` embarqué — voir
// lib/models/EventOrder.ts). Le modèle d'autorisation par RANG ci-dessous est
// repris FIDÈLEMENT du legacy (api/event-stock.js:115-126) ; seules trois
// choses changent délibérément par rapport au legacy (voir chaque endroit
// commenté) :
//   1. un rang 0 (simple client) ne peut plus attacher une ligne de commande
//      à un billet qui n'est pas le sien (lacune legacy jamais vérifiée à la
//      CRÉATION d'une ligne — seulement à l'édition) ;
//   2. la lecture des commandes est cloisonnée par ticket/événement selon le
//      rang (ferme l'audit H15 — le legacy laissait tout compte connecté lire
//      event_orders/{eventId} en entier) ;
//   3. le journal d'audit (EventOrderLog) n'a AUCUN chemin d'écriture client
//      direct — toute mutation passe par ce fichier, qui pousse lui-même son
//      entrée de journal (ferme l'audit H14).
//
// Note technique transversale : chaque mutation ci-dessous fait
// `outcome = await session.withTransaction(async () => { ...; return {...} })`
// plutôt que d'assigner une variable extérieure DEPUIS L'INTÉRIEUR du
// callback puis de la relire après coup — TypeScript ne propage pas le
// rétrécissement de type (narrowing) d'une réassignation faite à l'intérieur
// d'une fonction imbriquée vers le code qui suit son appel (le callback est
// une frontière opaque pour l'analyse de flux). En retournant la valeur
// depuis le callback et en laissant `withTransaction` la faire remonter (le
// driver MongoDB renvoie bien la valeur résolue du callback, cf.
// node_modules/mongodb/lib/sessions.js), l'affectation de `outcome` redevient
// une simple expression `await` directe, sans ce piège.

export interface OrderCaller {
  id: string
}

export interface EventOrderItemView {
  id: string
  menuItemId: string | null
  name: string
  quantity: number
  unitPriceMinor: number
  ticketId: string
  addedBy: string
  addedByName: string | null
  status: 'sent' | 'served' | 'cancelled'
  kind: 'order' | 'preorder' | 'included'
  servedAt: string | null
  servedBy: string | null
  servedByName: string | null
  paidAt: string | null
  paidBy: string | null
  paidByName: string | null
  cancelledAt: string | null
  cancelledBy: string | null
  cancellationReason: string | null
}

export interface EventOrderLogEntryView {
  id: string
  ts: string
  actorId: string
  actorName: string | null
  actorRole: string | null
  itemId: string | null
  ticketId: string | null
  itemName: string | null
  action: string
  oldValue: unknown
  newValue: unknown
  amountMinor: number | null
  note: string | null
}

type ErrResult = { ok: false; status: number; error: string }

function toItemView(item: OrderItem): EventOrderItemView {
  return {
    id: item.id,
    menuItemId: item.menuItemId ?? null,
    name: item.name,
    quantity: item.quantity,
    unitPriceMinor: item.unitPriceMinor,
    ticketId: item.ticketId,
    addedBy: item.addedBy,
    addedByName: item.addedByName ?? null,
    status: (item.status ?? 'sent') as 'sent' | 'served' | 'cancelled',
    kind: (item.kind ?? 'order') as 'order' | 'preorder' | 'included',
    servedAt: item.servedAt ? new Date(item.servedAt).toISOString() : null,
    servedBy: item.servedBy ?? null,
    servedByName: item.servedByName ?? null,
    paidAt: item.paidAt ? new Date(item.paidAt).toISOString() : null,
    paidBy: item.paidBy ?? null,
    paidByName: item.paidByName ?? null,
    cancelledAt: item.cancelledAt ? new Date(item.cancelledAt).toISOString() : null,
    cancelledBy: item.cancelledBy ?? null,
    cancellationReason: item.cancellationReason ?? null,
  }
}

type StaffRoster = Record<string, { role: string }>

// Formule de rang EXACTE (api/event-stock.js:115-126) : propriétaire/créateur
// de l'événement → 3 ; sinon rôle du roster EventStaff → manager:3,
// serveur:2, scan:1 ; 'dj' ou absent du roster (simple client/titulaire de
// billet) → 0. `computeAuthContext` centralise cette formule ET le libellé de
// rôle utilisé pour le journal, pour n'avoir qu'une seule source de vérité —
// `resolveRank` (le helper au contrat exact demandé) n'en expose que le rang.
function computeAuthContext(
  callerId: string,
  event: Pick<EventDoc, 'organizerId' | 'createdBy'>,
  roster: StaffRoster | undefined
): { rank: number; role: string } {
  const isOwner = event.organizerId === callerId || event.createdBy === callerId
  if (isOwner) return { rank: 3, role: 'owner' }
  const staffRole = roster?.[callerId]?.role ?? null
  const rankByRole: Record<string, number> = { manager: 3, serveur: 2, scan: 1 }
  const rank = staffRole ? (rankByRole[staffRole] ?? 0) : 0
  return { rank, role: staffRole ?? 'client' }
}

function resolveRank(callerId: string, event: Pick<EventDoc, 'organizerId' | 'createdBy'>, roster: StaffRoster | undefined): number {
  return computeAuthContext(callerId, event, roster).rank
}

export type EventContext = { event: HydratedDocument<EventDoc>; rank: number; role: string }
export type EventContextResult = ErrResult | { ok: true; ctx: EventContext }

// Exportée (#7 phase organisateur) : lib/server/organizerEvents.ts réutilise
// EXACTEMENT cette même formule de rang pour les mutations d'événement
// (create/update/cancel/postpone/delete), plutôt que d'en réinventer une
// seconde qui pourrait diverger avec le temps.
export async function loadEventContext(eventId: string, callerId: string): Promise<EventContextResult> {
  const event = await Event.findById(eventId)
  if (!event) return { ok: false, status: 404, error: 'event_not_found' }
  const staffDoc = await EventStaff.findOne({ eventId }).lean()
  // .lean() renvoie un objet JS brut pour un champ Map (pas un vrai Map) —
  // même cast que ticketCheckin.ts.
  const roster = staffDoc?.roster as StaffRoster | undefined
  const rank = resolveRank(callerId, event, roster)
  const { role } = computeAuthContext(callerId, event, roster)
  return { ok: true, ctx: { event, rank, role } }
}

// ─────────────────────── getCallerEventRank (scanner) ───────────────────────

// Expose la formule de rang à un appelant EXTERNE (Server Component de
// app/(app)/scanner, qui n'a pas accès aux fonctions non-exportées de ce
// fichier) sans dupliquer `computeAuthContext`/`resolveRank` ci-dessus — donc
// aucun risque que les deux formules divergent un jour. Lecture seule, ne
// DÉCIDE rien : sert uniquement à gater l'affichage d'une page et à savoir
// quels contrôles staff montrer une fois dedans. Ne lève JAMAIS (eventId
// malformé, événement introuvable, aucun standing → 0) — contrairement à
// `loadEventContext`, qui laisse volontairement un `Event.findById` sur un id
// mal formé lever un CastError (les routes existantes tournent déjà toutes
// derrière un `try` implicite du framework Next ; ce nouvel appelant, lui, un
// Server Component sans error.tsx dédié, ne doit jamais crasher pour un id
// invalide dans l'URL).
export async function getCallerEventRank(callerId: string, eventId: string): Promise<number> {
  await getDb()
  if (!mongoose.isValidObjectId(eventId)) return 0
  const event = await Event.findById(eventId).lean()
  if (!event) return 0
  const staffDoc = await EventStaff.findOne({ eventId }).lean()
  const roster = staffDoc?.roster as StaffRoster | undefined
  return resolveRank(callerId, event, roster)
}

async function resolveCallerName(callerId: string): Promise<string | null> {
  const user = await User.findById(callerId).lean()
  if (!user) return null
  return `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email
}

async function getOrCreateOrder(eventId: string, session: mongoose.ClientSession): Promise<HydratedDocument<EventOrderDoc>> {
  const order = await EventOrder.findOneAndUpdate(
    { eventId },
    { $setOnInsert: { eventId, items: [] } },
    { upsert: true, new: true, session }
  )
  return order as HydratedDocument<EventOrderDoc>
}

// Journal (audit H14) : une entrée par mutation, poussée DANS la même
// transaction Mongo que la mutation elle-même (choix documenté) plutôt
// qu'après le commit — EventOrder et EventOrderLog sont deux
// documents/collections différents, et Mongo garantit l'atomicité
// multi-documents sur une transaction (le replica set est déjà requis
// ailleurs dans ce projet pour les transactions, cf. lib/server/orders.ts).
// Pousser APRÈS le commit risquerait un état "mutation appliquée mais jamais
// journalisée" si le process meurt entre les deux — inacceptable pour un
// journal de litiges. `$push` + upsert est un op Mongo atomique en une seule
// commande : aucun re-fetch nécessaire ici (contrairement aux mutations sur
// `items`, qui doivent relire l'état frais pour revérifier des préconditions).
async function appendLog(
  eventId: string,
  entry: {
    actorId: string
    actorName?: string | null
    actorRole?: string | null
    itemId?: string | null
    ticketId?: string | null
    itemName?: string | null
    action: string
    oldValue?: unknown
    newValue?: unknown
    amountMinor?: number | null
    note?: string | null
  },
  session: mongoose.ClientSession
): Promise<void> {
  const fullEntry = {
    id: crypto.randomBytes(12).toString('hex'),
    ts: new Date(),
    actorId: entry.actorId,
    actorName: entry.actorName ?? null,
    actorRole: entry.actorRole ?? null,
    itemId: entry.itemId ?? null,
    ticketId: entry.ticketId ?? null,
    itemName: entry.itemName ?? null,
    action: entry.action,
    oldValue: entry.oldValue ?? null,
    newValue: entry.newValue ?? null,
    amountMinor: entry.amountMinor ?? null,
    note: entry.note ?? null,
  }
  await EventOrderLog.findOneAndUpdate(
    { eventId },
    { $push: { entries: fullEntry }, $setOnInsert: { eventId } },
    { upsert: true, session }
  )
}

function sanitizedItemId(prefix: string, ticketCode: string, name: string): string {
  const raw = `${prefix}_${ticketCode}_${name.replace(/ /g, '_')}`
  return raw.slice(0, 90)
}

// ─────────────────────────────── addOrderItem ───────────────────────────────

export interface AddOrderItemInput {
  eventId: string
  ticketId: string
  menuItemId: string
  quantity: number
}

export type AddOrderItemResult = ErrResult | { ok: true; item: EventOrderItemView }

export async function addOrderItem(caller: OrderCaller, input: AddOrderItemInput): Promise<AddOrderItemResult> {
  await getDb()

  const eventId = input.eventId?.trim()
  const ticketCode = input.ticketId?.trim().toUpperCase()
  const menuItemId = input.menuItemId?.trim()
  const quantity = Math.floor(Number(input.quantity))
  if (!eventId || !ticketCode || !menuItemId) return { ok: false, status: 400, error: 'invalid_input' }
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > 50) return { ok: false, status: 400, error: 'invalid_quantity' }

  const ctxResult = await loadEventContext(eventId, caller.id)
  if (!ctxResult.ok) return ctxResult
  const { event, rank, role } = ctxResult.ctx

  // Prix TOUJOURS résolu serveur depuis event.menu — cet endpoint n'accepte
  // aucun prix venant du client (contrairement au legacy, qui faisait
  // confiance au client quand event.menu était vide). Plus simple ET
  // strictement plus sûr : pas de carve-out "menu vide" ici, un menu vide ou
  // un item introuvable refusent tout simplement la ligne.
  const menuItem = event.menu?.find((m) => m.name === menuItemId)
  if (!menuItem) return { ok: false, status: 400, error: 'unknown_menu_item' }

  const ticket = await Ticket.findOne({ ticketCode })
  if (!ticket || ticket.eventId !== eventId) return { ok: false, status: 404, error: 'ticket_not_found' }

  // Ferme la lacune legacy : api/event-stock.js ne vérifiait la propriété du
  // billet qu'à l'ÉDITION d'une ligne existante (addedBy === caller), jamais
  // à la CRÉATION — n'importe quel compte connecté pouvait donc attacher des
  // lignes à un billet appartenant à un inconnu. Un rang 0 (simple
  // titulaire) ne peut créer une ligne que sur SON PROPRE billet ; le staff
  // (rang ≥ 1), lui, ajoute légitimement des lignes sur le billet d'un
  // client au bar — flux normal, aucune restriction pour lui.
  if (rank === 0 && (String(ticket.userId) !== caller.id || ticket.revoked === true)) {
    return { ok: false, status: 403, error: 'not_your_ticket' }
  }

  const addedByName = await resolveCallerName(caller.id)
  const itemId = crypto.randomBytes(12).toString('hex')

  const session = await mongoose.startSession()
  let created: OrderItem
  try {
    created = await session.withTransaction(async (): Promise<OrderItem> => {
      const order = await getOrCreateOrder(eventId, session)
      order.items.push({
        id: itemId,
        menuItemId,
        name: menuItem.name,
        quantity,
        unitPriceMinor: menuItem.price ?? 0,
        ticketId: ticketCode,
        addedBy: caller.id,
        addedByName,
        status: 'sent',
        kind: 'order',
      })
      await order.save({ session })
      const newItem = order.items[order.items.length - 1]

      await appendLog(
        eventId,
        {
          actorId: caller.id,
          actorName: addedByName,
          actorRole: role,
          itemId,
          ticketId: ticketCode,
          itemName: menuItem.name,
          action: 'add',
          newValue: { quantity, unitPriceMinor: menuItem.price ?? 0 },
        },
        session
      )

      return newItem
    })
  } finally {
    await session.endSession()
  }

  return { ok: true, item: toItemView(created) }
}

// ────────────────────────── updateOrderItemQuantity ─────────────────────────

export interface UpdateOrderItemQuantityInput {
  eventId: string
  itemId: string
  quantity: number
}

export type UpdateOrderItemQuantityResult = ErrResult | { ok: true; noop: true } | { ok: true; noop?: false; item: EventOrderItemView }

export async function updateOrderItemQuantity(
  caller: OrderCaller,
  input: UpdateOrderItemQuantityInput
): Promise<UpdateOrderItemQuantityResult> {
  await getDb()

  const eventId = input.eventId?.trim()
  const itemId = input.itemId?.trim()
  const quantity = Math.floor(Number(input.quantity))
  if (!eventId || !itemId) return { ok: false, status: 400, error: 'invalid_input' }
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > 50) return { ok: false, status: 400, error: 'invalid_quantity' }

  const ctxResult = await loadEventContext(eventId, caller.id)
  if (!ctxResult.ok) return ctxResult
  const { rank, role } = ctxResult.ctx
  const actorName = await resolveCallerName(caller.id)

  type Outcome = { kind: 'error'; status: number; error: string } | { kind: 'noop' } | { kind: 'updated'; item: OrderItem }

  const session = await mongoose.startSession()
  let outcome: Outcome
  try {
    outcome = await session.withTransaction(async (): Promise<Outcome> => {
      const order = await EventOrder.findOne({ eventId }).session(session)
      const item = order?.items.find((i) => i.id === itemId)
      if (!order || !item) return { kind: 'error', status: 404, error: 'item_not_found' }

      // Précondition PARTAGÉE rang0/staff : ligne encore non servie, non
      // payée, ET non annulée. `status === 'cancelled'` est un état TERMINAL
      // atteignable uniquement par cancelOrderItem (rang 3) — sans ce
      // troisième cas, un rang 0 pourrait éditer la quantité (finding 4 :
      // compounding avec une re-service ultérieure) ou un rang ≥1 pourrait
      // silencieusement échapper au no-op puisque servedAt/paidAt restent
      // null sur une ligne annulée avant tout service/paiement. Ce qui
      // diffère, c'est la RÉACTION quand la précondition ne tient pas —
      // erreur dure pour le rang 0 sur SA PROPRE ligne, no-op silencieux pour
      // le staff sur N'IMPORTE QUELLE ligne (asymétrie volontaire, cf. prompt).
      const locked = Boolean(item.servedAt) || Boolean(item.paidAt) || item.status === 'cancelled'

      if (rank === 0) {
        if (item.addedBy !== caller.id) return { kind: 'error', status: 403, error: 'not_your_item' }
        if (locked) return { kind: 'error', status: 409, error: 'locked' }
      } else if (locked) {
        return { kind: 'noop' }
      }

      const oldQuantity = item.quantity
      item.quantity = quantity
      await order.save({ session })

      await appendLog(
        eventId,
        {
          actorId: caller.id,
          actorName,
          actorRole: role,
          itemId,
          ticketId: item.ticketId,
          itemName: item.name,
          action: 'edit',
          oldValue: { quantity: oldQuantity },
          newValue: { quantity },
        },
        session
      )

      return { kind: 'updated', item }
    })
  } finally {
    await session.endSession()
  }

  if (outcome.kind === 'error') return { ok: false, status: outcome.status, error: outcome.error }
  if (outcome.kind === 'noop') return { ok: true, noop: true }
  return { ok: true, item: toItemView(outcome.item) }
}

// ────────────────────────────── serveOrderItem ──────────────────────────────

export interface ServeOrderItemInput {
  eventId: string
  itemId: string
}

export type ServeOrderItemResult = ErrResult | { ok: true; alreadyServed: true } | { ok: true; alreadyServed?: false; item: EventOrderItemView }

export async function serveOrderItem(caller: OrderCaller, input: ServeOrderItemInput): Promise<ServeOrderItemResult> {
  await getDb()

  const eventId = input.eventId?.trim()
  const itemId = input.itemId?.trim()
  if (!eventId || !itemId) return { ok: false, status: 400, error: 'invalid_input' }

  const ctxResult = await loadEventContext(eventId, caller.id)
  if (!ctxResult.ok) return ctxResult
  const { rank, role } = ctxResult.ctx
  if (rank < 1) return { ok: false, status: 403, error: 'serve_staff_only' }
  const actorName = await resolveCallerName(caller.id)

  type Outcome = { kind: 'error'; status: number; error: string } | { kind: 'already' } | { kind: 'served'; item: OrderItem }

  const session = await mongoose.startSession()
  let outcome: Outcome
  try {
    outcome = await session.withTransaction(async (): Promise<Outcome> => {
      const order = await EventOrder.findOne({ eventId }).session(session)
      const item = order?.items.find((i) => i.id === itemId)
      if (!order || !item) return { kind: 'error', status: 404, error: 'item_not_found' }
      // Une ligne annulée (rang 3 uniquement, cf. cancelOrderItem) est un état
      // TERMINAL : la servir la rendrait de nouveau facturable via
      // payTicketOrders (dont le filtre payable n'exclut que status ===
      // 'cancelled'), ce qui contournerait entièrement la porte
      // cancel_manager_only avec une simple action rang ≥ 1. Vérifié AVANT
      // `item.servedAt` : une ligne annulée n'a jamais été servie
      // (servedAt/paidAt restent null), donc sans ce garde-fou explicite elle
      // tomberait dans le chemin normal de service, pas dans l'idempotence
      // 'already'.
      if (item.status === 'cancelled') {
        return { kind: 'error', status: 409, error: 'item_cancelled' }
      }
      if (item.servedAt) {
        // Idempotent — aucune nouvelle entrée de journal sur un re-scan/replay.
        return { kind: 'already' }
      }
      item.servedAt = new Date()
      item.servedBy = caller.id
      item.servedByName = actorName
      item.status = 'served'
      await order.save({ session })

      await appendLog(
        eventId,
        { actorId: caller.id, actorName, actorRole: role, itemId, ticketId: item.ticketId, itemName: item.name, action: 'serve' },
        session
      )

      return { kind: 'served', item }
    })
  } finally {
    await session.endSession()
  }

  if (outcome.kind === 'error') return { ok: false, status: outcome.status, error: outcome.error }
  if (outcome.kind === 'already') return { ok: true, alreadyServed: true }
  return { ok: true, item: toItemView(outcome.item) }
}

// ───────────────────────────── payTicketOrders ──────────────────────────────

export interface PayTicketOrdersInput {
  eventId: string
  ticketId: string
}

export type PayTicketOrdersResult = ErrResult | { ok: true; total: number; itemCount: number }

export async function payTicketOrders(caller: OrderCaller, input: PayTicketOrdersInput): Promise<PayTicketOrdersResult> {
  await getDb()

  const eventId = input.eventId?.trim()
  const ticketCode = input.ticketId?.trim().toUpperCase()
  if (!eventId || !ticketCode) return { ok: false, status: 400, error: 'invalid_input' }

  const ctxResult = await loadEventContext(eventId, caller.id)
  if (!ctxResult.ok) return ctxResult
  const { rank, role } = ctxResult.ctx
  if (rank < 2) return { ok: false, status: 403, error: 'pay_staff_only' }
  const actorName = await resolveCallerName(caller.id)

  type Outcome = { kind: 'error'; status: number; error: string } | { kind: 'paid'; total: number; itemCount: number }

  const session = await mongoose.startSession()
  let outcome: Outcome
  try {
    outcome = await session.withTransaction(async (): Promise<Outcome> => {
      const order = await EventOrder.findOne({ eventId }).session(session)
      // Précommandes déjà payées au checkout (Phase 3) : jamais re-facturées
      // ici. Lignes annulées : jamais facturées. Lignes déjà payées :
      // exclues pour ne jamais les compter deux fois dans le total.
      const payable = order
        ? order.items.filter((i) => i.ticketId === ticketCode && i.kind !== 'preorder' && i.status !== 'cancelled' && !i.paidAt)
        : []
      if (payable.length === 0) return { kind: 'error', status: 400, error: 'nothing_to_pay' }

      const now = new Date()
      let total = 0
      for (const item of payable) {
        total += item.unitPriceMinor * item.quantity
        item.paidAt = now
        item.paidBy = caller.id
        item.paidByName = actorName
      }
      await order!.save({ session })

      await appendLog(
        eventId,
        {
          actorId: caller.id,
          actorName,
          actorRole: role,
          ticketId: ticketCode,
          action: 'pay',
          amountMinor: total,
          newValue: { itemCount: payable.length },
        },
        session
      )

      return { kind: 'paid', total, itemCount: payable.length }
    })
  } finally {
    await session.endSession()
  }

  if (outcome.kind === 'error') return { ok: false, status: outcome.status, error: outcome.error }
  return { ok: true, total: outcome.total, itemCount: outcome.itemCount }
}

// ───────────────────────────── cancelOrderItem ──────────────────────────────

export interface CancelOrderItemInput {
  eventId: string
  itemId: string
  reason: string
}

export type CancelOrderItemResult = ErrResult | { ok: true; noop: true } | { ok: true; noop?: false; item: EventOrderItemView }

export async function cancelOrderItem(caller: OrderCaller, input: CancelOrderItemInput): Promise<CancelOrderItemResult> {
  await getDb()

  const eventId = input.eventId?.trim()
  const itemId = input.itemId?.trim()
  const reason = input.reason?.trim()
  if (!eventId || !itemId) return { ok: false, status: 400, error: 'invalid_input' }

  const ctxResult = await loadEventContext(eventId, caller.id)
  if (!ctxResult.ok) return ctxResult
  const { rank, role } = ctxResult.ctx
  if (rank !== 3) return { ok: false, status: 403, error: 'cancel_manager_only' }
  if (!reason) return { ok: false, status: 400, error: 'reason_required' }
  const actorName = await resolveCallerName(caller.id)

  type Outcome = { kind: 'error'; status: number; error: string } | { kind: 'noop' } | { kind: 'cancelled'; item: OrderItem }

  const session = await mongoose.startSession()
  let outcome: Outcome
  try {
    outcome = await session.withTransaction(async (): Promise<Outcome> => {
      const order = await EventOrder.findOne({ eventId }).session(session)
      const item = order?.items.find((i) => i.id === itemId)
      if (!order || !item) return { kind: 'error', status: 404, error: 'item_not_found' }
      // Déjà payé (legacy) OU déjà annulé (idempotence — ajout non-legacy,
      // évite qu'un double-clic manager ne produise une seconde entrée de
      // journal) → succès silencieux, jamais une erreur.
      if (item.paidAt || item.status === 'cancelled') return { kind: 'noop' }

      item.status = 'cancelled'
      item.cancelledAt = new Date()
      item.cancelledBy = caller.id
      item.cancellationReason = reason
      await order.save({ session })

      await appendLog(
        eventId,
        { actorId: caller.id, actorName, actorRole: role, itemId, ticketId: item.ticketId, itemName: item.name, action: 'cancel', note: reason },
        session
      )

      return { kind: 'cancelled', item }
    })
  } finally {
    await session.endSession()
  }

  if (outcome.kind === 'error') return { ok: false, status: outcome.status, error: outcome.error }
  if (outcome.kind === 'noop') return { ok: true, noop: true }
  return { ok: true, item: toItemView(outcome.item) }
}

// ───────────────────────────── removeOrderItem ──────────────────────────────

export interface RemoveOrderItemInput {
  eventId: string
  itemId: string
}

export type RemoveOrderItemResult = ErrResult | { ok: true; noop: true } | { ok: true; noop?: false }

export async function removeOrderItem(caller: OrderCaller, input: RemoveOrderItemInput): Promise<RemoveOrderItemResult> {
  await getDb()

  const eventId = input.eventId?.trim()
  const itemId = input.itemId?.trim()
  if (!eventId || !itemId) return { ok: false, status: 400, error: 'invalid_input' }

  const ctxResult = await loadEventContext(eventId, caller.id)
  if (!ctxResult.ok) return ctxResult
  const { rank, role } = ctxResult.ctx
  const actorName = await resolveCallerName(caller.id)

  type Outcome = { kind: 'error'; status: number; error: string } | { kind: 'noop' } | { kind: 'removed' }

  const session = await mongoose.startSession()
  let outcome: Outcome
  try {
    outcome = await session.withTransaction(async (): Promise<Outcome> => {
      const order = await EventOrder.findOne({ eventId }).session(session)
      const item = order?.items.find((i) => i.id === itemId)
      if (!order || !item) return { kind: 'error', status: 404, error: 'item_not_found' }

      // Voir le commentaire équivalent dans updateOrderItemQuantity : `locked`
      // inclut aussi status === 'cancelled' pour empêcher un rang 0 ou un
      // staff non-manager d'effacer (deleteOne) une ligne déjà annulée par un
      // manager — ce qui supprimerait cancelledAt/cancelledBy/
      // cancellationReason, le seul historique de cette décision rang 3.
      const locked = Boolean(item.servedAt) || Boolean(item.paidAt) || item.status === 'cancelled'

      if (rank === 0) {
        if (item.addedBy !== caller.id) return { kind: 'error', status: 403, error: 'not_your_item' }
        if (locked) return { kind: 'error', status: 409, error: 'locked' }
      } else if (locked) {
        return { kind: 'noop' }
      }

      const snapshot = { ticketId: item.ticketId, name: item.name, quantity: item.quantity }
      // Suppression réelle (pas un flip de statut) : `deleteOne()` sur le
      // sous-document lui-même (pas `array.pull({_id})`/`.id()`) — notre clé
      // de lookup métier est le champ `id` (string), pas l'`_id` Mongo
      // auto-généré, donc on localise d'abord la ligne via `.find()` puis on
      // la retire par sa propre méthode d'instance, qui sait se retirer du
      // tableau parent par son `_id` réel (voir ArraySubdocument.$__removeFromParent).
      item.deleteOne()
      await order.save({ session })

      await appendLog(
        eventId,
        { actorId: caller.id, actorName, actorRole: role, itemId, ticketId: snapshot.ticketId, itemName: snapshot.name, action: 'remove', oldValue: snapshot },
        session
      )

      return { kind: 'removed' }
    })
  } finally {
    await session.endSession()
  }

  if (outcome.kind === 'error') return { ok: false, status: outcome.status, error: outcome.error }
  if (outcome.kind === 'noop') return { ok: true, noop: true }
  return { ok: true }
}

// ────────────────────────── materializeTicketOrders ─────────────────────────

export interface MaterializeTicketOrdersInput {
  eventId: string
  ticketId: string
}

export type MaterializeTicketOrdersResult = ErrResult | { ok: true; inserted: number }

export async function materializeTicketOrders(caller: OrderCaller, input: MaterializeTicketOrdersInput): Promise<MaterializeTicketOrdersResult> {
  await getDb()

  const eventId = input.eventId?.trim()
  const ticketCode = input.ticketId?.trim().toUpperCase()
  if (!eventId || !ticketCode) return { ok: false, status: 400, error: 'invalid_input' }

  const ctxResult = await loadEventContext(eventId, caller.id)
  if (!ctxResult.ok) return ctxResult
  const { event, rank, role } = ctxResult.ctx
  if (rank < 1) return { ok: false, status: 403, error: 'staff_only' }

  const ticket = await Ticket.findOne({ ticketCode })
  if (!ticket || ticket.eventId !== eventId) return { ok: false, status: 404, error: 'ticket_not_found' }

  // Précommandes : prix depuis ticket.preorders (déjà résolu/payé au
  // checkout, cf. Phase 3) — JAMAIS re-résolu depuis event.menu.
  //
  // FUSION PAR NOM avant de construire les candidats : ni le schéma zod du
  // checkout (app/api/checkout/route.ts, `preorders: z.array({name, qty})`)
  // ni createOrder (lib/server/orders.ts) ni fulfillOrder ne fusionnent deux
  // entrées de même nom — un client peut donc soumettre deux fois
  // {name:'Champagne', qty:1} plutôt qu'une fois {qty:2}, et ticket.preorders
  // se retrouve avec deux entrées du même nom. Or l'id métier d'une ligne
  // précommande est déterministe par NOM SEUL (`pre_{ticketCode}_{name}`,
  // cf. sanitizedItemId) : sans cette fusion, deux candidats partageraient le
  // même id et seraient tous deux insérés dans order.items lors du même
  // appel (existingIds n'est vérifié qu'une fois, avant insertion — voir
  // toInsert plus bas) puisque ni l'un ni l'autre n'est encore présent au
  // moment du filtre. La seconde ligne deviendrait alors orpheline : tout
  // mutateur par id (serve/cancel/update/remove, qui font tous
  // `.find(i => i.id === itemId)`) ne peut jamais atteindre que la première.
  const preordersByName = new Map<string, { name: string; price: number; qty: number }>()
  for (const p of ticket.preorders ?? []) {
    const existing = preordersByName.get(p.name)
    if (existing) existing.qty += p.qty ?? 1
    else preordersByName.set(p.name, { name: p.name, price: p.price ?? 0, qty: p.qty ?? 1 })
  }
  const preorderCandidates = Array.from(preordersByName.values()).map((p) => ({
    id: sanitizedItemId('pre', ticketCode, p.name),
    menuItemId: null as string | null,
    name: p.name,
    quantity: p.qty,
    unitPriceMinor: p.price,
    ticketId: ticketCode,
    addedBy: caller.id,
    addedByName: null as string | null,
    status: 'sent' as const,
    kind: 'preorder' as const,
  }))

  // Inclus : place du billet → event.places[].included[], filtré aux entrées
  // dont le nom existe encore dans event.menu (une entrée "included" pointant
  // vers un item de menu supprimé est silencieusement ignorée — mirrors
  // legacy `includedForPlace`). Toujours prix 0 (inclus dans le prix du billet).
  const placeDef = event.places?.find((p) => p.type === ticket.place)
  const includedCandidates = (placeDef?.included ?? [])
    .filter((inc) => event.menu?.some((m) => m.name === inc.name))
    .map((inc) => ({
      id: sanitizedItemId('inc', ticketCode, inc.name),
      menuItemId: inc.name as string | null,
      name: inc.name,
      quantity: inc.qty ?? 1,
      unitPriceMinor: 0,
      ticketId: ticketCode,
      addedBy: caller.id,
      addedByName: null as string | null,
      status: 'sent' as const,
      kind: 'included' as const,
    }))

  const candidates = [...preorderCandidates, ...includedCandidates]

  const session = await mongoose.startSession()
  let inserted: number
  try {
    inserted = await session.withTransaction(async (): Promise<number> => {
      const order = await getOrCreateOrder(eventId, session)
      const existingIds = new Set(order.items.map((i) => i.id))
      // Filtre SÉQUENTIEL (pas un `.filter()` figé sur l'état initial de
      // `existingIds`) : chaque candidat retenu est ajouté à `existingIds` au
      // fur et à mesure, ce qui dédoublonne aussi les candidats ENTRE EUX (pas
      // seulement contre order.items pré-existant) — filet de sécurité
      // supplémentaire à la fusion par nom ci-dessus, au cas où une autre
      // source de candidats (ex. `included`) produirait un jour un id
      // dupliqué en interne.
      const toInsert: typeof candidates = []
      for (const c of candidates) {
        if (existingIds.has(c.id)) continue
        existingIds.add(c.id)
        toInsert.push(c)
      }
      // Insertion idempotente : vérification "existe déjà ?" APPLICATIVE à
      // l'intérieur de la transaction (re-fetch frais, même schéma que
      // seatAssignment.ts) plutôt qu'un `$addToSet` Mongo natif — `items` est
      // un tableau de sous-documents hétérogènes (kind différent, champs
      // ensuite mutés par serve/pay/cancel), donc `$addToSet` comparerait des
      // sous-documents ENTIERS et échouerait à dédoublonner dès qu'un champ
      // aurait divergé (un `pre_...` déjà servi n'est plus structurellement
      // égal au candidat qu'on retenterait d'insérer). La vraie clé de
      // dédoublonnage est le champ `id` métier déterministe, pas l'égalité
      // structurelle — seul un check-before-insert applicatif est donc
      // correct ici ; la transaction (avec le retry automatique de
      // `withTransaction` sur conflit d'écriture) le rend sûr en cas d'appel
      // concurrent depuis deux appareils staff, exactement comme le
      // re-check transactionnel de revokeSeat.
      for (const item of toInsert) order.items.push(item)
      if (toInsert.length > 0) await order.save({ session })

      for (const item of toInsert) {
        await appendLog(
          eventId,
          {
            actorId: caller.id,
            actorRole: role,
            itemId: item.id,
            ticketId: ticketCode,
            itemName: item.name,
            action: 'materialize',
            newValue: { kind: item.kind, quantity: item.quantity, unitPriceMinor: item.unitPriceMinor },
          },
          session
        )
      }

      return toInsert.length
    })
  } finally {
    await session.endSession()
  }

  return { ok: true, inserted }
}

// ────────────────────────────── lectures (H15) ──────────────────────────────

export interface ListOrdersForTicketInput {
  eventId: string
  ticketId: string
}

export type ListOrdersResult = ErrResult | { ok: true; items: EventOrderItemView[] }

export async function listOrdersForTicket(caller: OrderCaller, input: ListOrdersForTicketInput): Promise<ListOrdersResult> {
  await getDb()

  const eventId = input.eventId?.trim()
  const ticketCode = input.ticketId?.trim().toUpperCase()
  if (!eventId || !ticketCode) return { ok: false, status: 400, error: 'invalid_input' }

  const ctxResult = await loadEventContext(eventId, caller.id)
  if (!ctxResult.ok) return ctxResult
  const { rank } = ctxResult.ctx

  if (rank === 0) {
    // Ferme H15 : un simple client ne peut lire QUE les commandes de SON
    // PROPRE billet — le legacy laissait tout compte connecté lire
    // l'intégralité de event_orders/{eventId}. Le check `ticket.eventId ===
    // eventId` (même garde que addOrderItem/materializeTicketOrders) est
    // requis EN PLUS de la propriété du billet : sans lui, un rang 0 pourrait
    // interroger listOrdersForTicket avec l'eventId B d'un événement où il
    // n'a aucun rôle, en fournissant le ticketCode X d'un billet qu'il détient
    // réellement mais pour un AUTRE événement A — la vérification de
    // propriété seule (userId) passerait alors qu'elle ne devrait pas
    // s'appliquer à cet événement.
    const ticket = await Ticket.findOne({ ticketCode }).lean()
    if (!ticket || ticket.eventId !== eventId) return { ok: false, status: 404, error: 'ticket_not_found' }
    if (String(ticket.userId) !== caller.id) return { ok: false, status: 403, error: 'forbidden' }
  }

  const order = await EventOrder.findOne({ eventId }).lean()
  const items = (order?.items ?? []).filter((i) => i.ticketId === ticketCode)
  return { ok: true, items: items.map((i) => toItemView(i as OrderItem)) }
}

export interface ListOrdersForEventInput {
  eventId: string
}

export async function listOrdersForEvent(caller: OrderCaller, input: ListOrdersForEventInput): Promise<ListOrdersResult> {
  await getDb()

  const eventId = input.eventId?.trim()
  if (!eventId) return { ok: false, status: 400, error: 'invalid_input' }

  const ctxResult = await loadEventContext(eventId, caller.id)
  if (!ctxResult.ok) return ctxResult
  const { rank } = ctxResult.ctx
  if (rank < 1) return { ok: false, status: 403, error: 'forbidden' } // H15 : pas de vue événement entière pour un non-staff

  const order = await EventOrder.findOne({ eventId }).lean()
  const items = order?.items ?? []
  return { ok: true, items: items.map((i) => toItemView(i as OrderItem)) }
}

// ─────────────────────────────── getOrderLog ────────────────────────────────

export interface GetOrderLogInput {
  eventId: string
}

export type GetOrderLogResult = ErrResult | { ok: true; entries: EventOrderLogEntryView[] }

export async function getOrderLog(caller: OrderCaller, input: GetOrderLogInput): Promise<GetOrderLogResult> {
  await getDb()

  const eventId = input.eventId?.trim()
  if (!eventId) return { ok: false, status: 400, error: 'invalid_input' }

  const ctxResult = await loadEventContext(eventId, caller.id)
  if (!ctxResult.ok) return ctxResult
  const { rank } = ctxResult.ctx
  if (rank !== 3) return { ok: false, status: 403, error: 'forbidden' } // H14 : lecture réservée propriétaire/manager

  const log = await EventOrderLog.findOne({ eventId }).lean()
  const entries = [...(log?.entries ?? [])].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
  return {
    ok: true,
    entries: entries.map((e) => ({
      id: e.id,
      ts: new Date(e.ts).toISOString(),
      actorId: e.actorId,
      actorName: e.actorName ?? null,
      actorRole: e.actorRole ?? null,
      itemId: e.itemId ?? null,
      ticketId: e.ticketId ?? null,
      itemName: e.itemName ?? null,
      action: e.action,
      oldValue: e.oldValue ?? null,
      newValue: e.newValue ?? null,
      amountMinor: e.amountMinor ?? null,
      note: e.note ?? null,
    })),
  }
}

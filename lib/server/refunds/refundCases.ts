import mongoose, { type ClientSession, type HydratedDocument } from 'mongoose'
import Event, { type EventDoc } from '@/lib/models/Event'
import Order, { type OrderDoc } from '@/lib/models/Order'
import Ticket from '@/lib/models/Ticket'
import User from '@/lib/models/User'
import RefundCase from '@/lib/models/RefundCase'
import RefundPoint, { type RefundPointDoc } from '@/lib/models/RefundPoint'
import { getDb } from '@/lib/db/mongoose'
import { notifyUserById } from '@/lib/server/emails/notify'
import { eventCancelledCashPickupEmail, refundConfirmedEmail } from '@/lib/server/emails'
import { fmtMoney } from '@/lib/shared/money'
import {
  computeRefundableMinor,
  decryptRefundPickupCode,
  encryptRefundPickupCode,
  encryptRefundSensitiveValue,
  generateRefundPickupCode,
  hashRefundPickupCode,
  maskPaymentDestination,
  orderFacialMinor,
  orderOptionMinor,
  type RefundCause,
} from '@/lib/shared/refundPolicy'

export type RefundCaseFlow = 'cash_pickup' | 'individual'
export type RefundAuditContext = { ip?: string | null; userAgent?: string | null }

export type CreateRefundCaseResult =
  | { ok: true; created: boolean; pickupCode?: string; refundCaseId: string; refundPointName?: string | null; refundPointAddress?: string | null; amountXOF?: number }
  | { ok: false; status: number; error: string }

function idempotencyKey(orderId: string, cause: RefundCause) {
  return `${orderId}:${cause}`
}

function appendAudit(
  action: string,
  actorRole: 'participant' | 'organizer' | 'agent' | 'system' | 'admin',
  actorId: string | null,
  metadata?: unknown,
  before?: unknown,
  after?: unknown
) {
  return {
    at: new Date(),
    action,
    actorRole,
    actorId,
    before: before ?? null,
    after: after ?? null,
    metadata: metadata ?? null,
  }
}

export function auditContextFromRequest(req: Request): RefundAuditContext {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const ip = req.headers.get('x-real-ip')?.trim() || forwarded || null
  const userAgent = req.headers.get('user-agent')?.trim() || null
  return { ip, userAgent }
}

function withAuditContext(metadata: unknown, context?: RefundAuditContext) {
  const ip = context?.ip?.trim() || null
  const userAgent = context?.userAgent?.trim() || null
  if (!ip && !userAgent) return metadata ?? null
  return {
    ...(metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata as Record<string, unknown> : { value: metadata }),
    technical: { ip, userAgent },
  }
}

function normalizeRefundPointCity(value: unknown): string {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('fr-FR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

async function resolveRefundPoint(event: HydratedDocument<EventDoc>, session?: ClientSession | null): Promise<HydratedDocument<RefundPointDoc> | null> {
  if (event.refundPointId) {
    const configured = await RefundPoint.findOne({ _id: event.refundPointId, active: true }).session(session ?? null)
    if (configured) return configured
  }
  const city = normalizeRefundPointCity(event.city)
  if (city) {
    const points = await RefundPoint.find({ country: 'BJ', active: true, city: { $ne: '' } }).sort({ createdAt: 1 }).session(session ?? null)
    const local = points.find((point) => normalizeRefundPointCity(point.city) === city)
    if (local) return local
  }
  return RefundPoint.findOne({ country: 'BJ', active: true }).sort({ createdAt: 1 }).session(session ?? null)
}

export async function createRefundCaseForOrder(
  order: HydratedDocument<OrderDoc>,
  cause: RefundCause,
  opts: { flow?: RefundCaseFlow; actorId?: string | null; actorRole?: 'participant' | 'organizer' | 'agent' | 'system' | 'admin'; session?: ClientSession } = {}
): Promise<CreateRefundCaseResult> {
  const orderId = String(order._id)
  const key = idempotencyKey(orderId, cause)
  const existing = await RefundCase.findOne({ idempotencyKey: key }).session(opts.session ?? null)
  if (existing) return { ok: true, created: false, refundCaseId: String(existing._id), refundPointName: existing.refundPointName, refundPointAddress: existing.refundPointAddress, amountXOF: existing.refundableMinor }

  if (order.status !== 'paid') return { ok: false, status: 409, error: 'order_not_paid' }
  if (order.currency !== 'XOF') return { ok: false, status: 409, error: 'xof_required' }

  const event = await Event.findById(order.eventId).session(opts.session ?? null)
  if (!event) return { ok: false, status: 404, error: 'event_not_found' }
  const buyer = await User.findById(order.userId).select('phone').session(opts.session ?? null).lean()

  const flow: RefundCaseFlow = opts.flow ?? (cause === 'cancellation_option' ? 'individual' : 'cash_pickup')
  const facialMinor = orderFacialMinor(order)
  const serviceFeeMinor = Math.max(0, Math.round(Number(order.feeMinor) || 0))
  const optionFeeMinor = orderOptionMinor(order)
  const refundableMinor = computeRefundableMinor(order, cause)
  const status = flow === 'cash_pickup' ? 'code_active' : cause === 'cancellation_option' ? 'individual_generated' : 'switched_individual'
  let pickupCode: string | undefined
  let point: HydratedDocument<RefundPointDoc> | null = null

  if (flow === 'cash_pickup') {
    point = await resolveRefundPoint(event, opts.session)
    if (!point) return { ok: false, status: 409, error: 'refund_point_required' }
    pickupCode = generateRefundPickupCode()
  }
  const lockedPhone = order.contactPhone || buyer?.phone || null
  const individualDestinationType = flow === 'individual' ? (order.rail === 'fedapay' && lockedPhone ? 'locked_mobile_money' : 'bank_account') : null
  const originalPaymentDestinationMasked = individualDestinationType === 'locked_mobile_money' ? maskPaymentDestination(lockedPhone) : null

  const [created] = await RefundCase.create(
    [
      {
        idempotencyKey: key,
        eventId: order.eventId,
        orderId,
        buyerId: order.userId,
        organizerId: event.organizerId || event.createdBy,
        cause,
        flow,
        status,
        facialMinor,
        serviceFeeMinor,
        optionFeeMinor,
        refundableMinor,
        paymentRail: order.rail === 'cash' ? 'cash' : order.rail === 'fedapay' ? 'fedapay' : 'unknown',
        individualDestinationType,
        originalPaymentDestinationMasked,
        encryptedIndividualDestination: individualDestinationType === 'locked_mobile_money' && lockedPhone ? encryptRefundSensitiveValue(lockedPhone) : null,
        refundPointId: point ? String(point._id) : null,
        refundPointName: point?.name ?? null,
        refundPointAddress: point?.address ?? null,
        codeHash: pickupCode ? hashRefundPickupCode(pickupCode) : null,
        encryptedPickupCode: pickupCode ? encryptRefundPickupCode(pickupCode) : null,
        codeLast4: pickupCode ? pickupCode.slice(-4) : null,
        auditTrail: [
          appendAudit('created', opts.actorRole ?? 'system', opts.actorId ?? null, {
            cause,
            flow,
            pointAssigned: Boolean(point),
          }),
        ],
      },
    ],
    { session: opts.session }
  )

  return {
    ok: true,
    created: true,
    pickupCode,
    refundCaseId: String(created._id),
    refundPointName: created.refundPointName,
    refundPointAddress: created.refundPointAddress,
    amountXOF: created.refundableMinor,
  }
}

export async function createClientInitiatedRefundCase(
  order: HydratedDocument<OrderDoc>,
  cause: Extract<RefundCause, 'cancellation_option' | 'postponed_declined'>,
  actorId: string | null
): Promise<CreateRefundCaseResult> {
  const session = await mongoose.startSession()
  try {
    let result: CreateRefundCaseResult = { ok: false, status: 500, error: 'not_run' }
    await session.withTransaction(async () => {
      const lockedOrder = await Order.findById(order._id).session(session)
      if (!lockedOrder) {
        result = { ok: false, status: 404, error: 'order_not_found' }
        return
      }
      const anyCheckedIn = await Ticket.exists({ orderId: String(lockedOrder._id), checkedInAt: { $ne: null } }).session(session)
      if (anyCheckedIn) {
        result = { ok: false, status: 409, error: 'ticket_already_checked_in' }
        return
      }
      const anyListedForResale = await Ticket.exists({ orderId: String(lockedOrder._id), resaleListingId: { $ne: null } }).session(session)
      if (anyListedForResale) {
        result = { ok: false, status: 409, error: 'ticket_listed_for_resale' }
        return
      }
      await Ticket.updateMany({ orderId: String(lockedOrder._id) }, { $set: { revoked: true, resaleListingId: null } }, { session })
      lockedOrder.clientRefundRequestedAt = new Date()
      lockedOrder.clientRefundReason = cause
      await lockedOrder.save({ session })
      result = await createRefundCaseForOrder(lockedOrder, cause, { flow: cause === 'cancellation_option' ? 'individual' : 'cash_pickup', actorId, actorRole: 'participant', session })
    })
    return result
  } finally {
    await session.endSession()
  }
}

export async function createEventCancellationRefundCases(eventId: string, actorId: string | null) {
  return processEventCancellationRefundBatch(eventId, actorId, { batchSize: 1000 })
}

export async function processEventCancellationRefundBatch(eventId: string, actorId: string | null, opts: { batchSize?: number } = {}) {
  const session = await mongoose.startSession()
  let created = 0
  let failed = 0
  const batchSize = Math.max(1, Math.min(250, Math.round(Number(opts.batchSize || 50))))
  const notifications: Array<{
    buyerId: string
    eventName: string
    amountXOF: number
    pickupCode: string
    refundPointName: string
    refundPointAddress: string
    reason: string | null
  }> = []
  try {
    const existing = await RefundCase.find({ eventId, cause: 'event_cancelled' }).select('orderId').lean()
    const existingOrderIds = existing.map((refund) => refund.orderId)
    const orders = await Order.find({
      eventId,
      status: 'paid',
      currency: 'XOF',
      _id: { $nin: existingOrderIds },
    })
      .sort({ createdAt: 1, _id: 1 })
      .limit(batchSize)
    for (const order of orders) {
      try {
        let notification: (typeof notifications)[number] | null = null
        await session.withTransaction(async () => {
          await Ticket.updateMany({ orderId: String(order._id) }, { $set: { revoked: true, resaleListingId: null } }, { session })
          const result = await createRefundCaseForOrder(order, 'event_cancelled', { flow: 'cash_pickup', actorId, actorRole: actorId ? 'organizer' : 'system', session })
          if (result.ok && result.created) {
            created += 1
            if (result.pickupCode && result.refundPointName && result.refundPointAddress && result.amountXOF) {
              const event = await Event.findById(order.eventId).session(session).lean()
              notification = {
                buyerId: order.userId,
                eventName: event?.name || 'Ton événement',
                amountXOF: result.amountXOF,
                pickupCode: result.pickupCode,
                refundPointName: result.refundPointName,
                refundPointAddress: result.refundPointAddress,
                reason: event?.cancellationMessage || null,
              }
            }
          }
        })
        if (notification) notifications.push(notification)
      } catch {
        failed += 1
      }
    }
    for (const item of notifications) {
      await notifyUserById(item.buyerId, () =>
        eventCancelledCashPickupEmail(
          item.eventName,
          fmtMoney(item.amountXOF, 'XOF'),
          item.pickupCode,
          item.refundPointName,
          item.refundPointAddress,
          item.reason
        )
      )
    }
    const remaining = await Order.countDocuments({
      eventId,
      status: 'paid',
      currency: 'XOF',
      _id: { $nin: [...existingOrderIds, ...orders.map((order) => order._id)] },
    })
    await Event.updateOne(
      { _id: eventId },
      {
        $set: {
          'refundCaseGeneration.status': failed > 0 ? 'failed' : remaining > 0 ? 'running' : 'complete',
          'refundCaseGeneration.completedAt': remaining > 0 || failed > 0 ? null : new Date(),
          'refundCaseGeneration.lastError': failed > 0 ? 'refund_case_generation_failed' : null,
        },
        $inc: {
          'refundCaseGeneration.processedCount': created,
          'refundCaseGeneration.failedCount': failed,
        },
      }
    )
    return { created, failed, remaining }
  } finally {
    await session.endSession()
  }
}

export async function processPendingEventCancellationRefundBatches(actorId: string | null = null, opts: { batchSize?: number; eventLimit?: number } = {}) {
  await getDb()
  const eventLimit = Math.max(1, Math.min(50, Math.round(Number(opts.eventLimit || 10))))
  const events = await Event.find({
    cancelled: true,
    'refundCaseGeneration.status': { $in: ['running', 'failed'] },
  })
    .select('_id')
    .sort({ 'refundCaseGeneration.startedAt': 1, updatedAt: 1 })
    .limit(eventLimit)
    .lean()

  const results = []
  for (const event of events) {
    await Event.updateOne(
      { _id: event._id },
      {
        $set: {
          'refundCaseGeneration.status': 'running',
          'refundCaseGeneration.lastError': null,
        },
      }
    )
    const result = await processEventCancellationRefundBatch(String(event._id), actorId, { batchSize: opts.batchSize })
    results.push({ eventId: String(event._id), ...result })
  }
  return { ok: true as const, processedEvents: results.length, results }
}

export async function switchCashPickupToIndividual(callerId: string, refundCaseId: string, auditContext?: RefundAuditContext) {
  await getDb()
  const now = new Date()
  const refund = await RefundCase.findOne({ _id: refundCaseId, buyerId: callerId, flow: 'cash_pickup', status: 'code_active' })
  if (!refund) return { ok: false as const, status: 409, error: 'not_switchable' }
  const order = await Order.findById(refund.orderId).lean()
  const buyer = await User.findById(callerId).select('phone').lean()
  const lockedPhone = order?.contactPhone || buyer?.phone || null
  const lockedToOriginalMobileMoney = order?.rail === 'fedapay' && lockedPhone
  const result = await RefundCase.findOneAndUpdate(
    { _id: refundCaseId, buyerId: callerId, flow: 'cash_pickup', status: 'code_active' },
    {
      $set: {
        flow: 'individual',
        status: lockedToOriginalMobileMoney ? 'to_refund' : 'switched_individual',
        individualDestinationType: lockedToOriginalMobileMoney ? 'locked_mobile_money' : null,
        originalPaymentDestinationMasked: lockedToOriginalMobileMoney ? maskPaymentDestination(lockedPhone) : null,
        encryptedIndividualDestination: lockedToOriginalMobileMoney ? encryptRefundSensitiveValue(lockedPhone) : null,
        codeCancelledAt: now,
        codeHash: null,
        encryptedPickupCode: null,
      },
      $push: {
        auditTrail: appendAudit(
          'switched_to_individual',
          'participant',
          callerId,
          withAuditContext({ irreversible: true }, auditContext),
          { flow: 'cash_pickup', status: 'code_active', codeActive: true },
          {
            flow: 'individual',
            status: lockedToOriginalMobileMoney ? 'to_refund' : 'switched_individual',
            codeActive: false,
            destinationType: lockedToOriginalMobileMoney ? 'locked_mobile_money' : null,
          }
        ),
      },
    },
    { new: true }
  )
  if (!result) return { ok: false as const, status: 409, error: 'not_switchable' }
  return { ok: true as const }
}

type RefundCaseLeanView = {
  _id: unknown
  eventId: string
  orderId: string
  cause: string
  flow: string
  status: string
  currency: string
  refundableMinor: number
  facialMinor: number
  serviceFeeMinor: number
  optionFeeMinor: number
  technicalFeeMinor?: number
  refundPointId?: string | null
  refundPointName?: string | null
  refundPointAddress?: string | null
    encryptedPickupCode?: string | null
  encryptedIndividualDestination?: string | null
  individualDestinationType?: string | null
  codeLast4?: string | null
  paymentRail?: string | null
  originalPaymentDestinationMasked?: string | null
  declaredReference?: string | null
  declaredChannel?: string | null
  declaredAt?: Date | string | null
  proofs?: unknown[]
  contestReason?: string | null
  contestedAt?: Date | string | null
  contestResolution?: string | null
  contestResolvedAt?: Date | string | null
  auditTrail?: unknown[]
  createdAt?: Date | string | null
  updatedAt?: Date | string | null
}

function mapRefundCaseView(doc: RefundCaseLeanView, viewer: 'participant' | 'organizer') {
  const pickupCode = viewer === 'participant' && doc.status === 'code_active' ? decryptRefundPickupCode(doc.encryptedPickupCode) : null
  return {
    id: String(doc._id),
    eventId: doc.eventId,
    orderId: doc.orderId,
    cause: doc.cause,
    flow: doc.flow,
    status: doc.status,
    currency: doc.currency,
    amountXOF: doc.refundableMinor,
    facialXOF: doc.facialMinor,
    serviceFeeXOF: doc.serviceFeeMinor,
    optionFeeXOF: doc.optionFeeMinor,
    technicalFeeXOF: doc.technicalFeeMinor,
    refundPoint: doc.refundPointId
      ? { id: doc.refundPointId, name: doc.refundPointName, address: doc.refundPointAddress }
      : null,
    pickupCode,
    codeLast4: doc.codeLast4,
    paymentRail: doc.paymentRail,
    individualDestinationType: doc.individualDestinationType,
    originalPaymentDestinationMasked: doc.originalPaymentDestinationMasked,
    declaredReference: doc.declaredReference,
    declaredChannel: doc.declaredChannel,
    declaredAt: doc.declaredAt ? new Date(doc.declaredAt).toISOString() : null,
    proofs: doc.proofs ?? [],
    contestReason: doc.contestReason,
    contestedAt: doc.contestedAt ? new Date(doc.contestedAt).toISOString() : null,
    contestResolution: doc.contestResolution,
    contestResolvedAt: doc.contestResolvedAt ? new Date(doc.contestResolvedAt).toISOString() : null,
    auditTrail: doc.auditTrail ?? [],
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
  }
}

export async function listParticipantRefundCases(callerId: string) {
  await getDb()
  const cases = await RefundCase.find({ buyerId: callerId })
    .select('+encryptedPickupCode')
    .sort({ createdAt: -1 })
    .lean()
  return cases.map((doc) => mapRefundCaseView(doc, 'participant'))
}

export async function listOrganizerRefundCases(organizerId: string, filters: { eventId?: string | null; status?: string | null; flow?: string | null } = {}) {
  await getDb()
  const query: Record<string, unknown> = { organizerId }
  if (filters.eventId) query.eventId = filters.eventId
  if (filters.status) query.status = filters.status
  if (filters.flow) query.flow = filters.flow
  const cases = await RefundCase.find(query).sort({ createdAt: -1 }).lean()
  return cases.map((doc) => mapRefundCaseView(doc, 'organizer'))
}

export async function declareIndividualRefund(
  organizerId: string,
  refundCaseId: string,
  input: { reference: string; channel: string; proofUrl: string; declaredAt?: Date | null },
  auditContext?: RefundAuditContext
) {
  await getDb()
  const now = new Date()
  const proofUrl = input.proofUrl.trim()
  const reference = input.reference.trim()
  const channel = input.channel.trim()
  if (!reference || !channel || !proofUrl) return { ok: false as const, status: 400, error: 'missing_declaration_details' }
  const duplicateReference = await RefundCase.exists({
    _id: { $ne: refundCaseId },
    organizerId,
    declaredReference: reference,
  })
  if (duplicateReference) return { ok: false as const, status: 409, error: 'reference_already_used' }

  let result
  try {
    result = await RefundCase.findOneAndUpdate(
      {
        _id: refundCaseId,
        organizerId,
        flow: 'individual',
        status: { $in: ['individual_generated', 'to_refund', 'contested'] },
      },
      {
        $set: {
          status: 'declared',
          declaredReference: reference,
          declaredChannel: channel,
          declaredAt: input.declaredAt ?? now,
          declaredBy: organizerId,
        },
        $push: {
          proofs: { url: proofUrl, uploadedAt: now, uploadedBy: organizerId, label: 'Preuve de remboursement' },
          auditTrail: appendAudit(
            'refund_declared',
            'organizer',
            organizerId,
            withAuditContext({ reference, channel }, auditContext),
            { status: 'to_refund' },
            { status: 'declared', declaredReference: reference, declaredChannel: channel }
          ),
        },
      },
      { new: true }
    )
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
      return { ok: false as const, status: 409, error: 'reference_already_used' }
    }
    throw error
  }
  if (!result) return { ok: false as const, status: 409, error: 'not_declarable' }
  try {
    const event = await Event.findById(result.eventId).select('name').lean()
    await notifyUserById(result.buyerId, () => refundConfirmedEmail(event?.name || 'Ton événement', fmtMoney(result.refundableMinor, 'XOF'), 'dans les meilleurs délais'))
  } catch (err) {
    console.error('[refundCases] declaration notification failed:', err)
  }
  return { ok: true as const }
}

export async function confirmRefundReceived(callerId: string, refundCaseId: string, auditContext?: RefundAuditContext) {
  await getDb()
  const now = new Date()
  const result = await RefundCase.updateOne(
    { _id: refundCaseId, buyerId: callerId, status: 'declared' },
    {
      $set: { status: 'reimbursed' },
      $push: {
        auditTrail: appendAudit(
          'participant_confirmed_received',
          'participant',
          callerId,
          withAuditContext({ at: now.toISOString() }, auditContext),
          { status: 'declared' },
          { status: 'reimbursed' }
        ),
      },
    }
  )
  if (result.matchedCount === 0) return { ok: false as const, status: 409, error: 'not_confirmable' }
  return { ok: true as const }
}

export async function contestDeclaredRefund(callerId: string, refundCaseId: string, reason: string, auditContext?: RefundAuditContext) {
  await getDb()
  const now = new Date()
  const cleanReason = reason.trim().slice(0, 1000)
  const result = await RefundCase.updateOne(
    { _id: refundCaseId, buyerId: callerId, status: 'declared' },
    {
      $set: { status: 'contested', contestReason: cleanReason, contestedAt: now },
      $push: {
        auditTrail: appendAudit(
          'participant_contested',
          'participant',
          callerId,
          withAuditContext({ reason: cleanReason }, auditContext),
          { status: 'declared' },
          { status: 'contested' }
        ),
      },
    }
  )
  if (result.matchedCount === 0) return { ok: false as const, status: 409, error: 'not_contestable' }
  return { ok: true as const }
}

export async function resolveRefundContest(organizerId: string, refundCaseId: string, resolution: string, auditContext?: RefundAuditContext) {
  await getDb()
  const now = new Date()
  const cleanResolution = resolution.trim().slice(0, 1200)
  if (!cleanResolution) return { ok: false as const, status: 400, error: 'resolution_required' }

  const result = await RefundCase.updateOne(
    { _id: refundCaseId, organizerId, flow: 'individual', status: 'contested' },
    {
      $set: {
        status: 'contest_resolved',
        contestResolution: cleanResolution,
        contestResolvedAt: now,
        contestResolvedBy: organizerId,
      },
      $push: {
        auditTrail: appendAudit(
          'contest_resolved',
          'organizer',
          organizerId,
          withAuditContext({ resolution: cleanResolution }, auditContext),
          { status: 'contested' },
          { status: 'contest_resolved' }
        ),
      },
    }
  )
  if (result.matchedCount === 0) return { ok: false as const, status: 409, error: 'not_resolvable' }
  return { ok: true as const }
}

export async function submitIndividualRefundDestination(
  callerId: string,
  refundCaseId: string,
  input: { destinationType: 'bank_account' | 'verified_mobile_money'; details: string },
  auditContext?: RefundAuditContext
) {
  await getDb()
  const clean = input.details.trim().slice(0, 2000)
  if (!clean) return { ok: false as const, status: 400, error: 'destination_required' }

  const refund = await RefundCase.findOne({ _id: refundCaseId, buyerId: callerId, flow: 'individual' }).select('+encryptedIndividualDestination')
  if (!refund) return { ok: false as const, status: 404, error: 'not_found' }
  if (refund.individualDestinationType === 'locked_mobile_money') return { ok: false as const, status: 409, error: 'destination_locked_to_original_payment' }
  if (!['switched_individual', 'individual_generated', 'info_required'].includes(refund.status)) {
    return { ok: false as const, status: 409, error: 'destination_not_editable' }
  }

  const beforeStatus = refund.status
  refund.individualDestinationType = input.destinationType
  refund.encryptedIndividualDestination = encryptRefundSensitiveValue(clean)
  refund.originalPaymentDestinationMasked = maskPaymentDestination(clean)
  refund.status = 'info_required'
  refund.bankDetailsVerifiedAt = null
  refund.auditTrail.push(appendAudit(
    'individual_destination_submitted',
    'participant',
    callerId,
    withAuditContext({ destinationType: input.destinationType }, auditContext),
    { status: beforeStatus },
    { status: 'info_required', destinationMasked: refund.originalPaymentDestinationMasked }
  ))
  await refund.save()
  return { ok: true as const }
}

export async function verifyIndividualRefundDestination(organizerId: string, refundCaseId: string, auditContext?: RefundAuditContext) {
  await getDb()
  const now = new Date()
  const result = await RefundCase.updateOne(
    { _id: refundCaseId, organizerId, flow: 'individual', status: 'info_required' },
    {
      $set: {
        status: 'to_refund',
        bankDetailsVerifiedAt: now,
      },
      $push: {
        auditTrail: appendAudit(
          'individual_destination_verified',
          'organizer',
          organizerId,
          withAuditContext({ verifiedAt: now.toISOString() }, auditContext),
          { status: 'info_required' },
          { status: 'to_refund' }
        ),
      },
    }
  )
  if (result.matchedCount === 0) return { ok: false as const, status: 409, error: 'not_verifiable' }
  return { ok: true as const }
}

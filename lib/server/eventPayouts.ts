import Event from '../models/Event'
import User from '../models/User'
import EventPayout, { type EventPayoutDoc } from '../models/EventPayout'
import CronLock from '../models/CronLock'
import PaymentAlert from '../models/PaymentAlert'
import { isFedapayConfigured, createPayout, startPayout, getPayout } from './fedapayClient'
import { getEventEndTimestamp } from '../shared/eventUrgency'

// Versement organisateur FedaPay/XOF. Stripe Connect est réglé directement par
// Stripe. Un reversement FedaPay déjà créé est toujours rapproché avant toute
// nouvelle tentative afin qu'un timeout réseau ne provoque jamais un doublon.
const PAYOUT_LOCK_ID = 'event_payouts'
const LOCK_TTL_MS = 15 * 60 * 1000
const END_BUFFER_MS = 6 * 60 * 60 * 1000 // 6h après la fin de l'événement
const PAYOUT_PENDING_ALERT_MS = 48 * 60 * 60 * 1000

const SUCCESSFUL_PAYOUT_STATUSES = new Set(['sent', 'processed', 'transferred', 'paid', 'successful', 'succeeded'])
const FAILED_PAYOUT_STATUSES = new Set(['failed', 'declined', 'canceled', 'cancelled', 'expired'])

export type PayoutResolution = 'succeeded' | 'failed' | 'pending'
export type PayoutReconciliationResult = 'paid' | 'failed' | 'waiting' | 'ignored'

export function classifyFedapayPayoutStatus(status: unknown): PayoutResolution {
  const normalized = String(status || '').trim().toLowerCase()
  if (SUCCESSFUL_PAYOUT_STATUSES.has(normalized)) return 'succeeded'
  if (FAILED_PAYOUT_STATUSES.has(normalized)) return 'failed'
  return 'pending'
}

async function acquirePayoutLock(now: number): Promise<boolean> {
  try {
    await CronLock.create({ _id: PAYOUT_LOCK_ID, lockedUntil: new Date(now + LOCK_TTL_MS) })
    return true
  } catch {
    // Existe déjà — n'acquiert que si le verrou précédent a expiré.
    const res = await CronLock.updateOne(
      { _id: PAYOUT_LOCK_ID, lockedUntil: { $lt: new Date(now) } },
      { $set: { lockedUntil: new Date(now + LOCK_TTL_MS) } }
    )
    return res.modifiedCount === 1
  }
}

async function releasePayoutLock(): Promise<void> {
  await CronLock.deleteOne({ _id: PAYOUT_LOCK_ID })
}

async function markFailed(
  ep: EventPayoutDoc & { _id: unknown },
  reason: string,
  code: string,
  expected: Record<string, unknown> = {}
): Promise<boolean> {
  const updated = await EventPayout.updateOne(
    { _id: ep._id, ...expected },
    { $set: { status: 'failed', failReason: reason, failCode: code, pendingPayoutId: null, claimedAmount: 0 } }
  )
  if (updated.modifiedCount !== 1) return false

  await PaymentAlert.updateOne(
    { key: `payout_${ep.eventId}` },
    { $set: { reason: 'auto_payout_failed', eventId: ep.eventId, sellerUid: ep.sellerUid, details: { code } } },
    { upsert: true }
  )
  return true
}

async function flagUncertainPayout(ep: EventPayoutDoc & { _id: unknown }, payoutId: string, code: string): Promise<void> {
  await PaymentAlert.updateOne(
    { key: `payout_${ep.eventId}` },
    {
      $set: {
        reason: 'auto_payout_reconciliation_required',
        eventId: ep.eventId,
        sellerUid: ep.sellerUid,
        details: { code, payoutId },
      },
    },
    { upsert: true }
  )
}

async function settleSuccessfulPayout(
  ep: EventPayoutDoc & { _id: unknown },
  payoutId: string,
  remoteStatus: string,
  now: number
): Promise<PayoutReconciliationResult> {
  if (Number(ep.claimedAmount) <= 0) {
    await EventPayout.updateOne(
      { _id: ep._id, status: 'paying', pendingPayoutId: payoutId },
      {
        $set: {
          status: 'failed',
          failReason: 'montant du reversement envoyé impossible à rapprocher automatiquement',
          failCode: 'payout_amount_unknown',
          pendingPayoutId: null,
          lastPayoutId: payoutId,
          lastPayoutStatus: remoteStatus,
          lastPayoutAt: new Date(now),
          lastReconciledAt: new Date(now),
        },
      }
    )
    await flagUncertainPayout(ep, payoutId, 'payout_amount_unknown')
    return 'failed'
  }

  const updated = await EventPayout.updateOne(
    { _id: ep._id, status: 'paying', pendingPayoutId: payoutId },
    [
      {
        $set: {
          amountDueXOF: { $max: [0, { $subtract: ['$amountDueXOF', '$claimedAmount'] }] },
          pendingPayoutId: null,
          claimedAmount: 0,
          lastPayoutId: payoutId,
          lastPayoutStatus: remoteStatus,
          lastPayoutAt: new Date(now),
          lastReconciledAt: new Date(now),
          failReason: null,
          failCode: null,
        },
      },
      { $set: { status: { $cond: [{ $gt: ['$amountDueXOF', 0] }, 'accumulating', 'paid'] } } },
    ]
  )
  if (updated.modifiedCount !== 1) return 'ignored'
  await PaymentAlert.deleteOne({ key: `payout_${ep.eventId}` })
  return 'paid'
}

async function applyRemotePayoutStatus(
  ep: EventPayoutDoc & { _id: unknown },
  payoutId: string,
  status: unknown,
  now: number
): Promise<PayoutReconciliationResult> {
  const remoteStatus = String(status || 'unknown').trim().toLowerCase()
  const resolution = classifyFedapayPayoutStatus(remoteStatus)

  if (resolution === 'succeeded') {
    return settleSuccessfulPayout(ep, payoutId, remoteStatus, now)
  }

  if (resolution === 'failed') {
    const updated = await EventPayout.updateOne(
      { _id: ep._id, status: 'paying', pendingPayoutId: payoutId },
      {
        $set: {
          status: 'failed',
          failReason: 'FedaPay a refusé ou annulé le reversement',
          failCode: 'payout_rejected',
          pendingPayoutId: null,
          claimedAmount: 0,
          lastPayoutId: payoutId,
          lastPayoutStatus: remoteStatus,
          lastReconciledAt: new Date(now),
        },
      }
    )
    if (updated.modifiedCount !== 1) return 'ignored'
    await PaymentAlert.updateOne(
      { key: `payout_${ep.eventId}` },
      {
        $set: {
          reason: 'auto_payout_failed',
          eventId: ep.eventId,
          sellerUid: ep.sellerUid,
          details: { code: 'payout_rejected', payoutId, remoteStatus },
        },
      },
      { upsert: true }
    )
    return 'failed'
  }

  await EventPayout.updateOne(
    { _id: ep._id, status: 'paying', pendingPayoutId: payoutId },
    { $set: { lastPayoutId: payoutId, lastPayoutStatus: remoteStatus, lastReconciledAt: new Date(now) } }
  )
  return 'waiting'
}

export async function reconcileEventPayout(
  payoutId: number | string,
  reportedStatus?: unknown,
  now: number = Date.now()
): Promise<PayoutReconciliationResult> {
  const normalizedId = String(payoutId)
  const ep = await EventPayout.findOne({ status: 'paying', pendingPayoutId: normalizedId })
  if (!ep) return 'ignored'

  const status = reportedStatus === undefined ? (await getPayout(normalizedId)).status : reportedStatus
  return applyRemotePayoutStatus(ep, normalizedId, status, now)
}

function countReconciliation(out: ProcessPayoutsResult, result: PayoutReconciliationResult): void {
  if (result === 'paid') out.paid++
  else if (result === 'failed') out.failed++
  else if (result === 'waiting') out.waiting++
  else out.skipped++
}

export type ProcessPayoutsResult = { scanned: number; paid: number; failed: number; waiting: number; skipped: number; locked: number }

export async function processEventPayouts(now: number = Date.now()): Promise<ProcessPayoutsResult> {
  const out: ProcessPayoutsResult = { scanned: 0, paid: 0, failed: 0, waiting: 0, skipped: 0, locked: 0 }
  if (!isFedapayConfigured()) {
    out.skipped = 1
    return out
  }

  const gotLock = await acquirePayoutLock(now)
  if (!gotLock) {
    out.locked = 1
    return out
  }

  try {
    const envelopes = await EventPayout.find({ status: { $in: ['accumulating', 'paying'] } })
    for (const ep of envelopes) {
      out.scanned++

      if (ep.status === 'paying') {
        const payoutId = ep.pendingPayoutId ? String(ep.pendingPayoutId) : null
        if (!payoutId) {
          if (await markFailed(ep, 'reversement incomplet sans identifiant FedaPay', 'payout_state_invalid', { status: 'paying' })) out.failed++
          else out.skipped++
          continue
        }

        try {
          countReconciliation(out, await reconcileEventPayout(payoutId, undefined, now))
        } catch (err) {
          console.error('[eventPayouts] payout reconciliation failed:', err)
          out.waiting++
          const updatedAt = ep.updatedAt instanceof Date ? ep.updatedAt.getTime() : now
          if (now - updatedAt >= PAYOUT_PENDING_ALERT_MS) {
            await flagUncertainPayout(ep, payoutId, 'payout_reconciliation_timeout')
          }
        }
        continue
      }

      const event = await Event.findById(ep.eventId).lean()
      if (!event || event.cancelled) {
        await markFailed(ep, "l'événement a été annulé/supprimé — rembourser les acheteurs avant tout versement", 'event_unavailable')
        out.failed++
        continue
      }

      const eventEnd = getEventEndTimestamp(event)
      if (now < eventEnd + END_BUFFER_MS) {
        out.waiting++
        continue
      }
      if (ep.amountDueXOF <= 0) continue

      if (!ep.momoCountry) {
        await markFailed(ep, 'pays de versement indéterminé', 'country_undetermined')
        out.failed++
        continue
      }

      const seller = await User.findById(ep.sellerUid).lean()
      // .lean() peut renvoyer payoutMomos comme Map OU objet simple selon le
      // contexte Mongoose — on gère les deux représentations.
      const momos = seller?.payoutMomos as unknown as Map<string, string> | Record<string, string> | undefined
      const number = momos instanceof Map ? momos.get(ep.momoCountry) : momos?.[ep.momoCountry]
      if (!number) {
        await markFailed(ep, 'numéro mobile money manquant', 'no_momo_number')
        out.failed++
        continue
      }

      // Réclamation transactionnelle (une seule fois par envelope).
      const claim = await EventPayout.findOneAndUpdate(
        { _id: ep._id, status: 'accumulating' },
        { $set: { status: 'paying', claimedAmount: ep.amountDueXOF } },
        { new: true }
      )
      if (!claim) continue

      let payoutId: string | null = null
      try {
        const payout = await createPayout({
          amount: claim.claimedAmount,
          description: `Versement ${event.name}`.slice(0, 200),
          customer: { phone_number: { number, country: ep.momoCountry } },
          metadata: { eventId: ep.eventId },
          reference: `payout_${ep._id}`,
        })
        payoutId = String(payout.id)
        const stored = await EventPayout.updateOne(
          { _id: ep._id, status: 'paying', pendingPayoutId: null },
          {
            $set: {
              pendingPayoutId: payoutId,
              lastPayoutId: payoutId,
              lastPayoutStatus: String(payout.status || 'created'),
              lastReconciledAt: new Date(now),
            },
          }
        )
        if (stored.modifiedCount !== 1) {
          await flagUncertainPayout(ep, payoutId, 'payout_not_persisted')
          out.skipped++
          continue
        }

        await startPayout(payout.id, { number, country: ep.momoCountry })
        countReconciliation(out, await reconcileEventPayout(payoutId, undefined, now))
      } catch (err) {
        console.error('[eventPayouts] createPayout/startPayout failed:', err)
        if (!payoutId) {
          if (await markFailed(ep, 'erreur technique avant la création du reversement FedaPay', 'payout_create_error', { status: 'paying', pendingPayoutId: null })) out.failed++
          else out.skipped++
        } else {
          // L'appel de démarrage a pu réussir côté FedaPay malgré un timeout.
          // On conserve donc l'identifiant et on rapproche au prochain cron.
          await flagUncertainPayout(ep, payoutId, 'payout_start_or_status_unknown')
          out.waiting++
        }
      }
    }
    return out
  } finally {
    await releasePayoutLock()
  }
}

import Event from '../models/Event'
import User from '../models/User'
import EventPayout, { type EventPayoutDoc } from '../models/EventPayout'
import CronLock from '../models/CronLock'
import PaymentAlert from '../models/PaymentAlert'
import { isFedapayConfigured, createPayout, startPayout, getPayout } from './fedapayClient'
import { getEventEndTimestamp } from '../shared/eventUrgency'

// Port de lib/eventPayouts.js — versement organisateur (rail FedaPay/XOF
// uniquement ; Stripe Connect 'auto' est réglé par Stripe lui-même au moment
// du paiement, pas par ce cron). L'ARGENT NE PART JAMAIS avant la fin de
// l'événement + une marge de sécurité.
//
// Portage volontairement resserré sur le chemin principal (scan → gate fin
// d'événement → résolution du numéro mobile money → envoi → finalisation) ;
// la récupération avancée d'un payout bloqué après crash (>48h) et le
// réarmement en libre-service (rearmFailedPayouts) du legacy sont documentés
// comme suite possible plutôt que portés maintenant, faute d'UI organisateur
// pour renseigner un numéro mobile money à ce stade de la migration (phase 7).
const PAYOUT_LOCK_ID = 'event_payouts'
const LOCK_TTL_MS = 15 * 60 * 1000
const END_BUFFER_MS = 6 * 60 * 60 * 1000 // 6h après la fin de l'événement

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

async function markFailed(ep: EventPayoutDoc & { _id: unknown }, reason: string, code: string): Promise<void> {
  await EventPayout.updateOne({ _id: ep._id }, { $set: { status: 'failed', failReason: reason, failCode: code, pendingPayoutId: null } })
  await PaymentAlert.updateOne(
    { key: `payout_${ep.eventId}` },
    { $set: { reason: 'auto_payout_failed', eventId: ep.eventId, sellerUid: ep.sellerUid, details: { code } } },
    { upsert: true }
  )
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

      try {
        const payout = await createPayout({
          amount: claim.claimedAmount,
          description: `Versement ${event.name}`.slice(0, 200),
          customer: { phone_number: { number, country: ep.momoCountry } },
          metadata: { eventId: ep.eventId },
          reference: `payout_${ep._id}`,
        })
        await EventPayout.updateOne({ _id: ep._id }, { $set: { pendingPayoutId: String(payout.id) } })
        await startPayout(payout.id, { number, country: ep.momoCountry })

        const fresh = await getPayout(payout.id)
        if (['sent', 'processed', 'transferred'].includes(String(fresh.status))) {
          await EventPayout.updateOne(
            { _id: ep._id },
            [
              {
                $set: {
                  amountDueXOF: { $max: [0, { $subtract: ['$amountDueXOF', claim.claimedAmount] }] },
                  pendingPayoutId: null,
                },
              },
              { $set: { status: { $cond: [{ $gt: ['$amountDueXOF', 0] }, 'accumulating', 'paid'] } } },
            ]
          )
          out.paid++
        } else if (['failed', 'declined'].includes(String(fresh.status))) {
          await markFailed(ep, 'FedaPay a refusé le versement', 'payout_rejected')
          out.failed++
        } else {
          out.waiting++ // suivi par le prochain passage du cron ou le webhook payout.sent/failed
        }
      } catch (err) {
        console.error('[eventPayouts] createPayout/startPayout failed:', err)
        await markFailed(ep, 'erreur technique FedaPay', 'payout_error')
        out.failed++
      }
    }
    return out
  } finally {
    await releasePayoutLock()
  }
}

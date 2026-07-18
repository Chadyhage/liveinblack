import { getDb } from '../db/mongoose'
import User from '../models/User'
import Event from '../models/Event'
import EventPayout from '../models/EventPayout'
import { validateMomoNumber } from '../shared/payoutMomoValidation'
import { normalizeRegionId } from '../shared/locations'
import { regions } from '../shared/regions'

// Port de src/components/MomoPayoutManager.jsx (numéros mobile money par pays
// UEMOA, #7 phase organisateur) + de rearmFailedPayouts (lib/eventPayouts.js)
// — l'auto-guérison qui débloque un versement tombé en échec faute de numéro
// DÈS que l'organisateur en ajoute un, plutôt que d'attendre le cron
// quotidien (lib/server/eventPayouts.ts, task #26 — qui, lui, ne portait
// délibérément PAS le réarmement, faute d'UI organisateur à ce stade).
//
// `User.payoutMomos` (Map<string,string>, clé = code pays 'tg'/'bj'/…) est la
// SOURCE UNIQUE — un enregistrement REMPLACE entièrement la map (fidèle au
// commentaire legacy "payoutMomos = SOURCE UNIQUE désormais"), il n'y a pas
// d'ancien numéro unique à migrer dans cette migration (jamais eu d'autre
// forme ici).

export interface PayoutMomoCaller {
  id: string
}

type ErrResult = { ok: false; status: number; error: string }

export type ListPayoutMomosResult = ErrResult | { ok: true; momos: Record<string, string> }

function momosToRecord(momos: unknown): Record<string, string> {
  if (momos instanceof Map) return Object.fromEntries(momos)
  return (momos as Record<string, string>) ?? {}
}

export async function listPayoutMomos(caller: PayoutMomoCaller): Promise<ListPayoutMomosResult> {
  await getDb()
  const user = await User.findById(caller.id).lean()
  if (!user) return { ok: false, status: 404, error: 'user_not_found' }
  return { ok: true, momos: momosToRecord(user.payoutMomos) }
}

export type UpdatePayoutMomosResult = ErrResult | { ok: true; momos: Record<string, string>; rearmedCount: number }

// Remplacement COMPLET (jamais une fusion) : un pays absent du payload est un
// pays que l'organisateur a retiré côté formulaire — fidèle à
// MomoPayoutManager.save() qui reconstruit `payoutMomos` en entier à chaque
// enregistrement à partir des seuls pays encore "ouverts" dans l'UI.
export async function updatePayoutMomos(caller: PayoutMomoCaller, momos: Record<string, string>): Promise<UpdatePayoutMomosResult> {
  await getDb()

  const user = await User.findById(caller.id)
  if (!user) return { ok: false, status: 404, error: 'user_not_found' }

  const clean: Record<string, string> = {}
  for (const [momoCountry, raw] of Object.entries(momos)) {
    if (!raw || !String(raw).trim()) continue
    const result = validateMomoNumber(momoCountry, raw)
    if (!result.ok) return { ok: false, status: 400, error: result.error }
    clean[momoCountry] = result.number
  }

  user.payoutMomos = clean as unknown as typeof user.payoutMomos
  await user.save()

  const rearmedCount = Object.keys(clean).length > 0 ? await rearmFailedPayouts(caller.id) : 0
  return { ok: true, momos: clean, rearmedCount }
}

// Ré-arme les enveloppes `EventPayout` tombées en échec faute de numéro
// (`no_momo_number`) ou de pays indéterminé (`country_undetermined`), DÈS QUE
// la cause est levée — sans ça l'argent resterait bloqué jusqu'à une action
// admin. `sellerUid` null = tous les vendeurs (usage cron futur) ; fourni =
// réarmement ciblé "à la volée" après l'enregistrement d'un numéro. Ne touche
// JAMAIS les échecs non ré-armables (événement annulé/supprimé, refus
// FedaPay, bloqué 48h) — ceux-là restent réservés à une revue manuelle.
export async function rearmFailedPayouts(sellerUid: string | null = null): Promise<number> {
  await getDb()

  const filter: Record<string, unknown> = { status: 'failed' }
  if (sellerUid) filter.sellerUid = sellerUid
  const candidates = await EventPayout.find(filter).lean()

  let rearmed = 0
  for (const ep of candidates) {
    if (ep.failCode !== 'no_momo_number' && ep.failCode !== 'country_undetermined') continue

    const event = await Event.findById(ep.eventId).lean()
    if (!event || event.cancelled) continue // supprimé/annulé → pas de ré-arm

    const regionId = normalizeRegionId(event.region)
    const eventCountry = ep.momoCountry || regions.find((r) => r.id === regionId)?.momoCountry || null
    if (!eventCountry) continue // toujours pas de pays déterminable → laisse en échec

    const seller = await User.findById(ep.sellerUid).lean()
    const number = momosToRecord(seller?.payoutMomos)[eventCountry]
    if (!number) continue // toujours pas de numéro pour ce pays → laisse en échec

    // Update mono-document atomique : ne repasse en 'accumulating' QUE si le
    // doc est encore 'failed' avec le MÊME failCode qu'à la lecture — une
    // passe concurrente (cron + réarmement à la volée) ne peut donc jamais
    // écraser un 'paying'/'paid' déjà repris entre-temps.
    const claim = await EventPayout.findOneAndUpdate(
      { _id: ep._id, status: 'failed', failCode: ep.failCode },
      { $set: { status: 'accumulating', failReason: null, failCode: null, momoCountry: eventCountry } }
    )
    if (claim) rearmed++
  }
  return rearmed
}

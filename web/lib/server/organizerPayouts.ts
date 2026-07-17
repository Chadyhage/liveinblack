import { getDb } from '../db/mongoose'
import User from '../models/User'
import Application from '../models/Application'
import SellerBalance from '../models/SellerBalance'
import PayoutRequest from '../models/PayoutRequest'
import stripe from './stripeClient'
import { isStripeConnectCountry, resolveCountryISO } from '../shared/fees'

// Port de la partie STRIPE CONNECT de api/connect.js + du panneau
// PayoutPanel.jsx (#7 phase organisateur) — CÔTÉ ORGANISATEUR uniquement
// (le prestataire, phase 8, réutilisera ces mêmes fonctions génériques par
// `caller.id`, aucune n'est spécifique au rôle). Le rail XOF/mobile money
// (numéros Momo, ré-armement des `EventPayout` bloqués) est HORS PÉRIMÈTRE de
// ce fichier — voir task #75.
//
// Différences volontaires avec le legacy :
//  - `stripeChargesEnabled`/`stripeCountry` restent écrits UNIQUEMENT par le
//    webhook `account.updated` (déjà en place, app/api/webhooks/stripe/route.ts)
//    — CE module ne les touche jamais, contrairement à `GET /api/connect` côté
//    legacy qui avait un effet de bord d'écriture au moment de la lecture.
//  - Il n'existe pas de champ `payoutMode` persistant dans le nouveau schéma
//    `User` : le mode ('connect' vs 'manual' vs 'none') est dérivé À LA
//    LECTURE à partir de `stripeAccountId`/`stripeCountry`, jamais mis en cache
//    — élimine un vecteur de désynchronisation (le legacy pouvait avoir
//    `payoutMode:'manual'` stocké alors que le pays avait changé depuis).
//  - `requestManualPayout` relit le solde AUTORITATIF (`SellerBalance`) côté
//    serveur au lieu de faire confiance à un montant fourni par le client.

export interface PayoutCaller {
  id: string
}

type ErrResult = { ok: false; status: number; error: string }

export interface PayoutStatusView {
  mode: 'connect' | 'manual' | 'none'
  connected: boolean
  chargesEnabled: boolean
  country: string | null
  amountDueCents: number
  amountDueXOF: number
}

export type GetPayoutStatusResult = ErrResult | { ok: true; view: PayoutStatusView }

export async function getPayoutStatus(caller: PayoutCaller): Promise<GetPayoutStatusResult> {
  await getDb()

  const user = await User.findById(caller.id).lean()
  if (!user) return { ok: false, status: 404, error: 'user_not_found' }

  const balance = await SellerBalance.findOne({ sellerUid: caller.id }).lean()

  const connected = Boolean(user.stripeAccountId)
  // Mode dérivé, jamais mis en cache : 'connect' si un compte existe déjà,
  // sinon 'manual' si le pays connu est hors zone Stripe, sinon 'none' (pays
  // pas encore résolu — l'onboarding le déterminera).
  const mode: PayoutStatusView['mode'] = connected ? 'connect' : user.stripeCountry && !isStripeConnectCountry(user.stripeCountry) ? 'manual' : 'none'

  return {
    ok: true,
    view: {
      mode,
      connected,
      chargesEnabled: Boolean(user.stripeChargesEnabled),
      country: user.stripeCountry ?? null,
      amountDueCents: balance?.amountDueCents ?? 0,
      amountDueXOF: balance?.amountDueXOF ?? 0,
    },
  }
}

export interface StartOnboardingInput {
  origin: string
  returnPath?: string
}

export type StartOnboardingResult = ErrResult | { ok: true; url: string } | { ok: true; manual: true; country: string }

export async function startStripeConnectOnboarding(caller: PayoutCaller, input: StartOnboardingInput): Promise<StartOnboardingResult> {
  await getDb()

  const user = await User.findById(caller.id)
  if (!user) return { ok: false, status: 404, error: 'user_not_found' }

  const returnPath = input.returnPath || '/mes-evenements'
  const refresh_url = `${input.origin}${returnPath}?connect=refresh`
  const return_url = `${input.origin}${returnPath}?connect=done`

  // Compte déjà existant → nouveau lien de reprise, jamais un second compte.
  if (user.stripeAccountId) {
    const link = await stripe.accountLinks.create({ account: user.stripeAccountId, refresh_url, return_url, type: 'account_onboarding' })
    return { ok: true, url: link.url }
  }

  // Résolution du pays ISO-2 : pays déjà connu du compte, sinon le dossier de
  // candidature organisateur (rempli à l'onboarding, #7 tâche #63), sinon un
  // défaut prudent (marché principal).
  let iso = resolveCountryISO({ country: user.stripeCountry })
  if (!iso) {
    const application = await Application.findOne({ userId: caller.id, type: 'organisateur' }).lean()
    const formData = (application?.formData as Record<string, unknown>) ?? {}
    iso = resolveCountryISO({ country: String(formData.pays || '') })
  }
  if (!iso) iso = 'FR'

  // Pays hors zone Stripe → mode manuel, pas de compte Connect possible. On
  // persiste UNIQUEMENT stripeCountry (jamais chargesEnabled, réservé au
  // webhook) pour que getPayoutStatus dérive 'manual' dès le prochain appel.
  if (!isStripeConnectCountry(iso)) {
    user.stripeCountry = iso
    await user.save()
    return { ok: true, manual: true, country: iso }
  }

  const account = await stripe.accounts.create({
    type: 'express',
    country: iso,
    email: user.email,
    business_type: 'individual',
    metadata: { uid: caller.id },
    capabilities: { transfers: { requested: true }, card_payments: { requested: true } },
  })

  // stripeAccountId + stripeCountry seulement — stripeChargesEnabled reste
  // false par défaut (schéma) jusqu'au premier `account.updated` du webhook.
  user.stripeAccountId = account.id
  user.stripeCountry = iso
  await user.save()

  const link = await stripe.accountLinks.create({ account: account.id, refresh_url, return_url, type: 'account_onboarding' })
  return { ok: true, url: link.url }
}

export type RequestManualPayoutResult = ErrResult | { ok: true; requestId: string; amountDueCents: number; amountDueXOF: number }

export async function requestManualPayout(caller: PayoutCaller): Promise<RequestManualPayoutResult> {
  await getDb()

  const balance = await SellerBalance.findOne({ sellerUid: caller.id }).lean()
  const amountDueCents = balance?.amountDueCents ?? 0
  const amountDueXOF = balance?.amountDueXOF ?? 0
  if (amountDueCents <= 0 && amountDueXOF <= 0) return { ok: false, status: 400, error: 'nothing_due' }

  const existing = await PayoutRequest.findOne({ sellerUid: caller.id, status: 'pending' }).lean()
  if (existing) return { ok: false, status: 409, error: 'request_already_pending' }

  const request = await PayoutRequest.create({ sellerUid: caller.id, amountDueCents, amountDueXOF, status: 'pending' })
  return { ok: true, requestId: String(request._id), amountDueCents, amountDueXOF }
}

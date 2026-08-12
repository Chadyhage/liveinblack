// Port TypeScript de lib/fees.js — source UNIQUE des taux de commission
// LIVEINBLACK + éligibilité Stripe Connect. Toute modif de tarif se fait ICI.
//
// Décisions fondateur (inchangées) :
//   - Frais de service BILLETS = 5% + 0,49 € PAR BILLET, plafonné 2,50 €/billet,
//     payé par l'ACHETEUR, gratuit sur les billets gratuits.
//   - PRESTATAIRES = abonnement mensuel (pas de commission — hors périmètre ici).
//   - BOOSTS = 100% plateforme (déjà le cas, aucun reversement).
export const FEES = {
  TICKET: { pct: 0.05, fixedCents: 49, capCents: 250, paidBy: 'buyer' as const },
  // Zone FCFA (FedaPay — UEMOA) : 5% du prix, avec un PLANCHER de 200 FCFA
  // et un PLAFOND de 1 500 FCFA par admission (LIVE_IN_BLACK_Modele_
  // Economique_CORRIGE.docx §1-2, doc de référence corrigée du 12/08/2026) —
  // PAS un montant fixe additionné au pourcentage (erreur précédente : 5% +
  // 300 FCFA plafonné, qui ne matchait pas la table d'exemples officielle :
  // 1000 FCFA → 200 attendu, l'ancienne formule donnait 350). Montants en
  // FCFA ENTIERS (le XOF n'a pas de centimes — zéro décimale).
  TICKET_XOF: { pct: 0.05, min: 200, cap: 1500, paidBy: 'buyer' as const },
  // Revente officielle (LIVE_IN_BLACK_Systeme_de_revente.docx §1/§4) : mêmes
  // 5% qu'un billet neuf, mais prélevés sur le prix de REVENTE (choisi par le
  // vendeur, jamais > prix initial) et à la charge du VENDEUR (déduits du
  // montant qui lui est reversé, jamais ajoutés au prix payé par l'acheteur).
  // La spec ne donne le "min 200 FCFA" que pour la zone XOF (tout le document
  // de revente raisonne en FCFA, marché Togo/Bénin) — pas d'équivalent EUR
  // donné, donc RESALE (EUR) garde la même forme que TICKET (pct+cap, sans
  // minimum inventé).
  RESALE: { pct: 0.05, fixedCents: 0, capCents: 250, paidBy: 'seller' as const },
  RESALE_XOF: { pct: 0.05, fixed: 0, cap: 1500, min: 200, paidBy: 'seller' as const },
  // Assurance-annulation optionnelle, choisie par l'ACHETEUR au checkout
  // (jamais imposée) : +10% du prix du billet, payé EN PLUS au moment de
  // l'achat, en échange d'un droit à remboursement à tout moment avant
  // l'événement (hors billet déjà scanné) — voir lib/server/clientRefunds.ts.
  // Décision client (transmise le 25/07/2026) : pas de min/plafond pour ce
  // supplément, juste le pourcentage.
  CANCELLATION_PROTECTION: { pct: 0.1 },
  // Blocage temporaire de place ("hold") avec acompte — décision client :
  // 5% (min/plafond EUR 2€/20€, XOF 200/2000) pendant 24h, ou 10%
  // (min/plafond EUR 4€/40€, XOF 400/4000) pendant 72h. Prix figé à sa
  // valeur au moment du hold ; solde à régler via un checkout normal avant
  // expiration, sinon la place est automatiquement remise en vente (acompte
  // non remboursé — voir lib/server/seatHolds.ts).
  SEAT_HOLD_SHORT: { pct: 0.05, durationMs: 24 * 60 * 60 * 1000, minCents: 200, capCents: 2000, minXOF: 200, capXOF: 2000 },
  SEAT_HOLD_LONG: { pct: 0.1, durationMs: 72 * 60 * 60 * 1000, minCents: 400, capCents: 4000, minXOF: 400, capXOF: 4000 },
}

export const SUBSCRIPTION = {
  PRESTATAIRE: {
    amountCents: 999,
    currency: 'eur' as const,
    interval: 'month' as const,
    label: 'Abonnement Prestataire',
    description: 'Présence sur LIVEINBLACK — annuaire, profil, contact organisateurs',
  },
  PRESTATAIRE_XOF: {
    amount: 9000,
    currency: 'xof' as const,
    interval: 'month' as const,
    billingMode: 'manual_renewal' as const,
    label: 'Abonnement Prestataire',
    description: 'Présence sur LIVEINBLACK — annuaire, profil, contact organisateurs',
  },
}

// Frais de service billet, calculé SERVEUR (jamais reçu du client).
// unitPriceCents = prix unitaire du billet en centimes ; qty = nombre de billets.
export function computeTicketFeeCents(unitPriceCents: number, qty: number): number {
  const u = Math.round(Number(unitPriceCents) || 0)
  const n = Math.max(0, Math.floor(Number(qty) || 0))
  if (u <= 0 || n <= 0) return 0
  const perTicket = Math.min(Math.round(u * FEES.TICKET.pct) + FEES.TICKET.fixedCents, FEES.TICKET.capCents)
  return perTicket * n
}

// Frais de service billet en FCFA (FedaPay). Mêmes règles, montants ENTIERS.
export function computeTicketFeeXOF(unitPrice: number, qty: number): number {
  const u = Math.round(Number(unitPrice) || 0)
  const n = Math.max(0, Math.floor(Number(qty) || 0))
  if (u <= 0 || n <= 0) return 0
  const perTicket = Math.min(Math.max(Math.round(u * FEES.TICKET_XOF.pct), FEES.TICKET_XOF.min), FEES.TICKET_XOF.cap)
  return perTicket * n
}

// Commission LIVE IN BLACK sur une revente (par admission — une place de
// groupe revendue compte pour UNE admission ici, le nombre de sièges réels se
// gère au niveau de l'appelant qui multiplie si besoin).
export function computeResaleFeeCents(resalePriceCents: number): number {
  const p = Math.round(Number(resalePriceCents) || 0)
  if (p <= 0) return 0
  return Math.min(Math.round(p * FEES.RESALE.pct) + FEES.RESALE.fixedCents, FEES.RESALE.capCents)
}

export function computeResaleFeeXOF(resalePrice: number): number {
  const p = Math.round(Number(resalePrice) || 0)
  if (p <= 0) return 0
  const fee = Math.round(p * FEES.RESALE_XOF.pct) + FEES.RESALE_XOF.fixed
  return Math.min(Math.max(fee, FEES.RESALE_XOF.min), FEES.RESALE_XOF.cap)
}

// Supplément d'assurance-annulation — 10% du prix total du billet (unitaire
// × quantité effective), aucun plafond/minimum (décision client).
export function computeCancellationProtectionFeeCents(unitPriceCents: number, qty: number): number {
  const u = Math.round(Number(unitPriceCents) || 0)
  const n = Math.max(0, Math.floor(Number(qty) || 0))
  if (u <= 0 || n <= 0) return 0
  return Math.round(u * n * FEES.CANCELLATION_PROTECTION.pct)
}

export function computeCancellationProtectionFeeXOF(unitPrice: number, qty: number): number {
  return computeCancellationProtectionFeeCents(unitPrice, qty)
}

export type SeatHoldTier = 'short' | 'long'

// Acompte de blocage de place — pourcentage du prix UNITAIRE (une place à la
// fois, jamais un lot), plafonné/minimum selon la devise. `unitPriceMinor`
// est déjà en unité mineure (centimes EUR ou FCFA entiers).
export function computeSeatHoldDepositMinor(unitPriceMinor: number, currency: 'EUR' | 'XOF', tier: SeatHoldTier): number {
  const p = Math.max(0, Math.round(Number(unitPriceMinor) || 0))
  const conf = tier === 'short' ? FEES.SEAT_HOLD_SHORT : FEES.SEAT_HOLD_LONG
  const min = currency === 'XOF' ? conf.minXOF : conf.minCents
  const cap = currency === 'XOF' ? conf.capXOF : conf.capCents
  const raw = Math.round(p * conf.pct)
  return Math.min(Math.max(raw, min), cap)
}

export function seatHoldDurationMs(tier: SeatHoldTier): number {
  return tier === 'short' ? FEES.SEAT_HOLD_SHORT.durationMs : FEES.SEAT_HOLD_LONG.durationMs
}

// ── Pays supportés par Stripe (Connect / payouts) — liste blanche ISO-2 ──
const STRIPE_CONNECT_COUNTRIES = new Set([
  'AU', 'AT', 'BE', 'BG', 'CA', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HK',
  'HU', 'IE', 'IT', 'JP', 'LV', 'LT', 'LU', 'MT', 'MX', 'NL', 'NZ', 'NO', 'PL', 'PT', 'RO',
  'SG', 'SK', 'SI', 'ES', 'SE', 'CH', 'GB', 'US', 'AE', 'BR', 'TH', 'MY', 'GI', 'LI',
])

export function isStripeConnectCountry(country: string | null | undefined): boolean {
  if (!country) return false
  return STRIPE_CONNECT_COUNTRIES.has(String(country).trim().toUpperCase())
}

const PHONE_CODE_TO_ISO: Record<string, string> = {
  '+33': 'FR', '+32': 'BE', '+41': 'CH', '+352': 'LU', '+1': 'CA', '+212': 'MA', '+213': 'DZ',
  '+216': 'TN', '+221': 'SN', '+225': 'CI', '+226': 'BF', '+227': 'NE', '+228': 'TG',
  '+229': 'BJ', '+237': 'CM', '+241': 'GA', '+242': 'CG', '+243': 'CD',
}

export function phoneCodeToISO(code: string | null | undefined): string | null {
  return PHONE_CODE_TO_ISO[String(code || '').trim()] || null
}

const COUNTRY_NAME_TO_ISO: Record<string, string> = {
  france: 'FR', belgique: 'BE', suisse: 'CH', luxembourg: 'LU', canada: 'CA',
  maroc: 'MA', 'algérie': 'DZ', algerie: 'DZ', tunisie: 'TN', 'sénégal': 'SN', senegal: 'SN',
  "côte d'ivoire": 'CI', 'cote d ivoire': 'CI', 'burkina faso': 'BF', niger: 'NE', togo: 'TG',
  'bénin': 'BJ', benin: 'BJ', cameroun: 'CM', gabon: 'GA', congo: 'CG', 'rd congo': 'CD',
}

export function resolveCountryISO({ country, phoneCode }: { country?: string | null; phoneCode?: string | null } = {}): string | null {
  if (country) {
    const c = String(country).trim()
    if (/^[A-Za-z]{2}$/.test(c)) return c.toUpperCase()
    const hit = COUNTRY_NAME_TO_ISO[c.toLowerCase()]
    if (hit) return hit
  }
  if (phoneCode) return phoneCodeToISO(phoneCode)
  return null
}

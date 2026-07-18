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
  // Zone FCFA (FedaPay — UEMOA) : 5% + 300 FCFA, plafonné 1 500 FCFA/billet.
  // Montants en FCFA ENTIERS (le XOF n'a pas de centimes — zéro décimale).
  TICKET_XOF: { pct: 0.05, fixed: 300, cap: 1500, paidBy: 'buyer' as const },
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
  const perTicket = Math.min(Math.round(u * FEES.TICKET_XOF.pct) + FEES.TICKET_XOF.fixed, FEES.TICKET_XOF.cap)
  return perTicket * n
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

// Source UNIQUE des taux de commission LIVEINBLACK + éligibilité Stripe Connect.
// Importée par les fonctions /api (Node). Toute modif de tarif se fait ICI.
//
// Décisions fondateur :
//   - Frais de service BILLETS = 5% + 0,49 € PAR BILLET, plafonné 2,50 €/billet,
//     payé par l'ACHETEUR, gratuit sur les billets gratuits.
//   - PRESTATAIRES = abonnement mensuel 9,99 €/mois pour être présent sur l'appli
//     (2026-07-04). AUCUNE commission sur les prestations : les paiements
//     prestataire ↔ client se font en direct, hors plateforme.
//   - BOOSTS = 100% plateforme (déjà le cas, aucun reversement).

export const FEES = {
  TICKET: { pct: 0.05, fixedCents: 49, capCents: 250, paidBy: 'buyer' },
  // Zone FCFA (FedaPay — Togo/Bénin) : 5% + 300 FCFA, plafonné 1 500 FCFA/billet.
  // Montants en FCFA ENTIERS (le XOF n'a pas de centimes — zéro décimale).
  TICKET_XOF: { pct: 0.05, fixed: 300, cap: 1500, paidBy: 'buyer' },
}

// Abonnement prestataire (Stripe Billing, récurrent mensuel).
export const SUBSCRIPTION = {
  PRESTATAIRE: {
    amountCents: 999,          // 9,99 €
    currency: 'eur',
    interval: 'month',
    label: 'Abonnement Prestataire',
    description: 'Présence sur LIVEINBLACK — annuaire, profil, contact organisateurs',
  },
  // Offre FCFA planifiée, PAS encore commercialisée : l'API FedaPay actuelle
  // expose des transactions ponctuelles, pas un abonnement récurrent natif.
  // Ne pas utiliser ce tarif avant d'avoir implémenté renouvellement et expiration.
  PRESTATAIRE_XOF: {
    amount: 5000,              // 5 000 FCFA (entier, zéro décimale)
    currency: 'xof',
    interval: 'month',
    implemented: false,
    billingMode: 'manual_invoice_planned',
    label: 'Abonnement Prestataire',
    description: 'Présence sur LIVEINBLACK — annuaire, profil, contact organisateurs',
  },
}

// ── Devise par région d'événement ──
// Togo / Bénin → FCFA (FedaPay) ; France (et défaut) → EUR (Stripe).
// Le champ region des events est une chaîne libre historique → on normalise.
export function regionToCurrency(region) {
  const r = String(region || '').trim().toLowerCase()
  if (r === 'togo' || r === 'bénin' || r === 'benin' || r === 'tg' || r === 'bj') return 'XOF'
  return 'EUR'
}

// Frais de service billet, calculé SERVEUR (jamais reçu du client).
// unitPriceCents = prix unitaire du billet en centimes ; qty = nombre de billets.
// Renvoie le total des frais en centimes (0 si gratuit).
export function computeTicketFeeCents(unitPriceCents, qty) {
  const u = Math.round(Number(unitPriceCents) || 0)
  const n = Math.max(0, Math.floor(Number(qty) || 0))
  if (u <= 0 || n <= 0) return 0
  const perTicket = Math.min(Math.round(u * FEES.TICKET.pct) + FEES.TICKET.fixedCents, FEES.TICKET.capCents)
  return perTicket * n
}

// Frais de service billet en FCFA (FedaPay). Mêmes règles, montants ENTIERS.
// unitPrice = prix unitaire du billet en FCFA ; renvoie le total des frais en FCFA.
export function computeTicketFeeXOF(unitPrice, qty) {
  const u = Math.round(Number(unitPrice) || 0)
  const n = Math.max(0, Math.floor(Number(qty) || 0))
  if (u <= 0 || n <= 0) return 0
  const perTicket = Math.min(Math.round(u * FEES.TICKET_XOF.pct) + FEES.TICKET_XOF.fixed, FEES.TICKET_XOF.cap)
  return perTicket * n
}

// ── Pays supportés par Stripe (Connect / payouts) — liste blanche ISO-2 ──
// Hors de cette liste (ex: Togo TG, Sénégal SN, Côte d'Ivoire CI, Maroc MA…),
// Stripe ne peut PAS créer de compte vendeur ni reverser → fallback ledger manuel.
const STRIPE_CONNECT_COUNTRIES = new Set([
  'AU','AT','BE','BG','CA','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HK',
  'HU','IE','IT','JP','LV','LT','LU','MT','MX','NL','NZ','NO','PL','PT','RO',
  'SG','SK','SI','ES','SE','CH','GB','US','AE','BR','TH','MY','GI','LI',
])

export function isStripeConnectCountry(country) {
  if (!country) return false
  return STRIPE_CONNECT_COUNTRIES.has(String(country).trim().toUpperCase())
}

// Indicatif téléphonique → ISO-2 (les codes collectés à l'onboarding).
// Sert à déduire le pays du vendeur quand seul le code tel est connu.
const PHONE_CODE_TO_ISO = {
  '+33':'FR','+32':'BE','+41':'CH','+352':'LU','+1':'CA','+212':'MA','+213':'DZ',
  '+216':'TN','+221':'SN','+225':'CI','+226':'BF','+227':'NE','+228':'TG',
  '+229':'BJ','+237':'CM','+241':'GA','+242':'CG','+243':'CD',
}

export function phoneCodeToISO(code) {
  return PHONE_CODE_TO_ISO[String(code || '').trim()] || null
}

// Normalise un pays texte libre ("France") OU un code tel ("+228") en ISO-2.
export function resolveCountryISO({ country, phoneCode } = {}) {
  if (country) {
    const c = String(country).trim()
    if (/^[A-Za-z]{2}$/.test(c)) return c.toUpperCase()
    const NAMES = { france:'FR', belgique:'BE', suisse:'CH', luxembourg:'LU', canada:'CA',
      maroc:'MA', 'algérie':'DZ', algerie:'DZ', tunisie:'TN', 'sénégal':'SN', senegal:'SN',
      "côte d'ivoire":'CI', 'cote d ivoire':'CI', 'burkina faso':'BF', niger:'NE', togo:'TG',
      'bénin':'BJ', benin:'BJ', cameroun:'CM', gabon:'GA', congo:'CG', 'rd congo':'CD' }
    const hit = NAMES[c.toLowerCase()]
    if (hit) return hit
  }
  if (phoneCode) return phoneCodeToISO(phoneCode)
  return null
}

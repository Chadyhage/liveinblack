// Formatage monétaire multi-devise — EUR (France / Stripe) et XOF (FCFA,
// Togo/Bénin / FedaPay). SOURCE UNIQUE côté client : ne plus écrire `${x}€`
// en dur dans les pages.
//
// Règles :
//   - XOF : ZÉRO décimale (le FCFA n'a pas de centimes) → « 5 000 FCFA »
//   - EUR : décimales seulement si nécessaires → « 12 € », « 12,50 € »
//   - La devise d'un événement vient de event.currency, sinon de sa région
//     (Togo/Bénin → XOF) — miroir de lib/fees.js côté serveur.

// Zone XOF/FedaPay (UEMOA). Accepte l'id de région, le code pays, le nom ou le
// pays — insensible aux accents/espaces. DÉRIVÉE de src/data/regions.js (champ
// currency) : une seule source, plus de liste re-codée qui dérive. Ajouter une
// région FedaPay dans regions.js la rend automatiquement XOF ici.
import { regions } from '../data/regions.js'

function normKey(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, '').replace(/[\s_]+/g, '-').trim().toLowerCase()
}
const XOF_REGION_KEYS = new Set(
  regions.filter(r => r.currency === 'XOF')
    .flatMap(r => [r.id, r.code, r.name, r.country])
    .map(normKey)
)
export function regionToCurrency(region) {
  return XOF_REGION_KEYS.has(normKey(region)) ? 'XOF' : 'EUR'
}

// Devise d'un événement (ou d'un billet/booking portant currency).
// EXPLICITE UNIQUEMENT : pas de fallback sur la région — les events Togo/Bénin
// créés AVANT le multi-devise ont des prix saisis en euros ; les interpréter en
// FCFA les braderait au 1/655e. Le champ currency est figé à la publication
// (MesEvenementsPage) via regionToCurrency.
export function eventCurrency(event) {
  if (!event) return 'EUR'
  return String(event.currency || '').toUpperCase() === 'XOF' ? 'XOF' : 'EUR'
}

// Devise d'un ORGANISATEUR = sa zone, ancrée à son profil (organizer_profiles :
// regionId/country posé à l'onboarding). Principe « 1 organisateur = 1 zone » :
// tous ses events sont dans CETTE devise, un seul rail de paiement. Retourne
// null si le profil/zone n'est pas connu (l'appelant retombe alors sur la
// devise dérivée de la région de l'event, pour ne rien casser sur l'existant).
export function organizerCurrency(profile) {
  if (!profile) return null
  const anchor = profile.regionId || profile.country
  if (!anchor) return null
  return regionToCurrency(anchor)
}

// Libellé humain du rail de paiement associé à une devise (bandeaux explicites).
export function payRailLabel(currency = 'EUR') {
  return String(currency).toUpperCase() === 'XOF' ? 'Mobile Money / carte (FedaPay)' : 'Carte bancaire (Stripe)'
}

// Formate un montant : fmtMoney(5000, 'XOF') → « 5 000 FCFA » ;
// fmtMoney(12.5) → « 12,50 € » ; fmtMoney(12) → « 12 € ».
export function fmtMoney(amount, currency = 'EUR') {
  const n = Number(amount) || 0
  if (String(currency).toUpperCase() === 'XOF') {
    return `${Math.round(n).toLocaleString('fr-FR')} FCFA`
  }
  const hasCents = Math.round(n * 100) % 100 !== 0
  return `${n.toLocaleString('fr-FR', {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  })} €`
}

// Symbole/suffixe seul (labels de champs : « Prix (FCFA) », « Prix (€) »).
export function currencySymbol(currency = 'EUR') {
  return String(currency).toUpperCase() === 'XOF' ? 'FCFA' : '€'
}

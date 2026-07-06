// Formatage monétaire multi-devise — EUR (France / Stripe) et XOF (FCFA,
// Togo/Bénin / FedaPay). SOURCE UNIQUE côté client : ne plus écrire `${x}€`
// en dur dans les pages.
//
// Règles :
//   - XOF : ZÉRO décimale (le FCFA n'a pas de centimes) → « 5 000 FCFA »
//   - EUR : décimales seulement si nécessaires → « 12 € », « 12,50 € »
//   - La devise d'un événement vient de event.currency, sinon de sa région
//     (Togo/Bénin → XOF) — miroir de lib/fees.js côté serveur.

export function regionToCurrency(region) {
  const r = String(region || '').trim().toLowerCase()
  if (r === 'togo' || r === 'bénin' || r === 'benin' || r === 'tg' || r === 'bj') return 'XOF'
  return 'EUR'
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

// Helpers PURS (client-safe, aucune dépendance Admin SDK) pour savoir quelles
// méthodes d'encaissement un organisateur a configurées et si un événement d'un
// pays donné est couvert. Miroir léger de lib/eventPayouts.js côté serveur (qui,
// lui, fait autorité pour le versement réel). Sert aux AVERTISSEMENTS de l'UI.
import { momoCountryFromRegionName } from '../data/regions'

// Pays UEMOA (codes momoCountry) où l'organisateur a un numéro Mobile Money.
export function configuredMomoCountries(u) {
  const set = new Set()
  const map = (u?.payoutMomos && typeof u.payoutMomos === 'object') ? u.payoutMomos : {}
  for (const [k, v] of Object.entries(map)) { if (v && v.number) set.add(k) }
  // Rétro-compat : ancien numéro unique.
  if (u?.payoutMomo?.number && u?.payoutMomo?.country) set.add(u.payoutMomo.country)
  return [...set]
}

export function hasMomoForCountry(u, momoCountry) {
  return !!momoCountry && configuredMomoCountries(u).includes(momoCountry)
}

export function isStripeConnected(u) {
  return u?.stripeChargesEnabled === true
}

// L'encaissement est-il prêt pour un événement d'une région (nom) donnée ?
// EUR → compte Stripe connecté ; XOF → un numéro pour le pays de l'event.
// Renvoie { ready, currency, momoCountry }.
export function payoutReadyForRegion(u, regionName) {
  const momoCountry = momoCountryFromRegionName(regionName)
  if (momoCountry) return { ready: hasMomoForCountry(u, momoCountry), currency: 'XOF', momoCountry }
  // Pas de pays mobile money → euro (France/Europe) : il faut Stripe.
  return { ready: isStripeConnected(u), currency: 'EUR', momoCountry: null }
}

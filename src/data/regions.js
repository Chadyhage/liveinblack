// Pays disponibles sur LIVEINBLACK.
// France (Stripe / EUR) + la zone UEMOA prise en charge par FedaPay (mobile
// money, monnaie unique XOF/FCFA). Ajouter un pays FedaPay ici suffit : la
// devise (XOF), les frais, le versement automatique et l'indicatif de payout
// se coordonnent automatiquement (voir src/utils/money.js regionToCurrency,
// lib/providerBillingRegion.js, lib/eventPayouts.js parsePayoutMomo).
// France en premier = région par défaut (fallback de getRegionByName).
// `dial` = indicatif international ; `momoCountry` = code pays FedaPay pour les
// numéros mobile money (payouts). Les anciens dossiers tagués sur d'autres
// régions restent affichés (le champ region est une simple chaîne).
// `currency` est la SOURCE UNIQUE du rail de paiement : 'EUR' → Stripe,
// 'XOF' → FedaPay/mobile money. money.js (regionToCurrency) et
// lib/providerBillingRegion.js (facturation) dérivent tous les deux de ce champ
// — ne PAS re-coder d'ensembles « XOF » ailleurs. Ajouter un pays = renseigner
// sa `currency` ici, et devise/frais/versement suivent automatiquement.
export const regions = [
  { id: 'france',        name: 'France',        country: 'France',        flag: '🇫🇷', code: 'FR', dial: '+33',  momoCountry: null, currency: 'EUR', lat: 46.2, lon: 2.2 },
  { id: 'togo',          name: 'Togo',          country: 'Togo',          flag: '🇹🇬', code: 'TG', dial: '+228', momoCountry: 'tg', currency: 'XOF', lat: 6.1,  lon: 1.2 },
  { id: 'benin',         name: 'Bénin',         country: 'Bénin',         flag: '🇧🇯', code: 'BJ', dial: '+229', momoCountry: 'bj', currency: 'XOF', lat: 6.4,  lon: 2.4 },
  { id: 'cote-ivoire',   name: 'Côte d’Ivoire', country: 'Côte d’Ivoire', flag: '🇨🇮', code: 'CI', dial: '+225', momoCountry: 'ci', currency: 'XOF', lat: 7.5,  lon: -5.5 },
  { id: 'senegal',       name: 'Sénégal',       country: 'Sénégal',       flag: '🇸🇳', code: 'SN', dial: '+221', momoCountry: 'sn', currency: 'XOF', lat: 14.5, lon: -14.5 },
  { id: 'burkina-faso',  name: 'Burkina Faso',  country: 'Burkina Faso',  flag: '🇧🇫', code: 'BF', dial: '+226', momoCountry: 'bf', currency: 'XOF', lat: 12.2, lon: -1.6 },
  { id: 'mali',          name: 'Mali',          country: 'Mali',          flag: '🇲🇱', code: 'ML', dial: '+223', momoCountry: 'ml', currency: 'XOF', lat: 17.6, lon: -4.0 },
  { id: 'niger',         name: 'Niger',         country: 'Niger',         flag: '🇳🇪', code: 'NE', dial: '+227', momoCountry: 'ne', currency: 'XOF', lat: 17.6, lon: 8.1 },
  { id: 'guinee-bissau', name: 'Guinée-Bissau', country: 'Guinée-Bissau', flag: '🇬🇼', code: 'GW', dial: '+245', momoCountry: 'gw', currency: 'XOF', lat: 11.8, lon: -15.2 },
]

// Zone FedaPay / XOF, DÉRIVÉE du champ currency (plus « tout sauf France » :
// un futur pays EUR hors France serait sinon mal classé). Source unique.
export const XOF_REGION_IDS = regions.filter(r => r.currency === 'XOF').map(r => r.id)

export function getRegionByName(name) {
  return regions.find((r) => r.name === name) || regions[0]
}

// Code pays FedaPay (momoCountry) d'une région désignée par son NOM (le champ
// event.region), son id ou son pays. null si inconnue ou hors zone mobile money
// (France). Sert à router le versement d'un événement vers le BON numéro Mobile
// Money (celui du pays de l'événement) — un event à Cotonou paie le numéro béninois.
export function momoCountryFromRegionName(name) {
  if (!name) return null
  const r = regions.find((x) => x.name === name || x.id === name || x.country === name)
  return r?.momoCountry || null
}
// Région (donc son nom lisible) à partir d'un code momoCountry ('tg' → Togo).
export function regionByMomoCountry(code) {
  if (!code) return null
  return regions.find((r) => r.momoCountry === code) || null
}
// Régions de la zone mobile money (UEMOA / FedaPay), pour les sélecteurs de numéro.
export const MOMO_REGIONS = regions.filter((r) => r.momoCountry)
// Indicatif → code pays FedaPay (pour valider/router un numéro mobile money).
export function momoCountryFromDial(number) {
  const n = String(number || '').replace(/[\s.-]/g, '')
  const hit = regions.find(r => r.dial && r.momoCountry && n.startsWith(r.dial))
  return hit ? hit.momoCountry : null
}

// Préposition correcte par région : « au Togo », « en Côte d'Ivoire »… Fallback « à ».
const REGION_PREPOSITION = {
  France: 'en', Togo: 'au', Bénin: 'au', 'Côte d’Ivoire': 'en', Sénégal: 'au',
  'Burkina Faso': 'au', Mali: 'au', Niger: 'au', 'Guinée-Bissau': 'en',
}
export function inRegion(name) {
  if (!name) return ''
  const prep = REGION_PREPOSITION[name] || 'à'
  return `${prep} ${name}`
}

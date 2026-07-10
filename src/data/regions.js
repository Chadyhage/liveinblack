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
export const regions = [
  { id: 'france',        name: 'France',        country: 'France',        flag: '🇫🇷', code: 'FR', dial: '+33',  momoCountry: null, lat: 46.2, lon: 2.2 },
  { id: 'togo',          name: 'Togo',          country: 'Togo',          flag: '🇹🇬', code: 'TG', dial: '+228', momoCountry: 'tg', lat: 6.1,  lon: 1.2 },
  { id: 'benin',         name: 'Bénin',         country: 'Bénin',         flag: '🇧🇯', code: 'BJ', dial: '+229', momoCountry: 'bj', lat: 6.4,  lon: 2.4 },
  { id: 'cote-ivoire',   name: 'Côte d’Ivoire', country: 'Côte d’Ivoire', flag: '🇨🇮', code: 'CI', dial: '+225', momoCountry: 'ci', lat: 7.5,  lon: -5.5 },
  { id: 'senegal',       name: 'Sénégal',       country: 'Sénégal',       flag: '🇸🇳', code: 'SN', dial: '+221', momoCountry: 'sn', lat: 14.5, lon: -14.5 },
  { id: 'burkina-faso',  name: 'Burkina Faso',  country: 'Burkina Faso',  flag: '🇧🇫', code: 'BF', dial: '+226', momoCountry: 'bf', lat: 12.2, lon: -1.6 },
  { id: 'mali',          name: 'Mali',          country: 'Mali',          flag: '🇲🇱', code: 'ML', dial: '+223', momoCountry: 'ml', lat: 17.6, lon: -4.0 },
  { id: 'niger',         name: 'Niger',         country: 'Niger',         flag: '🇳🇪', code: 'NE', dial: '+227', momoCountry: 'ne', lat: 17.6, lon: 8.1 },
  { id: 'guinee-bissau', name: 'Guinée-Bissau', country: 'Guinée-Bissau', flag: '🇬🇼', code: 'GW', dial: '+245', momoCountry: 'gw', lat: 11.8, lon: -15.2 },
]

// Zone FedaPay / XOF = toutes les régions sauf la France. Source unique pour
// coordonner devise, paiement mobile money et payout.
export const XOF_REGION_IDS = regions.filter(r => r.id !== 'france').map(r => r.id)

export function getRegionByName(name) {
  return regions.find((r) => r.name === name) || regions[0]
}
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

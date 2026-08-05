// Port TypeScript de src/data/regions.js — pays disponibles sur LIVEINBLACK.
// `currency` est la SOURCE UNIQUE du rail de paiement : 'EUR' → Stripe,
// 'XOF' → FedaPay/mobile money. Ajouter un pays FedaPay ici suffit : devise,
// frais et versement se coordonnent automatiquement en aval.
export type Region = {
  id: string
  name: string
  country: string
  flag: string
  code: string
  dial: string
  momoCountry: string | null
  currency: 'EUR' | 'XOF'
  lat: number
  lon: number
  // Identifiant IANA — utilisé par lib/shared/event-time.ts pour calculer le
  // début/fin réel d'un événement dans SON fuseau (pas celui du serveur, ni
  // celui du visiteur). Toutes les régions XOF sont UTC+0 toute l'année (pas
  // de changement d'heure) ; la France est le seul cas avec un décalage
  // variable (CET/CEST) — bug confirmé par audit avant l'ajout de ce champ :
  // un event calculé côté serveur (toujours UTC) se terminait 1-2h "trop
  // tard" du point de vue du serveur, permettant par ex. un seat-hold sur un
  // événement déjà terminé en heure réelle.
  timezone: string
}

export const regions: Region[] = [
  { id: 'france', name: 'France', country: 'France', flag: '🇫🇷', code: 'FR', dial: '+33', momoCountry: null, currency: 'EUR', lat: 46.2, lon: 2.2, timezone: 'Europe/Paris' },
  { id: 'togo', name: 'Togo', country: 'Togo', flag: '🇹🇬', code: 'TG', dial: '+228', momoCountry: 'tg', currency: 'XOF', lat: 6.1, lon: 1.2, timezone: 'Africa/Lome' },
  { id: 'benin', name: 'Bénin', country: 'Bénin', flag: '🇧🇯', code: 'BJ', dial: '+229', momoCountry: 'bj', currency: 'XOF', lat: 6.4, lon: 2.4, timezone: 'Africa/Porto-Novo' },
  { id: 'cote-ivoire', name: 'Côte d’Ivoire', country: 'Côte d’Ivoire', flag: '🇨🇮', code: 'CI', dial: '+225', momoCountry: 'ci', currency: 'XOF', lat: 7.5, lon: -5.5, timezone: 'Africa/Abidjan' },
  { id: 'senegal', name: 'Sénégal', country: 'Sénégal', flag: '🇸🇳', code: 'SN', dial: '+221', momoCountry: 'sn', currency: 'XOF', lat: 14.5, lon: -14.5, timezone: 'Africa/Dakar' },
  { id: 'burkina-faso', name: 'Burkina Faso', country: 'Burkina Faso', flag: '🇧🇫', code: 'BF', dial: '+226', momoCountry: 'bf', currency: 'XOF', lat: 12.2, lon: -1.6, timezone: 'Africa/Ouagadougou' },
  { id: 'mali', name: 'Mali', country: 'Mali', flag: '🇲🇱', code: 'ML', dial: '+223', momoCountry: 'ml', currency: 'XOF', lat: 17.6, lon: -4.0, timezone: 'Africa/Bamako' },
  { id: 'niger', name: 'Niger', country: 'Niger', flag: '🇳🇪', code: 'NE', dial: '+227', momoCountry: 'ne', currency: 'XOF', lat: 17.6, lon: 8.1, timezone: 'Africa/Niamey' },
  { id: 'guinee-bissau', name: 'Guinée-Bissau', country: 'Guinée-Bissau', flag: '🇬🇼', code: 'GW', dial: '+245', momoCountry: 'gw', currency: 'XOF', lat: 11.8, lon: -15.2, timezone: 'Africa/Bissau' },
]

export const XOF_REGION_IDS: string[] = regions.filter((r) => r.currency === 'XOF').map((r) => r.id)

export function getRegionByName(name: string): Region {
  return regions.find((r) => r.name === name) || regions[0]
}

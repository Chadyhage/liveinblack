// Pays disponibles sur LIVEINBLACK
// Focus marché actuel : France, Togo, Bénin uniquement (volontairement limité).
// France en premier = région par défaut (fallback de getRegionByName).
// NB : les anciens dossiers/events tagués sur d'autres régions restent affichés
// (le champ region est une simple chaîne) mais ne sont plus filtrables ; les maps
// de traduction id→libellé d'AgentPage/ProfilePage gardent les anciens ids pour
// continuer à afficher proprement ces dossiers historiques.
export const regions = [
  { id: 'france', name: 'France', country: 'France', flag: '🇫🇷', lat: 46.2, lon: 2.2 },
  { id: 'togo',   name: 'Togo',   country: 'Togo',   flag: '🇹🇬', lat: 6.1,  lon: 1.2 },
  { id: 'benin',  name: 'Bénin',  country: 'Bénin',  flag: '🇧🇯', lat: 6.4,  lon: 2.4 },
]

export function getRegionByName(name) {
  return regions.find((r) => r.name === name) || regions[0]
}

// Préposition correcte par région : « au Togo », « au Bénin », « en France ».
// Renvoie la chaîne complète prête à insérer (ex. « au Togo »). Fallback « à ».
const REGION_PREPOSITION = { France: 'en', Togo: 'au', Bénin: 'au' }
export function inRegion(name) {
  if (!name) return ''
  const prep = REGION_PREPOSITION[name] || 'à'
  return `${prep} ${name}`
}

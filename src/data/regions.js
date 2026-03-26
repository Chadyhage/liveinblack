// Pays disponibles sur LIVEINBLACK
export const regions = [
  // ── Afrique de l'Ouest ────────────────────────────────────
  { id: 'cote-divoire', name: "Côte d'Ivoire", country: "Côte d'Ivoire", flag: '🇨🇮', lat: 5.3,  lon: -4.0  },
  { id: 'ghana',        name: 'Ghana',         country: 'Ghana',          flag: '🇬🇭', lat: 5.6,  lon: -0.2  },
  { id: 'togo',         name: 'Togo',          country: 'Togo',           flag: '🇹🇬', lat: 6.1,  lon: 1.2   },
  { id: 'benin',        name: 'Bénin',         country: 'Bénin',          flag: '🇧🇯', lat: 6.4,  lon: 2.4   },

  // ── Europe ────────────────────────────────────────────────
  { id: 'france',       name: 'France',        country: 'France',         flag: '🇫🇷', lat: 46.2, lon: 2.2   },

  // ── Amériques ─────────────────────────────────────────────
  { id: 'amerique',     name: 'Amérique',      country: 'Amérique',       flag: '🌎', lat: 18.0, lon: -77.0 },
]

export function getRegionByName(name) {
  return regions.find((r) => r.name === name) || regions[0]
}

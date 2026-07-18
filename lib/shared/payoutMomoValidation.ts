import { regions } from './regions'

// Port de la validation de numéro de src/components/MomoPayoutManager.jsx
// (#7 phase organisateur) — un numéro Mobile Money PAR PAYS UEMOA, indexé par
// `momoCountry` (ex. 'tg', 'bj'). Format international obligatoire, préfixé
// par l'indicatif du pays choisi (on ne devine jamais le pays depuis le
// numéro ici — c'est la CLÉ choisie par l'organisateur qui fait foi).

export const MOMO_REGIONS = regions.filter((r) => r.momoCountry)

export type MomoValidationResult = { ok: true; number: string } | { ok: false; error: string }

export function validateMomoNumber(momoCountry: string, rawNumber: string): MomoValidationResult {
  const region = MOMO_REGIONS.find((r) => r.momoCountry === momoCountry)
  if (!region) return { ok: false, error: 'Pays Mobile Money inconnu.' }

  const raw = String(rawNumber || '').replace(/[\s.-]/g, '').trim()
  if (!raw) return { ok: false, error: `Numéro requis pour ${region.name}.` }
  if (!raw.startsWith(region.dial) || !/^\+\d{3}\d{7,10}$/.test(raw)) {
    return { ok: false, error: `Numéro invalide pour ${region.name}. Format international, ex. ${region.dial} 90 00 00 00.` }
  }
  return { ok: true, number: raw }
}

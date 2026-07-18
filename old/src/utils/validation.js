// Validation partagée des formulaires d'onboarding (organisateur + prestataire).
// - Numéro SIRET / SIREN : format strict + checksum de Luhn (évite les fautes
//   de frappe qui feraient renvoyer le dossier). Sentinelle « 000… » = pas de
//   numéro (marchés hors France).
// - Téléphone : validité réelle selon la région, via libphonenumber-js.

import { isValidPhoneNumber } from 'libphonenumber-js'

// ─── SIRET / SIREN ────────────────────────────────────────────────────────────

function luhnValid(digits) {
  let sum = 0
  let alt = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48
    if (alt) { d *= 2; if (d > 9) d -= 9 }
    sum += d
    alt = !alt
  }
  return sum % 10 === 0
}

// Ne garde que les chiffres, plafonné à 14 (longueur d'un SIRET).
export function formatSiret(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 14)
}

// « Pas de numéro » : au moins 3 zéros et rien que des zéros (ex. 000000).
export function isNoSiret(value) {
  const d = formatSiret(value)
  return d.length >= 3 && /^0+$/.test(d)
}

// Valide : sentinelle « pas de numéro » OU SIREN (9) / SIRET (14) Luhn-conforme.
export function isValidSiret(value) {
  const d = formatSiret(value)
  if (isNoSiret(value)) return true
  if (d.length !== 9 && d.length !== 14) return false
  return luhnValid(d)
}

// ─── Téléphone ──────────────────────────────────────────────────────────────

// Valide un numéro national pour l'indicatif choisi (ex. '+33', '06 12 …').
// Tolère le 0 initial (préfixe interurbain) que les utilisateurs saisissent
// souvent. Renvoie false si vide ou invalide pour la région.
export function isValidPhone(dialCode, nationalNumber) {
  const dial = String(dialCode || '').trim()
  const raw = String(nationalNumber || '').replace(/\D/g, '')
  if (!dial || !raw) return false
  const candidates = [raw, raw.replace(/^0+/, '')]
  for (const n of candidates) {
    if (!n) continue
    try { if (isValidPhoneNumber(dial + n)) return true } catch { /* ignore */ }
  }
  return false
}

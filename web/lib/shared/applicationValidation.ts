import { parsePhoneNumberFromString } from 'libphonenumber-js'

// Port de la validation de src/pages/OnboardingOrganisateur.jsx — CÔTÉ
// CLIENT dans le legacy (jamais revérifiée serveur), ici volontairement
// partagée (lib/shared/, pas lib/server/) pour être appelée À LA FOIS par le
// formulaire client (retour immédiat) ET par lib/server/applications.ts
// (frontière de sécurité réelle — voir #7 phase organisateur, gap #1 du
// research : "toute la validation d'étape est client-only côté legacy").

export function isValidSiret(raw: string): boolean {
  const digits = String(raw || '').replace(/\D/g, '')
  // Échappatoire "pas de SIRET" : que des zéros, au moins 3 chiffres —
  // fidèle au legacy qui accepte ce cas pour les micro-structures/étranger.
  if (digits.length >= 3 && /^0+$/.test(digits)) return true
  if (digits.length !== 9 && digits.length !== 14) return false
  // Luhn
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let n = Number(digits[digits.length - 1 - i])
    if (i % 2 === 1) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
  }
  return sum % 10 === 0
}

export function formatSiret(raw: string): string {
  return String(raw || '').replace(/\D/g, '')
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim())
}

export function isValidPhone(dialCode: string, number: string): boolean {
  const national = String(number || '').trim().replace(/^0+/, '')
  if (!national) return false
  const phone = parsePhoneNumberFromString(`${dialCode}${national}`)
  return Boolean(phone?.isValid())
}

export interface OrganizerFormData {
  nomCommercial: string
  siret: string
  emailPro: string
  telephoneProCode: string
  telephonePro: string
  adresseEtablissement: string
  noFixedAddress: boolean
  siteWeb: string
  typeEtablissement: string
  typeEtablissementCustom: string
  itinerant: boolean
  ville: string
  pays: string
  zonesActivite: string[]
  capacite: number | null
  horaires: string
  alcool: boolean
  alcoolAtteste: boolean
  description: string
}

export type FormValidationResult = { ok: true } | { ok: false; error: string }

// Étape 0 — "Informations de l'établissement".
export function validateOrganizerStep0(f: Partial<OrganizerFormData>): FormValidationResult {
  if (!f.nomCommercial?.trim()) return { ok: false, error: "Le nom de l'établissement est obligatoire." }
  if (!isValidSiret(f.siret || '')) return { ok: false, error: 'Numéro SIRET/SIREN invalide (ou saisis des zéros si tu n’en as pas).' }
  if (!isValidEmail(f.emailPro || '')) return { ok: false, error: 'Adresse e-mail professionnelle invalide.' }
  if (!isValidPhone(f.telephoneProCode || '', f.telephonePro || '')) return { ok: false, error: 'Numéro de téléphone professionnel invalide.' }
  if (!f.noFixedAddress && !f.adresseEtablissement?.trim()) return { ok: false, error: "L'adresse de l'établissement est obligatoire (ou coche « pas de lieu fixe »)." }
  return { ok: true }
}

// Étape 1 — "Description de l'activité".
export function validateOrganizerStep1(f: Partial<OrganizerFormData>): FormValidationResult {
  if (!f.typeEtablissement?.trim()) return { ok: false, error: "Le type d'établissement est obligatoire." }
  if (f.typeEtablissement === 'Autre' && !f.typeEtablissementCustom?.trim()) return { ok: false, error: 'Précise ton type d’établissement.' }
  if (!f.itinerant && !f.ville?.trim()) return { ok: false, error: 'La ville est obligatoire (ou coche « itinérant »).' }
  if (f.itinerant && (!f.zonesActivite || f.zonesActivite.length === 0)) return { ok: false, error: 'Sélectionne au moins une zone d’activité.' }
  if (f.alcool && !f.alcoolAtteste) return { ok: false, error: "L'attestation de conformité alcool est obligatoire si tu en vends." }
  return { ok: true }
}

export function validateOrganizerFormData(f: Partial<OrganizerFormData>): FormValidationResult {
  const step0 = validateOrganizerStep0(f)
  if (!step0.ok) return step0
  return validateOrganizerStep1(f)
}

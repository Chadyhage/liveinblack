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
  if (!isValidSiret(f.siret || '')) return { ok: false, error: 'Numéro SIRET/SIREN invalide (ou saisis au moins 3 zéros si tu n’en as pas).' }
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

// ─────────────────────────────── Prestataire ────────────────────────────────
// Port de la validation de src/pages/OnboardingPrestataire.jsx (#8 phase
// prestataire). Champs catégorie-spécifiques (artiste/salle/materiel/food)
// portés tels quels ; AUCUN d'eux n'est réellement obligatoire côté legacy
// (même `typeArtiste`, marqué "requis" dans le label mais jamais vérifié dans
// `validate()`) — fidélité delibérée, ne pas "corriger" cette incohérence.

export interface PrestataireFormData {
  prestataireType: string
  prestataireTypes: string[]
  prenom: string
  nom: string
  telephoneCode: string
  telephone: string
  ville: string
  pays: string
  nomCommercial: string
  nomScene: string
  siret: string
  zonesIntervention: string[]
  description: string
  specialitesLibre: string
  typeArtiste: string
  styles: string
  anneesExperience: string
  statutFacturation: string
  portfolio: string
  instagram: string
  besoinstechniques: string
  adresseLieu: string
  capaciteLieu: number | null
  typeLieu: string
  equipements: string
  horairesAutorises: string
  reglesDuLieu: string
  categoriesMateriel: string
  inventaire: string
  conditionsLocation: string
  politiqueCaution: string
  typeActiviteFood: string
  menuBase: string
  alcoolFood: boolean
  alcoolFoodAtteste: boolean
  tarifMin: number | null
  tarifMax: number | null
  tarifType: string
  tarifDevis: boolean
}

// Étape 0 — "Compte" (identité + coordonnées).
export function validatePrestataireStep0(f: Partial<PrestataireFormData>): FormValidationResult {
  const errors: string[] = []
  if (!f.prenom?.trim()) errors.push('Le prénom est obligatoire.')
  if (!f.nom?.trim()) errors.push('Le nom est obligatoire.')
  if (!f.telephone?.trim()) errors.push('Le téléphone est obligatoire.')
  else if (!isValidPhone(f.telephoneCode || '', f.telephone || '')) errors.push('Numéro invalide pour ce pays.')
  if (f.siret && !isValidSiret(f.siret)) errors.push('Numéro invalide : SIREN = 9 chiffres, SIRET = 14 chiffres.')
  if (errors.length > 0) return { ok: false, error: errors.join(' ') }
  return { ok: true }
}

// Étape 2 — "Détails" (uniquement la règle conditionnelle alcool/food).
export function validatePrestataireStep2(f: Partial<PrestataireFormData>): FormValidationResult {
  if (f.alcoolFood && !f.alcoolFoodAtteste) return { ok: false, error: "Coche l'attestation pour proposer de l'alcool." }
  return { ok: true }
}

export function validatePrestataireFormData(f: Partial<PrestataireFormData>): FormValidationResult {
  const step0 = validatePrestataireStep0(f)
  if (!step0.ok) return step0
  return validatePrestataireStep2(f)
}

// Catégories dont la sélection élargit les documents exigés au-delà de
// 'identity' — port de getRequiredDocs (src/utils/applications.js). Union
// across TOUTES les catégories choisies (un prestataire multi-catégories
// cumule les exigences les plus strictes).
const BUSINESS_DOC_CATEGORIES = new Set(['salle', 'materiel', 'food', 'securite', 'transport'])

export function getRequiredDocs(type: 'organisateur' | 'prestataire', prestataireTypes: string[] = []): string[] {
  if (type === 'organisateur') return ['identity']
  const docs = new Set(['identity'])
  const selected = new Set(prestataireTypes)
  if (selected.has('artiste')) docs.add('billing_proof')
  if ([...selected].some((t) => BUSINESS_DOC_CATEGORIES.has(t))) {
    docs.add('business_doc')
    docs.add('insurance')
  }
  if (selected.has('salle')) docs.add('exploitation_proof')
  return [...docs]
}

// Port de getCompleteness (src/utils/applications.js, #9 phase agent/admin)
// — indicateur affiché sur la carte/le détail agent, jamais une vraie
// validation (les champs "requis" au sens de ce score ne bloquent pas la
// soumission serveur, voir validate*FormData ci-dessus).
export function getApplicationCompleteness(type: 'organisateur' | 'prestataire', formData: Record<string, unknown>, uploadedDocKeys: string[]): number {
  const coreFields = type === 'organisateur' ? ['nomCommercial', 'emailPro', 'telephonePro'] : ['prenom', 'nom', 'telephone']
  const fieldScore = coreFields.filter((f) => formData[f] && String(formData[f]).trim()).length / coreFields.length

  const prestataireTypes = Array.isArray(formData.prestataireTypes)
    ? (formData.prestataireTypes as string[])
    : formData.prestataireType
      ? [String(formData.prestataireType)]
      : []
  const requiredDocs = getRequiredDocs(type, prestataireTypes)
  const docScore = requiredDocs.length > 0 ? uploadedDocKeys.filter((d) => requiredDocs.includes(d)).length / requiredDocs.length : 1

  return Math.round((fieldScore * 0.5 + docScore * 0.5) * 100)
}

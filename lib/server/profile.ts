import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { getDb } from '../db/mongoose'
import User, { NAME_COOLDOWN_DAYS } from '../models/User'
import { uploadDataUri } from './cloudinary'
import { issueVerificationToken, consumeVerificationToken } from '../auth/verification-tokens'
import { emailChangeVerificationEmail } from './email-templates'
import { sendEmail } from './email'

// Port de la section "Paramètres du compte" de ProfilePage.jsx (#6 phase
// profil) — identité, démographie facultative, avatar, confidentialité,
// email, mot de passe, suppression de compte. Volontairement HORS PÉRIMÈTRE
// ici (déférées aux phases organisateur/prestataire, #7/#8, qui les
// construisent de toute façon) : Interface Prestataire/Organisateur,
// Facturation, Encaissement (payout Stripe/Momo — déjà bâti côté PAIEMENT en
// phase 3, seul le PANNEAU DE RÉGLAGE reste à faire), carte d'accréditation
// PDF.

export interface ProfileCaller {
  id: string
}

// ──────────────────────────────── getMyProfile ──────────────────────────────
// Vue complète du compte appelant pour app/(app)/profil/page.tsx — le Server
// Component appelle cette fonction plutôt que d'interroger `User` directement,
// même convention que getTicketDisplay/listMyTickets.

export interface MyProfileView {
  id: string
  firstName: string
  lastName: string
  email: string
  pendingEmail: string | null
  avatarUrl: string | null
  birthYear: number | null
  gender: string | null
  nameChangedAt: string | null
  points: number
  role: string
  privacy: { showOnline: boolean; showAvatar: boolean; readReceipts: boolean; personalizedRecommendations: boolean }
  preferences: Record<string, unknown> | null
}

export async function getMyProfile(caller: ProfileCaller): Promise<MyProfileView | null> {
  await getDb()
  const user = await User.findById(caller.id).lean()
  if (!user) return null

  return {
    id: String(user._id),
    firstName: user.firstName ?? '',
    lastName: user.lastName ?? '',
    email: user.email,
    pendingEmail: user.pendingEmail ?? null,
    avatarUrl: user.avatarUrl ?? null,
    birthYear: user.birthYear ?? null,
    gender: user.gender ?? null,
    nameChangedAt: user.nameChangedAt ? new Date(user.nameChangedAt).toISOString() : null,
    points: user.points ?? 0,
    role: user.activeRole ?? 'client',
    privacy: {
      showOnline: user.privacy?.showOnline ?? true,
      showAvatar: user.privacy?.showAvatar ?? true,
      readReceipts: user.privacy?.readReceipts ?? true,
      personalizedRecommendations: user.privacy?.personalizedRecommendations ?? true,
    },
    preferences: (user.preferences as Record<string, unknown>) ?? null,
  }
}

type ErrResult = { ok: false; status: number; error: string }

const SITE = process.env.PUBLIC_SITE_URL || 'https://liveinblack.com'
const NAME_COOLDOWN_MS = NAME_COOLDOWN_DAYS * 24 * 60 * 60 * 1000

// ──────────────────────────────── updateName ────────────────────────────────
// Contrairement au legacy (un seul champ `name`, orgName pour un
// organisateur), ce port garde firstName/lastName séparés — c'est la forme
// déjà établie par lib/models/User.ts depuis la phase 1 (session.user.name =
// [firstName,lastName].join(' ')), jamais un champ `name` redondant. Le
// COOLDOWN de 14 jours, lui, est fidèle au comportement legacy.

export type UpdateNameResult = ErrResult | { ok: true; firstName: string; lastName: string; nextChangeAllowedAt: string }

export async function updateName(caller: ProfileCaller, input: { firstName: string; lastName: string }): Promise<UpdateNameResult> {
  await getDb()

  const firstName = input.firstName?.trim()
  const lastName = input.lastName?.trim()
  if (!firstName || !lastName) return { ok: false, status: 400, error: 'name_required' }
  if (firstName.length > 80 || lastName.length > 80) return { ok: false, status: 400, error: 'name_too_long' }

  const user = await User.findById(caller.id)
  if (!user) return { ok: false, status: 404, error: 'user_not_found' }

  if (user.nameChangedAt) {
    const nextAllowedMs = new Date(user.nameChangedAt).getTime() + NAME_COOLDOWN_MS
    if (Date.now() < nextAllowedMs) {
      return { ok: false, status: 403, error: 'name_cooldown_active' }
    }
  }

  user.firstName = firstName
  user.lastName = lastName
  user.nameChangedAt = new Date()
  await user.save()

  return {
    ok: true,
    firstName,
    lastName,
    nextChangeAllowedAt: new Date(user.nameChangedAt.getTime() + NAME_COOLDOWN_MS).toISOString(),
  }
}

// ────────────────────────────── updateDemographics ──────────────────────────
// Facultatif, jamais affiché sur un profil, jamais un contrôle d'âge — voir
// le hint exact du legacy porté dans le composant client. `null` efface
// explicitement le champ (l'utilisateur peut revenir sur "je préfère ne pas
// répondre").

export type UpdateDemographicsResult = ErrResult | { ok: true; birthYear: number | null; gender: string | null }

const GENDERS = ['femme', 'homme', 'autre'] as const

export async function updateDemographics(
  caller: ProfileCaller,
  input: { birthYear?: number | null; gender?: string | null }
): Promise<UpdateDemographicsResult> {
  await getDb()

  if (input.birthYear !== undefined && input.birthYear !== null) {
    const currentYear = new Date().getFullYear()
    if (!Number.isInteger(input.birthYear) || input.birthYear < currentYear - 80 || input.birthYear > currentYear - 13) {
      return { ok: false, status: 400, error: 'invalid_birth_year' }
    }
  }
  if (input.gender !== undefined && input.gender !== null && !GENDERS.includes(input.gender as (typeof GENDERS)[number])) {
    return { ok: false, status: 400, error: 'invalid_gender' }
  }

  const setFields: Record<string, unknown> = {}
  if (input.birthYear !== undefined) setFields.birthYear = input.birthYear
  if (input.gender !== undefined) setFields.gender = input.gender

  const updated = await User.findByIdAndUpdate(caller.id, { $set: setFields }, { new: true })
  if (!updated) return { ok: false, status: 404, error: 'user_not_found' }

  return { ok: true, birthYear: updated.birthYear ?? null, gender: updated.gender ?? null }
}

// ──────────────────────────────── updateAvatar ──────────────────────────────
// Contrairement au legacy (recadrage en base64 stocké DIRECTEMENT dans le
// document utilisateur — pas d'upload Storage), l'image (déjà recadrée/
// compressée côté client, comme le legacy le fait) est envoyée ici en
// data URI et uploadée vers Cloudinary — même point d'entrée que les autres
// médias de ce port (messages, avatars de groupe). Ne stocke jamais un blob
// dans MongoDB.

export type UpdateAvatarResult = ErrResult | { ok: true; avatarUrl: string }

export async function updateAvatar(caller: ProfileCaller, input: { dataUri: string }): Promise<UpdateAvatarResult> {
  await getDb()

  const uploaded = await uploadDataUri(input.dataUri, `avatars/${caller.id}`)
  if (!uploaded.ok) return { ok: false, status: 400, error: uploaded.error }

  await User.updateOne({ _id: caller.id }, { $set: { avatarUrl: uploaded.url } })
  return { ok: true, avatarUrl: uploaded.url }
}

// ──────────────────────────────── updatePrivacy ─────────────────────────────

export interface PrivacySettings {
  showOnline: boolean
  showAvatar: boolean
  readReceipts: boolean
  personalizedRecommendations: boolean
}

export type UpdatePrivacyResult = ErrResult | { ok: true; privacy: PrivacySettings }

export async function updatePrivacy(caller: ProfileCaller, input: Partial<PrivacySettings>): Promise<UpdatePrivacyResult> {
  await getDb()

  const setFields: Record<string, boolean> = {}
  if (input.showOnline !== undefined) setFields['privacy.showOnline'] = input.showOnline
  if (input.showAvatar !== undefined) setFields['privacy.showAvatar'] = input.showAvatar
  if (input.readReceipts !== undefined) setFields['privacy.readReceipts'] = input.readReceipts
  if (input.personalizedRecommendations !== undefined) setFields['privacy.personalizedRecommendations'] = input.personalizedRecommendations

  const updated =
    Object.keys(setFields).length > 0
      ? await User.findByIdAndUpdate(caller.id, { $set: setFields }, { new: true })
      : await User.findById(caller.id)
  if (!updated) return { ok: false, status: 404, error: 'user_not_found' }

  return {
    ok: true,
    privacy: {
      showOnline: updated.privacy?.showOnline ?? true,
      showAvatar: updated.privacy?.showAvatar ?? true,
      readReceipts: updated.privacy?.readReceipts ?? true,
      personalizedRecommendations: updated.privacy?.personalizedRecommendations ?? true,
    },
  }
}

// ──────────────────────────────── updatePreferences ─────────────────────────
// "Mes goûts" — jamais un contrôle, toujours facultatif et modifiable. Forme
// libre (voir commentaire de lib/models/User.ts:preferences) : pas de zod
// stricte champ par champ ici, la validation utile se limite à la taille
// globale du payload (même esprit que updateAvatar : refuser plutôt que
// laisser passer un objet arbitrairement gros).

export type UpdatePreferencesResult = ErrResult | { ok: true; preferences: Record<string, unknown> }

export async function updatePreferences(caller: ProfileCaller, input: Record<string, unknown>): Promise<UpdatePreferencesResult> {
  await getDb()

  if (JSON.stringify(input ?? {}).length > 20_000) return { ok: false, status: 400, error: 'preferences_too_large' }

  const updated = await User.findByIdAndUpdate(caller.id, { $set: { preferences: input } }, { new: true })
  if (!updated) return { ok: false, status: 404, error: 'user_not_found' }

  return { ok: true, preferences: (updated.preferences as Record<string, unknown>) ?? {} }
}

// ───────────────────────────── requestEmailChange ───────────────────────────
// Fidèle à verifyBeforeUpdateEmail du legacy : `email` ne change JAMAIS tout
// de suite — seule `pendingEmail` est posée, le vrai changement n'a lieu qu'à
// la confirmation du lien envoyé à la NOUVELLE adresse (confirmEmailChange).

export type RequestEmailChangeResult = ErrResult | { ok: true; pendingEmail: string }

export async function requestEmailChange(caller: ProfileCaller, input: { newEmail: string; currentPassword: string }): Promise<RequestEmailChangeResult> {
  await getDb()

  const newEmail = input.newEmail?.trim().toLowerCase()
  if (!newEmail) return { ok: false, status: 400, error: 'invalid_email' }

  const user = await User.findById(caller.id)
  if (!user) return { ok: false, status: 404, error: 'user_not_found' }

  const validPassword = await bcrypt.compare(input.currentPassword ?? '', user.passwordHash)
  if (!validPassword) return { ok: false, status: 403, error: 'invalid_password' }

  if (newEmail === user.email) return { ok: false, status: 400, error: 'same_email' }

  const existing = await User.findOne({ email: newEmail }).lean()
  if (existing) return { ok: false, status: 409, error: 'email_taken' }

  user.pendingEmail = newEmail
  await user.save()

  // Sous /confirmer-email (app/(public)/) et PAS /profile/confirmer-email :
  // ce lien est cliqué depuis un email, potentiellement hors session active
  // ou sur un autre appareil — la zone /profile/* exige une session (voir
  // app/(app)/layout.tsx) et n'a de toute façon aucune page à cette URL, ce
  // qui rendait le changement d'e-mail impossible à confirmer (régression
  // trouvée à l'audit).
  const token = await issueVerificationToken(newEmail)
  const verifyLink = `${SITE}/confirmer-email?email=${encodeURIComponent(newEmail)}&token=${token}`
  const emailResult = await sendEmail(newEmail, emailChangeVerificationEmail(verifyLink, SITE))
  if (!emailResult.ok) {
    // Même choix que register (lib/server/... jamais de rollback pour un
    // souci d'envoi ponctuel) : la demande reste enregistrée, l'utilisateur
    // peut la relancer depuis le panneau "Vérification en attente".
    console.error('[requestEmailChange] email failed for', newEmail, emailResult.error)
  }

  return { ok: true, pendingEmail: newEmail }
}

// ───────────────────────────── cancelEmailChangeRequest ─────────────────────

export type CancelEmailChangeResult = ErrResult | { ok: true }

export async function cancelEmailChangeRequest(caller: ProfileCaller): Promise<CancelEmailChangeResult> {
  await getDb()
  const updated = await User.findByIdAndUpdate(caller.id, { $set: { pendingEmail: null } })
  if (!updated) return { ok: false, status: 404, error: 'user_not_found' }
  return { ok: true }
}

// ───────────────────────────── confirmEmailChange ───────────────────────────
// PAS un ProfileCaller — ce lien est cliqué depuis l'email, potentiellement
// hors session active, exactement comme confirmer-email / reset-password
// (déjà bâtis en phase 1) : l'identité vient du TOKEN, jamais d'une session.

export type ConfirmEmailChangeResult = ErrResult | { ok: true; email: string }

export async function confirmEmailChange(input: { email: string; token: string }): Promise<ConfirmEmailChangeResult> {
  await getDb()

  const email = input.email?.trim().toLowerCase()
  if (!email || !input.token) return { ok: false, status: 400, error: 'invalid_input' }

  const valid = await consumeVerificationToken(email, input.token)
  if (!valid) return { ok: false, status: 400, error: 'invalid_or_expired_token' }

  const user = await User.findOne({ pendingEmail: email })
  if (!user) return { ok: false, status: 404, error: 'no_pending_change' }

  // Re-vérifié au moment de la confirmation (pas seulement à la demande) :
  // quelqu'un d'autre a pu prendre cette adresse entre-temps.
  const takenByAnother = await User.findOne({ email, _id: { $ne: user._id } }).lean()
  if (takenByAnother) return { ok: false, status: 409, error: 'email_taken' }

  user.email = email
  user.pendingEmail = null
  user.emailVerifiedAt = new Date()
  await user.save()

  return { ok: true, email }
}

// ──────────────────────────────── changePassword ────────────────────────────

export type ChangePasswordResult = ErrResult | { ok: true }

export async function changePassword(caller: ProfileCaller, input: { currentPassword: string; newPassword: string }): Promise<ChangePasswordResult> {
  await getDb()

  if (!input.newPassword || input.newPassword.length < 8) return { ok: false, status: 400, error: 'password_too_short' }

  const user = await User.findById(caller.id)
  if (!user) return { ok: false, status: 404, error: 'user_not_found' }

  const validPassword = await bcrypt.compare(input.currentPassword ?? '', user.passwordHash)
  if (!validPassword) return { ok: false, status: 403, error: 'invalid_password' }

  user.passwordHash = await bcrypt.hash(input.newPassword, 12)
  await user.save()

  return { ok: true }
}

// ──────────────────────────────── deleteAccount ─────────────────────────────
// Contrairement au legacy (/api/admin-delete-account : suppression Firebase
// Auth + purge Firestore en cascade sur des dizaines de collections),
// ANONYMISE plutôt que de supprimer en cascade — décision délibérée pour ce
// port : un hard-delete cascadant sur billets/commandes/messages toucherait
// des enregistrements financiers et la messagerie d'AUTRES utilisateurs
// (l'historique d'une conversation ne doit pas disparaître pour l'autre
// participant juste parce que l'un des deux supprime son compte — cf.
// clearForMe/deletedForUserIds déjà en place dans lib/server/messaging.ts).
// Le compte devient définitivement injoignable (mot de passe remplacé par un
// hash aléatoire jamais reconstituable) et son identité publique est vidée,
// sans casser l'intégrité référentielle du reste de l'application.

export type DeleteAccountResult = ErrResult | { ok: true }

export async function deleteAccount(caller: ProfileCaller, input: { currentPassword: string }): Promise<DeleteAccountResult> {
  await getDb()

  const user = await User.findById(caller.id)
  if (!user) return { ok: false, status: 404, error: 'user_not_found' }

  const validPassword = await bcrypt.compare(input.currentPassword ?? '', user.passwordHash)
  if (!validPassword) return { ok: false, status: 403, error: 'invalid_password' }

  const unusableHash = await bcrypt.hash(`deleted:${crypto.randomUUID()}`, 12)
  user.email = `deleted-${String(user._id)}@liveinblack.invalid`
  user.passwordHash = unusableHash
  user.firstName = ''
  user.lastName = ''
  user.phone = ''
  user.avatarUrl = null
  user.pendingEmail = null
  user.birthYear = null
  user.gender = null
  user.disabled = true
  user.sessionVersion = (user.sessionVersion || 0) + 1
  await user.save()

  return { ok: true }
}

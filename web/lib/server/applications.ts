import bcrypt from 'bcryptjs'
import { getDb } from '../db/mongoose'
import User from '../models/User'
import Application, { type ApplicationDoc } from '../models/Application'
import { uploadDataUri } from './cloudinary'
import { applicationReceivedEmail } from './email-templates'
import { sendEmail } from './email'
import { validateOrganizerFormData, type OrganizerFormData } from '../shared/applicationValidation'

// Port de src/utils/applications.js (#7 phase organisateur) — dossier de
// candidature organisateur/prestataire. Cette phase ne construit QUE le
// côté organisateur (le prestataire suit le même moteur générique
// type:'organisateur'|'prestataire' mais son UI/ses champs propres restent
// hors périmètre, phase 8).
//
// Différence volontaire avec le legacy : là où applications.js gardait un
// "brouillon anonyme" uniquement en localStorage (aucune écriture serveur
// avant la création du compte, précisément pour ne jamais créer de "compte
// fantôme"), ce port n'a pas de notion de brouillon anonyme CÔTÉ SERVEUR du
// tout — le mode anonyme est un aller simple : le client garde son état de
// formulaire en mémoire à travers les 4 étapes, et un SEUL appel final
// (`registerAndSubmitOrganizerApplication`) crée le compte ET la
// candidature, atomiquement, exactement au moment où le legacy le fait
// aussi (jamais avant).

export interface ApplicationCaller {
  id: string
}

type ErrResult = { ok: false; status: number; error: string }

export interface DocumentEntryInput {
  name: string
  dataUri: string
}

export interface ApplicationDocumentView {
  name: string
  url: string
  size: number
  uploadedAt: string | null
}

export interface ApplicationView {
  id: string
  type: 'organisateur' | 'prestataire'
  status: ApplicationDoc['status']
  formData: Record<string, unknown>
  documents: Record<string, ApplicationDocumentView[]>
  requestedChanges: string
  rejectionReason: string
  candidateNote: string
  submittedAt: string | null
  approvedAt: string | null
  rejectedAt: string | null
  updatedAt: string
}

// Seule la pièce d'identité est réellement exigée pour un dossier
// organisateur — Stripe Connect gère la vérification bancaire séparément
// (voir OnboardingOrganisateur.jsx step "Tes revenus"/documents, comment
// legacy : "Stripe gère les coords bancaires — on ne demande que
// l'identité"). Le "document officiel de l'entreprise" reste proposable
// mais optionnel, contrairement au libellé générique DOCUMENT_LABELS qui le
// marque requis — divergence intentionnelle à préserver, pas une erreur.
const REQUIRED_DOC_KEYS: Record<'organisateur' | 'prestataire', string[]> = {
  organisateur: ['identity'],
  prestataire: ['identity'],
}

function toApplicationView(app: ApplicationDoc & { _id: unknown }): ApplicationView {
  const documents: Record<string, ApplicationDocumentView[]> = {}
  const docsMap = app.documents as unknown as Map<string, ApplicationDocumentView[]> | Record<string, ApplicationDocumentView[]> | undefined
  if (docsMap) {
    const entries = docsMap instanceof Map ? docsMap.entries() : Object.entries(docsMap)
    for (const [key, list] of entries) {
      documents[key] = (list || []).map((d) => ({ name: d.name, url: d.url, size: d.size ?? 0, uploadedAt: d.uploadedAt ? new Date(d.uploadedAt).toISOString() : null }))
    }
  }

  return {
    id: String(app._id),
    type: app.type,
    status: app.status,
    formData: (app.formData as Record<string, unknown>) ?? {},
    documents,
    requestedChanges: app.requestedChanges ?? '',
    rejectionReason: app.rejectionReason ?? '',
    candidateNote: app.candidateNote ?? '',
    submittedAt: app.submittedAt ? new Date(app.submittedAt).toISOString() : null,
    approvedAt: app.approvedAt ? new Date(app.approvedAt).toISOString() : null,
    rejectedAt: app.rejectedAt ? new Date(app.rejectedAt).toISOString() : null,
    updatedAt: new Date(app.updatedAt as unknown as string).toISOString(),
  }
}

export async function getMyApplication(caller: ApplicationCaller, type: 'organisateur' | 'prestataire'): Promise<ApplicationView | null> {
  await getDb()
  const app = await Application.findOne({ userId: caller.id, type }).lean()
  return app ? toApplicationView(app as ApplicationDoc & { _id: unknown }) : null
}

export type SaveDraftResult = ErrResult | { ok: true }

// Autosave (mode connecté uniquement) — le mode anonyme n'a aucun
// équivalent serveur, voir le commentaire d'en-tête.
export async function saveApplicationDraft(caller: ApplicationCaller, type: 'organisateur' | 'prestataire', formData: Record<string, unknown>): Promise<SaveDraftResult> {
  await getDb()

  const existing = await Application.findOne({ userId: caller.id, type })
  if (existing && !['draft', 'needs_changes'].includes(existing.status)) {
    // Un dossier déjà soumis/en review/approuvé ne se modifie plus par
    // autosave — cohérent avec MonDossierPage legacy (isEditable = draft ou
    // needs_changes uniquement).
    return { ok: false, status: 409, error: 'not_editable' }
  }

  await Application.findOneAndUpdate(
    { userId: caller.id, type },
    { $set: { formData }, $setOnInsert: { userId: caller.id, type, status: 'draft' } },
    { upsert: true }
  )
  return { ok: true }
}

interface SubmitInput {
  formData: OrganizerFormData
  documents: Record<string, DocumentEntryInput[]>
  candidateNote?: string
}

export type SubmitResult = ErrResult | { ok: true; application: ApplicationView }

type UploadDocsResult = { ok: true; documents: Record<string, ApplicationDocumentView[]> } | ErrResult

async function uploadApplicationDocuments(userId: string, appId: string, documents: Record<string, DocumentEntryInput[]>): Promise<UploadDocsResult> {
  const uploaded: Record<string, ApplicationDocumentView[]> = {}
  for (const [key, files] of Object.entries(documents)) {
    const list: ApplicationDocumentView[] = []
    for (const file of files) {
      const result = await uploadDataUri(file.dataUri, `applications/${userId}/${appId}/${key}`)
      if (!result.ok) return { ok: false, status: 400, error: result.error }
      list.push({ name: file.name, url: result.url, size: file.dataUri.length, uploadedAt: new Date().toISOString() })
    }
    uploaded[key] = list
  }
  return { ok: true, documents: uploaded }
}

function missingRequiredDocs(type: 'organisateur' | 'prestataire', documents: Record<string, DocumentEntryInput[]>): string[] {
  return REQUIRED_DOC_KEYS[type].filter((key) => !(documents[key]?.length > 0))
}

// Soumission (mode CONNECTÉ) — dossier déjà rattaché à un compte existant.
export async function submitOrganizerApplication(caller: ApplicationCaller, input: SubmitInput): Promise<SubmitResult> {
  await getDb()

  const missing = missingRequiredDocs('organisateur', input.documents)
  if (missing.length > 0) return { ok: false, status: 400, error: 'missing_required_documents' }

  const validation = validateOrganizerFormData(input.formData)
  if (!validation.ok) return { ok: false, status: 400, error: validation.error }

  const user = await User.findById(caller.id)
  if (!user) return { ok: false, status: 404, error: 'user_not_found' }

  let app = await Application.findOne({ userId: caller.id, type: 'organisateur' })
  const wasCorrection = app?.status === 'needs_changes'
  if (!app) app = new Application({ userId: caller.id, type: 'organisateur', status: 'draft' })

  const docsResult = await uploadApplicationDocuments(caller.id, String(app._id), input.documents)
  if (!docsResult.ok) return docsResult

  app.formData = input.formData
  app.documents = new Map(Object.entries(docsResult.documents)) as typeof app.documents
  app.candidateNote = input.candidateNote ?? ''
  app.status = wasCorrection ? 'resubmitted' : 'submitted'
  app.submittedAt = new Date()
  app.auditLog.push({
    action: wasCorrection ? 'resubmitted' : 'submitted',
    by: caller.id,
    byName: [user.firstName, user.lastName].filter(Boolean).join(' '),
    at: new Date(),
    note: input.candidateNote ?? '',
  })
  await app.save()

  // Bascule l'interface active sur organisateur, en attente de validation —
  // fidèle au legacy (activeRole devient 'organisateur' dès la soumission,
  // pas seulement à l'approbation). orgStatus (par-rôle, #7) reste isolé du
  // statut global des autres rôles du compte.
  if (!user.roles.includes('organisateur')) user.roles.push('organisateur')
  user.activeRole = 'organisateur'
  user.orgStatus = 'pending'
  await user.save()

  const emailResult = await sendEmail(user.email, applicationReceivedEmail(user.email))
  if (!emailResult.ok) console.error('[submitOrganizerApplication] email failed for', user.email, emailResult.error)

  return { ok: true, application: toApplicationView(app.toObject()) }
}

export interface RegisterAndSubmitInput extends SubmitInput {
  email: string
  password: string
}

export type RegisterAndSubmitResult = ErrResult | { ok: true; application: ApplicationView; userId: string }

// Soumission (mode ANONYME) — crée le compte ET la candidature dans le même
// appel, jamais avant (voir commentaire d'en-tête). Le client doit ensuite
// s'authentifier lui-même (signIn('credentials', ...)) avec l'email/mot de
// passe fournis ici — cette fonction ne pose pas de session.
export async function registerAndSubmitOrganizerApplication(input: RegisterAndSubmitInput): Promise<RegisterAndSubmitResult> {
  await getDb()

  const email = input.email.trim().toLowerCase()
  if (!email || !email.includes('@')) return { ok: false, status: 400, error: 'invalid_email' }
  if (!input.password || input.password.length < 8) return { ok: false, status: 400, error: 'password_too_short' }

  const missing = missingRequiredDocs('organisateur', input.documents)
  if (missing.length > 0) return { ok: false, status: 400, error: 'missing_required_documents' }

  const validation = validateOrganizerFormData(input.formData)
  if (!validation.ok) return { ok: false, status: 400, error: validation.error }

  const existing = await User.findOne({ email }).lean()
  if (existing) return { ok: false, status: 409, error: 'email_taken' }

  const passwordHash = await bcrypt.hash(input.password, 12)
  const user = await User.create({
    email,
    passwordHash,
    firstName: input.formData.nomCommercial || '',
    lastName: '',
    phone: '',
    roles: ['organisateur'],
    activeRole: 'organisateur',
    status: 'active',
    orgStatus: 'pending',
  })

  const app = new Application({ userId: String(user._id), type: 'organisateur', status: 'draft' })
  const docsResult = await uploadApplicationDocuments(String(user._id), String(app._id), input.documents)
  if (!docsResult.ok) {
    // Rollback : ne jamais laisser un compte orphelin sans candidature si
    // l'upload échoue en cours de route.
    await User.deleteOne({ _id: user._id })
    return docsResult
  }

  app.formData = input.formData
  app.documents = new Map(Object.entries(docsResult.documents)) as typeof app.documents
  app.candidateNote = input.candidateNote ?? ''
  app.status = 'submitted'
  app.submittedAt = new Date()
  app.auditLog.push({ action: 'submitted', by: String(user._id), byName: input.formData.nomCommercial || '', at: new Date(), note: input.candidateNote ?? '' })
  await app.save()

  const emailResult = await sendEmail(email, applicationReceivedEmail(email))
  if (!emailResult.ok) console.error('[registerAndSubmitOrganizerApplication] email failed for', email, emailResult.error)

  return { ok: true, application: toApplicationView(app.toObject()), userId: String(user._id) }
}
